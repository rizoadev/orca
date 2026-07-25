/**
 * Product pipeline stage advancement after worker_done.
 */

import type { OrchestrationDb } from './db'
import type { TaskRow } from './types'
import {
  buildRoleTaskSpec,
  parsePipelineVerdict,
  PRODUCT_PIPELINE_MAX_REWORK
} from '../../../shared/product-pipeline'
import {
  parseAutopilotDirective,
  parseRootAutopilotFlag,
  withRootAutopilotFlag
} from '../../../shared/orchestration-autopilot'
import { maybeSpawnAutopilotManagerLoop } from './product-pipeline-autopilot'

type LogFn = (msg: string) => void

function parseResultBody(result: string | null): string {
  if (!result) {
    return ''
  }
  try {
    const parsed = JSON.parse(result) as { body?: unknown; subject?: unknown }
    const body = typeof parsed.body === 'string' ? parsed.body : ''
    const subject = typeof parsed.subject === 'string' ? parsed.subject : ''
    return [subject, body].filter(Boolean).join('\n')
  } catch {
    return result
  }
}

function stageTasks(tasks: TaskRow[], stage: string): TaskRow[] {
  return tasks.filter((task) => task.pipeline_stage === stage)
}

function extractGoalFromRoot(root: TaskRow): string {
  const lines = root.spec.split('\n')
  const startIdx = lines.findIndex((line) => line.trim() === 'PRODUCT PIPELINE ROOT')
  if (startIdx >= 0) {
    const body = lines
      .slice(startIdx + 1)
      .join('\n')
      .replace(/Stages:[\s\S]*$/m, '')
      .trim()
    if (body) {
      return body
    }
  }
  return root.spec
}

/**
 * After a stage task completes, either open the next stage, rework implement, or finish.
 * Called from worker_done reconciliation.
 */
export function advanceProductPipelineAfterTaskComplete(
  db: OrchestrationDb,
  completedTaskId: string,
  onLog: LogFn = () => {}
): void {
  const completed = db.getTask(completedTaskId)
  if (!completed?.pipeline_id || !completed.pipeline_stage || !completed.pipeline_role) {
    return
  }
  if (completed.pipeline_stage === 'done' || completed.id === completed.pipeline_id) {
    return
  }

  const root = db.getTask(completed.pipeline_id)
  if (!root) {
    return
  }
  const productGoal = extractGoalFromRoot(root)
  const pipelineTasks = db.listTasksByPipeline(root.id)
  const attempt = completed.pipeline_attempt ?? 1
  const body = parseResultBody(completed.result)
  const stage = completed.pipeline_stage

  const autopilot = parseRootAutopilotFlag(root.result)

  if (stage === 'manage' || stage === 'research' || stage === 'implement') {
    onLog(`Pipeline ${root.id}: ${stage} complete (attempt ${attempt})`)
    // Manager FAIL (needs human) escalates product to failed with the question body.
    if (stage === 'manage') {
      const verdict = parsePipelineVerdict(body)
      const directive = parseAutopilotDirective(body)
      if (verdict === 'fail') {
        db.setTaskPipelineMeta(root.id, {
          pipelineStage: 'failed',
          status: 'failed',
          result: withRootAutopilotFlag(
            JSON.stringify({
              kind: 'product_blocked_on_operator',
              summary: body
            }),
            autopilot
          )
        })
        try {
          db.addTaskComment({
            taskId: root.id,
            author: 'system',
            kind: 'system',
            role: 'manager',
            body: `Manager blocked on operator input: ${body.slice(0, 500)}`
          })
        } catch {
          // optional
        }
        onLog(`Pipeline ${root.id}: BLOCKED on operator (manager FAIL)`)
        return
      }
      if (autopilot && directive === 'done') {
        db.setTaskPipelineMeta(root.id, {
          pipelineStage: 'done',
          status: 'completed',
          result: withRootAutopilotFlag(
            JSON.stringify({ kind: 'product_complete', summary: body, autopilotDone: true }),
            true
          )
        })
        try {
          db.addTaskComment({
            taskId: root.id,
            author: 'system',
            kind: 'system',
            role: 'manager',
            body: 'Autopilot: manager marked DONE (no further automated wave).'
          })
        } catch {
          // optional
        }
        onLog(`Pipeline ${root.id}: AUTOPILOT DONE via manager`)
        return
      }
    }

    // Fully autopilot: residual TODOs / idle handoffs loop back to manager for the next wave.
    if (autopilot && stage !== 'manage') {
      maybeSpawnAutopilotManagerLoop({
        db,
        root,
        productGoal,
        completed,
        body,
        pipelineTasks,
        onLog
      })
    }
    return
  }

  if (stage !== 'test' && stage !== 'review') {
    return
  }

  const verdict = parsePipelineVerdict(body)
  onLog(`Pipeline ${root.id}: ${stage} verdict=${verdict} (attempt ${attempt})`)

  // Fail-open on unknown so a terse summary without VERDICT: PASS does not deadlock the product.
  if (verdict === 'pass' || verdict === 'unknown') {
    if (stage === 'review') {
      if (autopilot) {
        const continued = maybeSpawnAutopilotManagerLoop({
          db,
          root,
          productGoal,
          completed,
          body,
          pipelineTasks,
          onLog
        })
        if (continued) {
          return
        }
      }
      db.setTaskPipelineMeta(root.id, {
        pipelineStage: 'done',
        status: 'completed',
        result: withRootAutopilotFlag(
          JSON.stringify({ kind: 'product_complete', summary: body }),
          autopilot
        )
      })
      onLog(`Pipeline ${root.id}: PRODUCT COMPLETE`)
    } else if (autopilot) {
      maybeSpawnAutopilotManagerLoop({
        db,
        root,
        productGoal,
        completed,
        body,
        pipelineTasks,
        onLog
      })
    }
    return
  }

  // FAIL → rework implement + retest (+ rereview if failed at review)
  if (attempt >= PRODUCT_PIPELINE_MAX_REWORK) {
    db.setTaskPipelineMeta(root.id, {
      pipelineStage: 'failed',
      status: 'failed',
      result: JSON.stringify({
        kind: 'product_failed',
        reason: `Max rework attempts (${PRODUCT_PIPELINE_MAX_REWORK}) exceeded`
      })
    })
    onLog(`Pipeline ${root.id}: FAILED after ${attempt} attempts`)
    return
  }

  const nextAttempt = attempt + 1
  const researchSummary = stageTasks(pipelineTasks, 'research')
    .map((t) => parseResultBody(t.result))
    .filter(Boolean)
    .join('\n\n')

  const reworkImplement = db.createTask({
    spec: buildRoleTaskSpec({
      role: 'implementer',
      productGoal,
      stage: 'implement',
      attempt: nextAttempt,
      priorFeedback: body,
      researchSummary
    }),
    taskTitle: `Implement rework #${nextAttempt}: ${root.display_name || root.task_title || 'goal'}`.slice(
      0,
      120
    ),
    displayName: `Implement rework #${nextAttempt}`.slice(0, 120),
    parentId: root.id,
    priority: 'high',
    repoId: root.repo_id ?? undefined,
    worktreeId: root.worktree_id ?? undefined,
    hostId: root.host_id ?? 'local',
    pipelineId: root.id,
    pipelineStage: 'implement',
    pipelineRole: 'implementer',
    pipelineAttempt: nextAttempt
  })

  const reworkTest = db.createTask({
    spec: buildRoleTaskSpec({
      role: 'tester',
      productGoal,
      stage: 'test',
      attempt: nextAttempt,
      researchSummary
    }),
    taskTitle: `Test rework #${nextAttempt}`.slice(0, 120),
    displayName: `Test rework #${nextAttempt}`.slice(0, 120),
    deps: [reworkImplement.id],
    parentId: root.id,
    priority: 'high',
    repoId: root.repo_id ?? undefined,
    worktreeId: root.worktree_id ?? undefined,
    hostId: root.host_id ?? 'local',
    pipelineId: root.id,
    pipelineStage: 'test',
    pipelineRole: 'tester',
    pipelineAttempt: nextAttempt
  })

  if (stage === 'review') {
    db.createTask({
      spec: buildRoleTaskSpec({
        role: 'reviewer',
        productGoal,
        stage: 'review',
        attempt: nextAttempt
      }),
      taskTitle: `Review rework #${nextAttempt}`.slice(0, 120),
      displayName: `Review rework #${nextAttempt}`.slice(0, 120),
      deps: [reworkTest.id],
      parentId: root.id,
      priority: 'high',
      repoId: root.repo_id ?? undefined,
      worktreeId: root.worktree_id ?? undefined,
      hostId: root.host_id ?? 'local',
      pipelineId: root.id,
      pipelineStage: 'review',
      pipelineRole: 'reviewer',
      pipelineAttempt: nextAttempt
    })
  }

  onLog(
    `Pipeline ${root.id}: rework implement=${reworkImplement.id} test=${reworkTest.id} attempt=${nextAttempt}`
  )
}

export {
  setProductPipelineAutopilot,
  isProductPipelineAutopilotEnabled,
  maybeSpawnAutopilotManagerLoop
} from './product-pipeline-autopilot'



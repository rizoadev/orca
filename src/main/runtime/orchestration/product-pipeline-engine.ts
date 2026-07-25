/**
 * Product pipeline engine — multi-role loop over orchestration tasks.
 *
 * manage → research → implement → test → (fail → rework implement) → review → done
 * Root task holds the product goal; children are role stages.
 * Manager is the operator-facing planner; supervisor self-heals hung/LLM failures.
 */

import type { OrchestrationDb } from './db'
import type { TaskPriority, TaskRow } from './types'
import {
  buildProductPipelinePlan,
  buildRoleTaskSpec,
  parsePipelineVerdict,
  PRODUCT_PIPELINE_MAX_REWORK,
  type ProductPipelineRole
} from '../../../shared/product-pipeline'
import {
  buildManagerAutopilotSpec,
  extractOpenTodosFromAgentOutput,
  parseAutopilotDirective,
  parseRootAutopilotFlag,
  shouldAutopilotContinue,
  withRootAutopilotFlag
} from '../../../shared/orchestration-autopilot'

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
  const start = lines.findIndex((line) => line.trim() === 'PRODUCT PIPELINE ROOT')
  if (start >= 0) {
    const body = lines
      .slice(start + 1)
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
 * Create the product-pipeline DAG under a root goal task.
 * Root is completed bookkeeping; only stage children stay active for dispatch.
 */
export function createProductPipelineTasks(
  db: OrchestrationDb,
  args: {
    productGoal: string
    title?: string
    repoId?: string
    worktreeId?: string
    hostId?: string
    createdByTerminalHandle?: string
    priority?: TaskPriority
  }
): { root: TaskRow; stages: TaskRow[] } {
  const title = args.title?.trim() || args.productGoal.trim().slice(0, 80)
  const root = db.createTask({
    spec: [
      'PRODUCT PIPELINE ROOT',
      '',
      args.productGoal.trim(),
      '',
      'Stages: manage → research → implement → test → review (with rework + self-heal).',
      'Talk to the manager role; supervisor advances stages and heals hung/LLM failures.'
    ].join('\n'),
    taskTitle: title,
    displayName: title,
    priority: args.priority ?? 'high',
    repoId: args.repoId,
    worktreeId: args.worktreeId,
    hostId: args.hostId ?? 'local',
    createdByTerminalHandle: args.createdByTerminalHandle,
    pipelineStage: 'done',
    pipelineRole: 'implementer',
    pipelineAttempt: 1
  })

  // Why: root status=completed is bookkeeping (not a worker stage); pipeline_stage stays
  // 'running' until review PASS so the supervisor does not treat the product as finished.
  db.setTaskPipelineMeta(root.id, {
    pipelineId: root.id,
    pipelineStage: 'running',
    pipelineRole: 'implementer',
    pipelineAttempt: 1,
    status: 'completed',
    result: JSON.stringify({ kind: 'product_pipeline_root', goal: args.productGoal.trim() })
  })

  const plan = buildProductPipelinePlan()
  const stageIdByKey = new Map<string, string>()
  const stages: TaskRow[] = []

  for (const step of plan) {
    const deps = step.dependsOnStages
      .map((stage) => stageIdByKey.get(stage))
      .filter((id): id is string => typeof id === 'string')
    const roleSpec = buildRoleTaskSpec({
      role: step.role,
      productGoal: args.productGoal,
      stage: step.stage,
      attempt: 1
    })
    const child = db.createTask({
      spec: roleSpec,
      taskTitle: `${step.title}: ${title}`.slice(0, 120),
      displayName: `${step.title}: ${title}`.slice(0, 120),
      deps,
      parentId: root.id,
      priority: args.priority ?? 'high',
      repoId: args.repoId,
      worktreeId: args.worktreeId,
      hostId: args.hostId ?? 'local',
      createdByTerminalHandle: args.createdByTerminalHandle,
      pipelineId: root.id,
      pipelineStage: step.stage,
      pipelineRole: step.role,
      pipelineAttempt: 1
    })
    stageIdByKey.set(step.stage, child.id)
    stages.push(child)
  }

  return {
    root: db.getTask(root.id)!,
    stages: stages.map((s) => db.getTask(s.id)!).filter(Boolean)
  }
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

/**
 * When autopilot is on and a worker leaves residual TODOs / idle handoff,
 * spawn a manager iteration so the loop continues without operator prompting.
 * Returns true if a manager task was created.
 */
function maybeSpawnAutopilotManagerLoop(input: {
  db: OrchestrationDb
  root: TaskRow
  productGoal: string
  completed: TaskRow
  body: string
  pipelineTasks: TaskRow[]
  onLog: LogFn
}): boolean {
  const extracted = extractOpenTodosFromAgentOutput(input.body)
  if (
    !shouldAutopilotContinue({
      autopilotEnabled: true,
      extracted,
      stage: input.completed.pipeline_stage
    })
  ) {
    return false
  }

  // Avoid stacking multiple ready/dispatched manager waves for the same root.
  const activeManager = input.pipelineTasks.find(
    (t) =>
      t.pipeline_role === 'manager' &&
      t.id !== input.completed.id &&
      (t.status === 'ready' || t.status === 'dispatched' || t.status === 'pending')
  )
  if (activeManager) {
    input.onLog(
      `Pipeline ${input.root.id}: autopilot skip — manager ${activeManager.id} already active`
    )
    return false
  }

  const priorManagerAttempts = input.pipelineTasks.filter((t) => t.pipeline_role === 'manager')
  const nextAttempt =
    Math.max(0, ...priorManagerAttempts.map((t) => t.pipeline_attempt ?? 1), 0) + 1

  const manager = input.db.createTask({
    spec: buildManagerAutopilotSpec({
      productGoal: input.productGoal,
      attempt: nextAttempt,
      todos: extracted.todos,
      sourceStage: input.completed.pipeline_stage || 'unknown',
      sourceSummary: extracted.excerpt || input.body
    }),
    taskTitle: `Autopilot manager #${nextAttempt}`.slice(0, 120),
    displayName: `Autopilot manager #${nextAttempt}`.slice(0, 120),
    parentId: input.root.id,
    priority: 'high',
    repoId: input.root.repo_id ?? undefined,
    worktreeId: input.root.worktree_id ?? undefined,
    hostId: input.root.host_id ?? 'local',
    pipelineId: input.root.id,
    pipelineStage: 'manage',
    pipelineRole: 'manager',
    pipelineAttempt: nextAttempt
  })

  // Keep root running so supervisor continues dispatching.
  input.db.setTaskPipelineMeta(input.root.id, {
    pipelineStage: 'running',
    status: 'completed',
    result: withRootAutopilotFlag(input.root.result, true, input.productGoal)
  })

  try {
    input.db.addTaskComment({
      taskId: input.root.id,
      author: 'system',
      kind: 'system',
      role: 'manager',
      body:
        extracted.todos.length > 0
          ? `Autopilot: folded ${extracted.todos.length} residual TODO(s) into manager ${manager.id}`
          : `Autopilot: idle handoff from ${input.completed.pipeline_stage} → manager ${manager.id}`
    })
    input.db.addTaskComment({
      taskId: manager.id,
      author: 'system',
      kind: 'system',
      role: 'manager',
      body: extracted.excerpt.slice(0, 1500)
    })
  } catch {
    // optional
  }

  input.onLog(
    `Pipeline ${input.root.id}: AUTOPILOT manager wave ${manager.id} (todos=${extracted.todos.length})`
  )
  return true
}

/** Operator toggle: fully autopilot residual-TODO loops through the manager. */
export function setProductPipelineAutopilot(
  db: OrchestrationDb,
  pipelineId: string,
  enabled: boolean
): TaskRow | undefined {
  const root = db.getTask(pipelineId)
  if (!root || root.pipeline_id !== root.id) {
    return undefined
  }
  const goal = extractGoalFromRoot(root)
  const nextResult = withRootAutopilotFlag(root.result, enabled, goal)
  db.setTaskPipelineMeta(root.id, {
    result: nextResult,
    // Keep non-terminal products running when enabling autopilot mid-flight.
    ...(enabled && root.pipeline_stage === 'done'
      ? {}
      : enabled
        ? { pipelineStage: root.pipeline_stage === 'failed' ? 'running' : root.pipeline_stage }
        : {})
  })
  try {
    db.addTaskComment({
      taskId: root.id,
      author: 'system',
      kind: 'system',
      role: 'manager',
      body: enabled
        ? 'Autopilot ON — residual agent TODOs will loop back to the manager automatically.'
        : 'Autopilot OFF — residual TODOs will not auto-spawn manager waves.'
    })
  } catch {
    // optional
  }
  return db.getTask(root.id)
}

export function isProductPipelineAutopilotEnabled(root: TaskRow | undefined): boolean {
  return parseRootAutopilotFlag(root?.result)
}

export function listReadyPipelineTasks(db: OrchestrationDb, pipelineId: string): TaskRow[] {
  return db.listTasksByPipeline(pipelineId).filter((task) => task.status === 'ready')
}

export type PipelineRoleBinding = {
  role: ProductPipelineRole
  squadId: string
  defaultAgent: string
}

/** Map pipeline roles to squad ids (Settings agentSquads) with fallbacks. */
export function defaultRoleBindings(): PipelineRoleBinding[] {
  return [
    { role: 'manager', squadId: 'manager', defaultAgent: 'pi' },
    { role: 'researcher', squadId: 'researcher', defaultAgent: 'pi' },
    { role: 'implementer', squadId: 'backend', defaultAgent: 'pi' },
    { role: 'tester', squadId: 'tester', defaultAgent: 'pi' },
    { role: 'reviewer', squadId: 'reviewer', defaultAgent: 'pi' }
  ]
}

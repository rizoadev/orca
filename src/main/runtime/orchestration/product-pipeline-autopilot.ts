/**
 * Autopilot manager-wave spawning for product pipelines.
 */

import type { OrchestrationDb } from './db'
import type { TaskRow } from './types'
import {
  buildManagerAutopilotSpec,
  extractOpenTodosFromAgentOutput,
  parseRootAutopilotFlag,
  shouldAutopilotContinue,
  withRootAutopilotFlag
} from '../../../shared/orchestration-autopilot'

type LogFn = (msg: string) => void

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
 * When autopilot is on and a worker leaves residual TODOs / idle handoff,
 * spawn a manager iteration so the loop continues without operator prompting.
 * Returns true if a manager task was created.
 */
export function maybeSpawnAutopilotManagerLoop(input: {
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


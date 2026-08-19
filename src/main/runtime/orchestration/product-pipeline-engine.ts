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
  type ProductPipelineRole
} from '../../../shared/product-pipeline'
import { withRootAutopilotFlag } from '../../../shared/orchestration-autopilot'

export { advanceProductPipelineAfterTaskComplete } from './product-pipeline-advance'
export {
  setProductPipelineAutopilot,
  isProductPipelineAutopilotEnabled,
  maybeSpawnAutopilotManagerLoop
} from './product-pipeline-autopilot'

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
    // Why: autopilot is on by default so the manager loop keeps advancing
    // residual TODOs without an operator; the toggle in task detail can turn it off.
    result: withRootAutopilotFlag(
      JSON.stringify({ kind: 'product_pipeline_root', goal: args.productGoal.trim() }),
      true
    )
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
 * Plan-only pipeline: root + a single research stage. The research agent
 * produces a SUBTASK BREAKDOWN (commit 976d025c6) which the UI surfaces as a
 * draft checklist before the operator creates the real subtasks.
 */
export function createProductPlanTasks(
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
): { root: TaskRow; research: TaskRow } {
  const title = args.title?.trim() || args.productGoal.trim().slice(0, 80)
  const root = db.createTask({
    spec: [
      'PRODUCT PIPELINE ROOT',
      '',
      args.productGoal.trim(),
      '',
      'Plan-only: research generates a subtask breakdown; operator approves before creating real subtasks.'
    ].join('\n'),
    taskTitle: title,
    displayName: title,
    priority: args.priority ?? 'high',
    repoId: args.repoId,
    worktreeId: args.worktreeId,
    hostId: args.hostId ?? 'local',
    createdByTerminalHandle: args.createdByTerminalHandle,
    pipelineStage: 'running',
    pipelineRole: 'implementer',
    pipelineAttempt: 1
  })

  // Why: root's pipeline_id must point at itself, otherwise productWatch /
  // productTick reject it with "Unknown product pipeline". The full-pipeline
  // variant sets this in a follow-up meta update; plan-only must too.
  db.setTaskPipelineMeta(root.id, {
    pipelineId: root.id,
    pipelineStage: 'running',
    pipelineRole: 'implementer',
    pipelineAttempt: 1
  })

  const researchSpec = buildRoleTaskSpec({
    role: 'researcher',
    productGoal: args.productGoal,
    stage: 'research',
    attempt: 1
  })
  const research = db.createTask({
    spec: researchSpec,
    taskTitle: `Research: ${title}`.slice(0, 120),
    displayName: `Research: ${title}`.slice(0, 120),
    parentId: root.id,
    priority: args.priority ?? 'high',
    repoId: args.repoId,
    worktreeId: args.worktreeId,
    hostId: args.hostId ?? 'local',
    createdByTerminalHandle: args.createdByTerminalHandle,
    pipelineId: root.id,
    pipelineStage: 'research',
    pipelineRole: 'researcher',
    pipelineAttempt: 1
  })

  return { root: db.getTask(root.id)!, research: db.getTask(research.id)! }
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

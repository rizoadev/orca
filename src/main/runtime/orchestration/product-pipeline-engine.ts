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
  setProductPipelineAutopilot,
  isProductPipelineAutopilotEnabled
} from './product-pipeline-autopilot'

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

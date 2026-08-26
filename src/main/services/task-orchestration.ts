// Why: turns a PM task (e.g. a Circle issue) into a real orca orchestration
// task. We create a product-pipeline root with a research child, then switch on
// autopilot — orca's manager loop then dispatches a dedicated agent per task,
// which is exactly the "orchestration handles each task" behavior.
import type { OrchestrationDb } from '../runtime/orchestration/db'
import { createProductPlanTasks } from '../runtime/orchestration/product-pipeline-engine'
import { setProductPipelineAutopilot } from '../runtime/orchestration/product-pipeline-autopilot'
import type {
  TaskOrchestrationSpawnRequest,
  TaskOrchestrationSpawnResult
} from '../../shared/task-orchestration-types'

export function spawnTaskAgent(
  db: OrchestrationDb,
  req: TaskOrchestrationSpawnRequest
): TaskOrchestrationSpawnResult {
  const { root, research } = createProductPlanTasks(db, {
    productGoal: req.spec,
    title: req.title,
    repoId: req.repoId ?? undefined,
    worktreeId: req.worktreeId ?? undefined,
    hostId: req.hostId ?? undefined,
    priority: req.priority ? (req.priority as never) : undefined
  })

  // Autopilot ON = residual TODOs loop to the manager and dedicated agents are
  // dispatched per task. This is the seam that actually spawns the worker agent.
  if (req.autopilot !== false) {
    setProductPipelineAutopilot(db, root.id, true)
  }

  return {
    taskId: root.id,
    pipelineId: root.id,
    researchTaskId: research.id,
    dispatchId: null,
    status: root.status
  }
}

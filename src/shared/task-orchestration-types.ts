// Why: shared contract between the Circle (or any PM UI) adapter and orca's
// task-orchestration service. Each PM task becomes an orca product pipeline
// root + autopilot, so a dedicated agent is dispatched to work it.

export const TASK_ORCHESTRATION_IPC = {
  spawn: 'task-orchestration:spawn'
} as const

export type TaskOrchestrationPriority = 'low' | 'medium' | 'high' | 'urgent' | string | null

export type TaskOrchestrationSpawnRequest = {
  /** Short human title shown in the board (maps to task_title). */
  title: string
  /** The work to perform (maps to the product pipeline goal / spec). */
  spec: string
  priority?: TaskOrchestrationPriority
  worktreeId?: string | null
  hostId?: string | null
  repoId?: string | null
  projectId?: string | null
  /** When true, enable product-pipeline autopilot so a dedicated agent is spawned. */
  autopilot?: boolean
}

export type TaskOrchestrationSpawnResult = {
  taskId: string
  pipelineId: string
  researchTaskId?: string
  dispatchId?: string | null
  status: string
}

/** Coarse progress phase a PM UI can map onto its own board columns. */
export type TaskOrchestrationPhase = 'todo' | 'in-progress' | 'blocked' | 'done' | 'failed'

export type TaskOrchestrationSubtaskCounts = {
  total: number
  active: number
  completed: number
  failed: number
  blocked: number
}

export type TaskOrchestrationStatusResult = {
  taskId: string
  status: string
  phase: TaskOrchestrationPhase
  subtasks: TaskOrchestrationSubtaskCounts
}

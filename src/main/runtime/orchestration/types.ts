export type MessageType =
  | 'status'
  | 'dispatch'
  | 'worker_done'
  | 'merge_ready'
  | 'escalation'
  | 'handoff'
  | 'decision_gate'
  | 'heartbeat'

export type MessagePriority = 'normal' | 'high' | 'urgent'

export type TaskStatus = 'pending' | 'ready' | 'dispatched' | 'completed' | 'failed' | 'blocked'

/** Operator priority for queue ordering; independent of message priority. */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export type DispatchStatus = 'pending' | 'dispatched' | 'completed' | 'failed' | 'circuit_broken'

export type GateStatus = 'pending' | 'resolved' | 'timeout'

export type CoordinatorStatus = 'idle' | 'running' | 'completed' | 'failed'

export type MessageRow = {
  id: string
  from_handle: string
  to_handle: string
  subject: string
  body: string
  type: MessageType
  priority: MessagePriority
  thread_id: string | null
  payload: string | null
  read: number
  sequence: number
  created_at: string
  delivered_at: string | null
  sender_pane_key: string | null
}

export type TaskRow = {
  id: string
  parent_id: string | null
  created_by_terminal_handle: string | null
  task_title: string | null
  display_name: string | null
  spec: string
  status: TaskStatus
  /** Queue priority (v7). Older rows default to medium via migration/read path. */
  priority: TaskPriority
  /** Soft link to Orca repo identity — stable subject of work, not a storage root. */
  repo_id: string | null
  /** Soft link to Orca project when multi-repo projects are in play. */
  project_id: string | null
  /** Mutable execution surface; may be rebound when a worktree is deleted/replaced. */
  worktree_id: string | null
  /** local | ssh provider id | wsl distro key — where the work runs. */
  host_id: string | null
  /** Product-pipeline root id (v8). Children share the root; root has pipeline_id = self. */
  pipeline_id: string | null
  /** research | implement | test | review | done | failed */
  pipeline_stage: string | null
  /** researcher | implementer | tester | reviewer */
  pipeline_role: string | null
  /** Rework attempt number for implement/test loops (starts at 1). */
  pipeline_attempt: number | null
  deps: string
  result: string | null
  created_at: string
  completed_at: string | null
}

export type DispatchContextRow = {
  id: string
  task_id: string
  assignee_handle: string | null
  assignee_pane_key: string | null
  status: DispatchStatus
  failure_count: number
  last_failure: string | null
  dispatched_at: string | null
  completed_at: string | null
  created_at: string
  last_heartbeat_at: string | null
}

export type DecisionGateRow = {
  id: string
  task_id: string
  question: string
  options: string
  status: GateStatus
  resolution: string | null
  created_at: string
  resolved_at: string | null
}

export type CoordinatorRun = {
  id: string
  spec: string
  status: CoordinatorStatus
  coordinator_handle: string
  poll_interval_ms: number
  created_at: string
  completed_at: string | null
}

/** Task discussion / system events (Multica-style comments). */
export type TaskCommentKind = 'comment' | 'result' | 'system' | 'dispatch'

export type TaskCommentRow = {
  id: string
  task_id: string
  author: string
  role: string | null
  kind: TaskCommentKind
  body: string
  parent_id: string | null
  created_at: string
}

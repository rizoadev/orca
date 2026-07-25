/**
 * Resolve live AI agents currently working a specific orchestration task.
 * Uses agent-status hooks + runtime orchestration context (not title inference).
 */
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { OrchestrationBoardInCharge, OrchestrationBoardRosterRow } from './orchestration-board-model'

export type OrchestrationTaskRunningAgent = {
  paneKey: string
  agentType: string
  model?: string
  state: string
  handle?: string
  toolName?: string
  promptPreview?: string
}

export function collectOrchestrationTaskRunningAgents(input: {
  taskId: string
  pipelineId?: string | null
  /** Known dispatch/assignee handles for this task (board row + thread). */
  assigneeHandles?: Array<string | null | undefined> | null
  roster?: OrchestrationBoardRosterRow[] | null
  inCharge?: OrchestrationBoardInCharge | null
  agentStatusByPaneKey: Record<string, AgentStatusEntry>
  runtimeAgentOrchestrationByPaneKey?: Record<
    string,
    NonNullable<AgentStatusEntry['orchestration']>
  >
}): OrchestrationTaskRunningAgent[] {
  const taskIds = new Set<string>([input.taskId])
  for (const row of input.roster ?? []) {
    if (row.taskId) {
      taskIds.add(row.taskId)
    }
  }
  if (input.pipelineId) {
    taskIds.add(input.pipelineId)
  }

  const handles = new Set<string>()
  if (input.inCharge?.handle) {
    handles.add(input.inCharge.handle)
  }
  for (const handle of input.assigneeHandles ?? []) {
    if (handle?.trim()) {
      handles.add(handle.trim())
    }
  }
  for (const row of input.roster ?? []) {
    if (row.assignee) {
      handles.add(row.assignee)
    }
  }

  const out: OrchestrationTaskRunningAgent[] = []
  const seen = new Set<string>()

  const consider = (paneKey: string, entry: AgentStatusEntry): void => {
    if (entry.state === 'done') {
      return
    }
    // Live work signals only.
    if (entry.state !== 'working' && entry.state !== 'blocked' && entry.state !== 'waiting') {
      return
    }
    const orch =
      entry.orchestration ??
      input.runtimeAgentOrchestrationByPaneKey?.[paneKey] ??
      null
    const matchTask = Boolean(orch?.taskId && taskIds.has(orch.taskId))
    // Why: in-charge/assignee handle is enough even when hook orchestration context is stale/missing.
    const matchHandle = Boolean(
      entry.terminalHandle && handles.has(entry.terminalHandle)
    )
    if (!matchTask && !matchHandle) {
      return
    }
    const key = entry.terminalHandle || paneKey
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    out.push({
      paneKey,
      agentType: entry.agentType || 'agent',
      model: entry.model,
      state: entry.state,
      handle: entry.terminalHandle,
      toolName: entry.toolName,
      promptPreview: entry.prompt?.trim() ? entry.prompt.trim().slice(0, 80) : undefined
    })
  }

  for (const [paneKey, entry] of Object.entries(input.agentStatusByPaneKey)) {
    consider(paneKey, entry)
  }

  // Prefer working first, then blocked/waiting.
  const rank = (state: string): number =>
    state === 'working' ? 0 : state === 'blocked' ? 1 : state === 'waiting' ? 2 : 3
  out.sort((a, b) => rank(a.state) - rank(b.state) || a.agentType.localeCompare(b.agentType))
  return out
}

export function summarizeRunningAgents(agents: readonly OrchestrationTaskRunningAgent[]): {
  workingCount: number
  total: number
  agentTypes: string[]
} {
  const workingCount = agents.filter((a) => a.state === 'working').length
  const types = [...new Set(agents.map((a) => a.agentType))]
  return { workingCount, total: agents.length, agentTypes: types }
}

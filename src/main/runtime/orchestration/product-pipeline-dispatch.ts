/**
 * Dispatch a ready pipeline stage task to its role agent (spawn if needed).
 * Shared by product.start / product.tick and manual board assign.
 */

import type { OrchestrationDb } from './db'
import type { TaskRow } from './types'
import { buildDispatchPreamble } from './preamble'
import { defaultRoleBindings } from './product-pipeline-engine'
import { runPiRpcDraftTask } from './pi-rpc-task-runner'
import { resolveAgentForRole } from './resolve-pipeline-role-agent'
import type { ProductPipelineRole } from '../../../shared/product-pipeline'
import type { RuntimeTerminalWaitCondition } from '../../../shared/runtime-types'
import type { TuiAgent } from '../../../shared/types'

export type ProductDispatchRuntime = {
  getClientSettings: () => { agentSquads?: unknown; defaultTuiAgent?: string | null }
  listTerminals: (
    worktreeSelector?: string
  ) => Promise<{ terminals: { handle: string; title: string | null }[] }>
  launchAgentTerminal: (
    worktreeSelector: string,
    opts: { agent: TuiAgent; prompt: string; title?: string; cli?: string }
  ) => Promise<{ handle: string }>
  waitForTerminal: (
    handle: string,
    options?: {
      condition?: RuntimeTerminalWaitCondition
      timeoutMs?: number
      signal?: AbortSignal
    }
  ) => Promise<unknown>
  isTerminalRunningAgent: (handle: string) => Promise<boolean>
  getTerminalPaneKey: (handle: string) => string | null
  getTerminalOrchestrationCliCommand: (handle: string) => 'orca' | 'orca-ide'
  sendTerminalAgentPrompt: (handle: string, prompt: string) => Promise<unknown>
  getAgentStatusForHandle: (handle: string) => string | null
  resolveWorktreePath: (worktreeId: string) => Promise<string>
  resolveRepoPath: (repoId: string) => Promise<string>
}

export async function dispatchPipelineStageTask(
  db: OrchestrationDb,
  runtime: ProductDispatchRuntime,
  task: TaskRow,
  options: {
    coordinatorHandle?: string
    waitTimeoutMs?: number
    devMode?: boolean
  } = {}
): Promise<{
  task: TaskRow
  dispatchId: string
  to: string
  spawned: boolean
  injected: boolean
  role: string
  agent: string
}> {
  if (task.status !== 'ready') {
    throw new Error(`Task ${task.id} is ${task.status}; only ready stage tasks can be dispatched`)
  }
  // Why: research (plan-only) runs headless before any worktree exists, so it
  // may have a null worktree_id. Later terminal stages still require one.
  if (!task.worktree_id && task.pipeline_stage !== 'research') {
    throw new Error(`Task ${task.id} has no worktree_id — product pipeline requires a worktree`)
  }
  const role = (task.pipeline_role || 'implementer') as ProductPipelineRole
  const attempt = Math.max(1, task.pipeline_attempt ?? 1)
  const worktreeSelector = `id:${task.worktree_id}`
  const waitTimeoutMs = options.waitTimeoutMs ?? 90_000
  const coordinatorHandle = options.coordinatorHandle ?? 'orchestrator'

  // Why: drafting runs headless via the in-process pi RPC session (JSON-style)
  // instead of a TUI terminal — the operator watches progress in the plan
  // modal, not in a terminal tab.
  if (task.pipeline_stage === 'research') {
    try {
      // Why: plan-only runs before any worktree exists, so fall back to the
      // primary repo checkout as the research cwd (research only reads).
      const cwd = task.worktree_id
        ? await runtime.resolveWorktreePath(task.worktree_id)
        : task.repo_id
          ? await runtime.resolveRepoPath(task.repo_id)
          : process.cwd()
      const { result } = await runPiRpcDraftTask({
        cwd,
        spec: task.spec,
        sessionId: task.id
      })
      db.setTaskPipelineMeta(task.id, { status: 'completed', result })
      return {
        task: db.getTask(task.id)!,
        dispatchId: `rpc:${task.id}`,
        to: 'pi-rpc',
        spawned: false,
        injected: true,
        role,
        agent: 'pi-rpc'
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      db.addTaskComment({
        taskId: task.id,
        author: 'system',
        kind: 'system',
        role,
        body: `Pi RPC research failed: ${message}`
      })
      db.setTaskPipelineMeta(task.id, { status: 'failed', result: message })
      throw new Error(`Pi RPC research failed for task ${task.id}: ${message}`)
    }
  }

  // Why: productStart lets the operator pick a manager squad; remember it on
  // the root result and prefer it here for the manage stage dispatch.
  let roleBindings = defaultRoleBindings()
  if (role === 'manager' && task.pipeline_id) {
    const root = db.getTask(task.pipeline_id)
    let managerSquadId: string | undefined
    try {
      managerSquadId = root?.result
        ? (JSON.parse(root.result) as { managerSquadId?: string }).managerSquadId
        : undefined
    } catch {
      /* keep default binding */
    }
    if (managerSquadId) {
      roleBindings = roleBindings.map((b) =>
        b.role === 'manager' ? { ...b, squadId: managerSquadId } : b
      )
    }
  }

  // Try preferred agent, then failover chain on spawn/ready failure (self-heal).
  const maxAgentTries = Math.min(3, Math.max(1, attempt + 1))
  let lastError: string | null = null
  for (let tryIndex = 1; tryIndex <= maxAgentTries; tryIndex++) {
    const resolved = resolveAgentForRole(
      role,
      runtime,
      roleBindings,
      tryIndex === 1 ? attempt : attempt + tryIndex - 1
    )
    const { agent, briefing, preferredAgent, cli, memberSystemPrompt } = resolved
    try {
      const { terminals } = await runtime.listTerminals(worktreeSelector)
      let targetHandle: string | undefined
      for (const terminal of terminals) {
        try {
          if (await runtime.isTerminalRunningAgent(terminal.handle)) {
            const title = (terminal.title || '').toLowerCase()
            if (title.includes(agent) || terminals.length === 1) {
              targetHandle = terminal.handle
              break
            }
            targetHandle = targetHandle ?? terminal.handle
          }
        } catch {
          // ignore stale
        }
      }

      let spawned = false
      if (!targetHandle) {
        const created = await runtime.launchAgentTerminal(worktreeSelector, {
          agent,
          prompt: '',
          title: `${role}: ${task.display_name || task.task_title || task.id}`.slice(0, 60),
          ...(cli ? { cli } : {})
        })
        targetHandle = created.handle
        spawned = true
      }

      const deadline = Date.now() + waitTimeoutMs
      try {
        await runtime.waitForTerminal(targetHandle, {
          condition: 'tui-idle',
          timeoutMs: Math.min(waitTimeoutMs, 45_000)
        })
      } catch {
        // continue probing
      }
      while (Date.now() < deadline) {
        try {
          if (await runtime.isTerminalRunningAgent(targetHandle)) {
            break
          }
        } catch {
          // retry
        }
        await new Promise((r) => setTimeout(r, 500))
      }
      if (!(await runtime.isTerminalRunningAgent(targetHandle).catch(() => false))) {
        throw new Error(
          `Spawned/selected terminal ${targetHandle} never became a recognized ${agent} agent within ${waitTimeoutMs}ms`
        )
      }

      // Task may have been left ready after a failed prior try; ensure still ready.
      const live = db.getTask(task.id)
      if (!live || live.status !== 'ready') {
        throw new Error(`Task ${task.id} is no longer ready for dispatch`)
      }

      // Snapshot resume fields before createDispatchContext flips status.
      const resumeSource = db.getTask(task.id)
      const priorDispatch = db.getLatestTerminalDispatch(task.id)
      const ctx = db.createDispatchContext(
        task.id,
        targetHandle,
        runtime.getTerminalPaneKey(targetHandle) ?? undefined
      )
      const preamble = buildDispatchPreamble({
        taskId: task.id,
        dispatchId: ctx.id,
        taskSpec: memberSystemPrompt ? `${memberSystemPrompt.trim()}\n\n${task.spec}` : task.spec,
        coordinatorHandle,
        workerHandle: targetHandle,
        devMode: options.devMode,
        cliCommand: runtime.getTerminalOrchestrationCliCommand(targetHandle),
        ...(briefing ? { squadBriefing: briefing } : {}),
        resumeContext: {
          attempt: resumeSource?.pipeline_attempt ?? attempt,
          lastFailure: priorDispatch?.last_failure ?? null,
          previousResult: resumeSource?.result ?? null
        }
      })
      await runtime.sendTerminalAgentPrompt(targetHandle, preamble)

      if (agent !== preferredAgent || tryIndex > 1) {
        try {
          db.addTaskComment({
            taskId: task.id,
            author: 'system',
            kind: 'system',
            role,
            body: `Self-heal dispatch using agent ${agent} (preferred ${preferredAgent}, try ${tryIndex})`
          })
        } catch {
          // optional
        }
      }

      return {
        task: db.getTask(task.id)!,
        dispatchId: ctx.id,
        to: targetHandle,
        spawned,
        injected: true,
        role,
        agent
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      try {
        db.addTaskComment({
          taskId: task.id,
          author: 'system',
          kind: 'system',
          role,
          body: `Dispatch try ${tryIndex} failed for agent ${resolved.agent}: ${lastError}`
        })
      } catch {
        // optional
      }
      // Ensure task is ready for the next agent try.
      if (db.getTask(task.id)?.status !== 'ready') {
        db.reopenTask(task.id)
      }
    }
  }

  throw new Error(lastError || `Failed to dispatch stage task ${task.id}`)
}

/** Dispatch every ready pipeline stage task (research first, then unlocked stages). */
export async function dispatchAllReadyPipelineStages(
  db: OrchestrationDb,
  runtime: ProductDispatchRuntime,
  pipelineId: string,
  options?: { coordinatorHandle?: string; waitTimeoutMs?: number; devMode?: boolean }
): Promise<
  {
    taskId: string
    to: string
    role: string
    spawned: boolean
  }[]
> {
  const ready = db
    .listTasksByPipeline(pipelineId)
    .filter(
      (task) => task.status === 'ready' && task.pipeline_stage && task.pipeline_stage !== 'done'
    )
  // Stable order: manage → research → implement → test → review
  const order = ['manage', 'research', 'implement', 'test', 'review']
  ready.sort((a, b) => {
    const ai = order.indexOf(a.pipeline_stage || '')
    const bi = order.indexOf(b.pipeline_stage || '')
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  const results: { taskId: string; to: string; role: string; spawned: boolean }[] = []
  for (const task of ready) {
    try {
      const dispatched = await dispatchPipelineStageTask(db, runtime, task, options)
      results.push({
        taskId: task.id,
        to: dispatched.to,
        role: dispatched.role,
        spawned: dispatched.spawned
      })
    } catch (err) {
      // Continue other stages; caller sees partial results.
      results.push({
        taskId: task.id,
        to: '',
        role: task.pipeline_role || 'unknown',
        spawned: false
      })
      void err
    }
  }
  return results
}

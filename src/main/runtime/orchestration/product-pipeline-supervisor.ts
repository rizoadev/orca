/**
 * Product pipeline supervisor — set-and-forget loop.
 *
 * Polls active product pipelines:
 * 1) fail hung stage dispatches (requeue ready for retry)
 * 2) dispatch any ready stages (spawn role agents)
 * 3) drop pipelines that reached done/failed
 */

import type { OrchestrationDb } from './db'
import {
  dispatchAllReadyPipelineStages,
  type ProductDispatchRuntime
} from './product-pipeline-dispatch'
import {
  classifyOrchestrationBlocker,
  decideOrchestrationHeal,
  formatHealDecisionComment
} from '../../../shared/orchestration-blocker-policy'

export const PRODUCT_SUPERVISOR_DEFAULT_POLL_MS = 8_000
/** Match coordinator hung threshold (10 min) so slow implementers are not false-failed. */
export const PRODUCT_SUPERVISOR_HUNG_MS = 10 * 60 * 1000

export type ProductSupervisorSnapshot = {
  running: boolean
  pollIntervalMs: number
  activePipelines: string[]
  lastTickAt: string | null
  lastError: string | null
  ticks: number
}

type SupervisorState = {
  timer: ReturnType<typeof setInterval> | null
  pipelineIds: Set<string>
  pollIntervalMs: number
  lastTickAt: string | null
  lastError: string | null
  ticks: number
  ticking: boolean
  runtime: ProductDispatchRuntime | null
  db: OrchestrationDb | null
  devMode: boolean
}

const state: SupervisorState = {
  timer: null,
  pipelineIds: new Set(),
  pollIntervalMs: PRODUCT_SUPERVISOR_DEFAULT_POLL_MS,
  lastTickAt: null,
  lastError: null,
  ticks: 0,
  ticking: false,
  runtime: null,
  db: null,
  devMode: false
}

function isPipelineTerminal(db: OrchestrationDb, pipelineId: string): boolean {
  const root = db.getTask(pipelineId)
  if (!root || root.pipeline_id !== root.id) {
    return true
  }
  // Explicit product terminal states set by the engine.
  if (root.pipeline_stage === 'done' || root.pipeline_stage === 'failed') {
    return true
  }
  if (root.status === 'failed') {
    return true
  }
  // Root is bookkeeping (status completed + stage running) while children work.
  const stages = db.listTasksByPipeline(pipelineId).filter((t) => t.id !== pipelineId)
  if (stages.length === 0) {
    return true
  }
  return !stages.some(
    (t) => t.status === 'ready' || t.status === 'dispatched' || t.status === 'pending'
  )
}

async function recoverHungPipelineDispatches(db: OrchestrationDb, pipelineId: string): Promise<number> {
  const thresholdIso = new Date(Date.now() - PRODUCT_SUPERVISOR_HUNG_MS).toISOString()
  const pipelineTaskIds = new Set(db.listTasksByPipeline(pipelineId).map((t) => t.id))
  let recovered = 0
  for (const dispatch of db.getStaleDispatches(thresholdIso)) {
    if (!pipelineTaskIds.has(dispatch.task_id)) {
      continue
    }
    const hungMsg = `product supervisor: hung (no heartbeat for ${Math.round(PRODUCT_SUPERVISOR_HUNG_MS / 60000)}m)`
    const updated = db.failDispatch(dispatch.id, hungMsg)
    if (!updated) {
      continue
    }
    recovered += 1
    const task = db.getTask(dispatch.task_id)
    if (!task) {
      continue
    }
    const attempt = Math.max(1, task.pipeline_attempt ?? 1)
    const decision = decideOrchestrationHeal({
      blocker: classifyOrchestrationBlocker({ text: hungMsg, hung: true, role: task.pipeline_role }),
      attempt,
      preferredAgent: null,
      role: task.pipeline_role
    })
    try {
      db.addTaskComment({
        taskId: task.id,
        author: 'system',
        kind: 'system',
        role: task.pipeline_role,
        body: formatHealDecisionComment(decision)
      })
    } catch {
      // optional
    }
    if (decision.giveUp || decision.action === 'escalate') {
      // Leave failed; operator Retry / manager escalation path.
      continue
    }
    // failDispatch already set ready for non-circuit-broken; bump attempt so next dispatch failovers agent.
    if (task.status === 'ready' || db.getTask(task.id)?.status === 'ready') {
      db.setTaskPipelineMeta(task.id, {
        pipelineAttempt: attempt + 1
      })
    } else {
      const reopened = db.reopenTask(task.id)
      if (reopened) {
        db.setTaskPipelineMeta(task.id, {
          pipelineAttempt: attempt + 1
        })
      }
    }
  }
  return recovered
}

export async function tickProductSupervisorOnce(): Promise<void> {
  if (state.ticking || !state.db || !state.runtime) {
    return
  }
  state.ticking = true
  try {
    const db = state.db
    const runtime = state.runtime
    const ids = [...state.pipelineIds]
    for (const pipelineId of ids) {
      if (isPipelineTerminal(db, pipelineId)) {
        state.pipelineIds.delete(pipelineId)
        continue
      }
      await recoverHungPipelineDispatches(db, pipelineId)
      await dispatchAllReadyPipelineStages(db, runtime, pipelineId, {
        coordinatorHandle: 'orchestrator',
        waitTimeoutMs: 60_000,
        devMode: state.devMode
      })
      if (isPipelineTerminal(db, pipelineId)) {
        state.pipelineIds.delete(pipelineId)
      }
    }
    state.ticks += 1
    state.lastTickAt = new Date().toISOString()
    state.lastError = null
    if (state.pipelineIds.size === 0) {
      stopProductSupervisor()
    }
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err)
  } finally {
    state.ticking = false
  }
}

export function ensureProductSupervisor(
  db: OrchestrationDb,
  runtime: ProductDispatchRuntime,
  options?: { pollIntervalMs?: number; devMode?: boolean }
): void {
  state.db = db
  state.runtime = runtime
  if (options?.pollIntervalMs && options.pollIntervalMs >= 2_000) {
    state.pollIntervalMs = options.pollIntervalMs
  }
  if (options?.devMode !== undefined) {
    state.devMode = options.devMode
  }
  if (state.timer) {
    return
  }
  state.timer = setInterval(() => {
    void tickProductSupervisorOnce()
  }, state.pollIntervalMs)
  if (typeof state.timer.unref === 'function') {
    state.timer.unref()
  }
  // Immediate first tick so product-start doesn't wait a full poll interval.
  void tickProductSupervisorOnce()
}

export function watchProductPipeline(
  pipelineId: string,
  db: OrchestrationDb,
  runtime: ProductDispatchRuntime,
  options?: { pollIntervalMs?: number; devMode?: boolean }
): void {
  const id = pipelineId.trim()
  if (!id) {
    return
  }
  state.pipelineIds.add(id)
  ensureProductSupervisor(db, runtime, options)
}

export function unwatchProductPipeline(pipelineId: string): void {
  state.pipelineIds.delete(pipelineId.trim())
  if (state.pipelineIds.size === 0) {
    stopProductSupervisor()
  }
}

export function stopProductSupervisor(): void {
  if (state.timer) {
    clearInterval(state.timer)
    state.timer = null
  }
}

export function getProductSupervisorSnapshot(): ProductSupervisorSnapshot {
  return {
    running: state.timer !== null,
    pollIntervalMs: state.pollIntervalMs,
    activePipelines: [...state.pipelineIds],
    lastTickAt: state.lastTickAt,
    lastError: state.lastError,
    ticks: state.ticks
  }
}

/** Test helper — reset module state between unit tests. */
export function resetProductSupervisorForTests(): void {
  stopProductSupervisor()
  state.pipelineIds.clear()
  state.lastTickAt = null
  state.lastError = null
  state.ticks = 0
  state.ticking = false
  state.runtime = null
  state.db = null
  state.devMode = false
  state.pollIntervalMs = PRODUCT_SUPERVISOR_DEFAULT_POLL_MS
}

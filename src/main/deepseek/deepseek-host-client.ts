/**
 * POST-RPC client for a running DeepSeek Harness web host plus the host-side
 * projections Orca surfaces (agent presets, sessions, workspace registration).
 * The host answers the same envelope the dsh CLI client uses, so no WebSocket
 * session is required for these read/write RPCs.
 */
import { existsSync } from 'node:fs'
import type { DeepSeekAgentPreset, DeepSeekSessionSummary } from '../../shared/deepseek-web-types'

export class DeepSeekHostClient {
  constructor(private readonly getUrl: () => string) {}

  async rpc<T>(method: string, payload: unknown): Promise<T> {
    const rpcId = `orca-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const res = await fetch(`${this.getUrl()}/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
      signal: AbortSignal.timeout(5_000)
    })
    const body = (await res.json()) as {
      type?: string
      rpcId?: string
      result?: { ok?: boolean; value?: T; error?: { code?: string; message?: string } }
    }
    const result = body.result
    if (body.type !== 'server-response' || body.rpcId !== rpcId || !result?.ok) {
      throw new Error(`DeepSeek web host RPC ${method} returned a malformed envelope`)
    }
    return result.value as T
  }

  /** All agent presets the running host exposes (system plus user roots). */
  async listAgentPresets(): Promise<DeepSeekAgentPreset[]> {
    try {
      const value = await this.rpc<{
        presets?: { id: string; name?: string; description?: string; isDefault?: boolean }[]
      }>('agentPreset.list', {})
      return (value.presets ?? []).map((preset) => {
        // Why: the host reports names in its own locale (zh-CN by default);
        // localize the well-known system presets so the picker stays readable.
        const localized = LOCALIZED_AGENT_PRESETS[preset.id]
        return {
          id: preset.id,
          name: localized?.name ?? (preset.name || preset.id),
          description: localized?.description ?? preset.description ?? '',
          isDefault: Boolean(preset.isDefault)
        }
      })
    } catch (err) {
      console.warn(
        '[deepseek-web] listAgentPresets failed:',
        err instanceof Error ? err.message : err
      )
      return []
    }
  }

  /** All sessions on the running host (slim projection for the in-app list). */
  async listSessions(): Promise<DeepSeekSessionSummary[]> {
    try {
      const value = await this.rpc<{
        items?: {
          sessionId: string
          cwd?: string
          running?: boolean
          blank?: boolean
          agentPreset?: string | null
          projections?: { values?: { title?: string | null } }
          updatedAt?: number
        }[]
      }>('session.list', {})
      return (value.items ?? []).map((session) => ({
        sessionId: session.sessionId,
        cwd: session.cwd ?? '',
        running: Boolean(session.running),
        blank: Boolean(session.blank),
        agentPreset: session.agentPreset ?? null,
        title: session.projections?.values?.title ?? null,
        updatedAt: session.updatedAt ?? 0
      }))
    } catch (err) {
      console.warn('[deepseek-web] session.list failed:', err instanceof Error ? err.message : err)
      return []
    }
  }

  /**
   * Keep a cwd registered as a Host Workspace: re-creates it when deleted from
   * the registry, and drops stale registrations when the directory no longer
   * exists so a future re-create is clean. No-op when the cwd is blank.
   */
  async ensureWorkspaceRegistration(cwd: string | null): Promise<void> {
    if (!cwd) {
      return
    }
    if (!existsSync(cwd)) {
      try {
        const value = await this.rpc<{
          items?: { workspaceId: string; path?: string }[]
        }>('workspace.list', {})
        const stale = (value.items ?? []).filter((workspace) => workspace.path === cwd)
        for (const workspace of stale) {
          await this.rpc<unknown>('workspace.delete', { workspaceId: workspace.workspaceId })
        }
      } catch (err) {
        console.warn(
          '[deepseek-web] stale workspace cleanup failed:',
          err instanceof Error ? err.message : err
        )
      }
      return
    }
    try {
      await this.rpc<unknown>('workspace.create', { path: cwd })
    } catch (err) {
      console.warn(
        '[deepseek-web] workspace.create failed:',
        err instanceof Error ? err.message : err
      )
    }
  }
}

// Why: the host returns preset names/descriptions in its own locale
// (zh-CN by default); keep the picker readable for the well-known system ids.
const LOCALIZED_AGENT_PRESETS: Record<string, { name: string; description: string }> = {
  standard: {
    name: 'Standard',
    description:
      'Full coding agent: file editing, Shell, file & web retrieval, Skills, plans, goals, sub-agents and workflows.'
  },
  code: {
    name: 'Code (PTC)',
    description:
      'All Standard capabilities, with tools exposed via the Code Mode SDK so the model composes multi-step operations as a single TypeScript program.'
  },
  minimal: {
    name: 'Minimal',
    description: 'Two tools only: a persistent bash shell and the str_replace_editor.'
  },
  cordis: {
    name: 'Create (Cordis)',
    description:
      'For authoring custom presets: Standard capabilities plus runtime checks, plugin experiments and preset authoring guidance.'
  }
}

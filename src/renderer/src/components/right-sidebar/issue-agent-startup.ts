import { buildAgentStartupPlan, type AgentStartupPlan } from '@/lib/tui-agent-startup'
import { pickSourceControlLaunchAgent } from '@/lib/source-control-launch-agent-selection'
import { getAgentLaunchPlatformForRepo } from '@/lib/agent-launch-platform'
import { getLocalProjectExecutionRuntimeContext } from '@/lib/local-preflight-context'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'
import { tuiAgentToAgentKind } from '@/lib/telemetry'
import { useAppStore } from '@/store'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../../shared/tui-agent-launch-defaults'
import { repoIsRemote } from '../../../../shared/agent-launch-remote'
import { resolveLocalWindowsAgentStartupShell } from '../../../../shared/windows-terminal-shell'
import type { Repo, TuiAgent, WorktreeStartupLaunch } from '../../../../shared/types'

export async function resolveLaunchAgent(repo: Repo): Promise<TuiAgent | null> {
  const store = useAppStore.getState()
  const detected = repo.connectionId
    ? await store.ensureRemoteDetectedAgents(repo.connectionId)
    : await store.ensureDetectedAgents()
  return pickSourceControlLaunchAgent({
    defaultAgent: store.settings?.defaultTuiAgent,
    detectedAgents: detected,
    disabledAgents: store.settings?.disabledTuiAgents
  })
}

export type IssueAgentStartupBundle = {
  /** Full plan used for renderer-side prompt delivery (followup/draft). */
  plan: AgentStartupPlan
  /** Slim payload accepted by worktrees.create / activateAndRevealWorktree. */
  launch: WorktreeStartupLaunch
}

/**
 * Build both the full agent startup plan and the serialisable worktree-create
 * launch payload. Keep them paired so prompt follow-ups are never dropped when
 * the backend only returns a bare shell tab.
 */
export function buildIssueAgentStartup(args: {
  repo: Repo
  agent: TuiAgent
  prompt: string
}): IssueAgentStartupBundle | null {
  const store = useAppStore.getState()
  const cmdOverrides = store.settings?.agentCmdOverrides ?? {}
  const agentArgs = resolveTuiAgentLaunchArgs(args.agent, store.settings?.agentDefaultArgs)
  const agentEnv = resolveTuiAgentLaunchEnv(args.agent, store.settings?.agentDefaultEnv)
  const platform = args.repo
    ? getAgentLaunchPlatformForRepo(
        args.repo,
        args.repo.connectionId ? undefined : getLocalProjectExecutionRuntimeContext(store)
      )
    : CLIENT_PLATFORM
  const isRemote = args.repo ? repoIsRemote(args.repo) : false
  const shell = resolveLocalWindowsAgentStartupShell({
    platform,
    isRemote,
    terminalWindowsShell: store.settings?.terminalWindowsShell
  })
  const trimmedPrompt = args.prompt.trim()
  const plan = buildAgentStartupPlan({
    agent: args.agent,
    prompt: trimmedPrompt,
    cmdOverrides,
    agentArgs,
    agentEnv,
    platform,
    shell,
    isRemote,
    allowEmptyPromptLaunch: false
  })
  if (!plan) {
    return null
  }
  return {
    plan,
    launch: {
      command: plan.launchCommand,
      ...(plan.env ? { env: plan.env } : {}),
      ...(plan.launchConfig ? { launchConfig: plan.launchConfig } : {}),
      ...(plan.startupCommandDelivery
        ? { startupCommandDelivery: plan.startupCommandDelivery }
        : {}),
      ...(plan.draftPrompt ? { draftPrompt: plan.draftPrompt } : {}),
      launchAgent: args.agent,
      telemetry: {
        agent_kind: tuiAgentToAgentKind(args.agent),
        launch_source: 'sidebar',
        request_kind: 'new'
      }
    }
  }
}

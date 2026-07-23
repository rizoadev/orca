import React, { useEffect, useState } from 'react'
import { Bot, CheckCircle2, LoaderCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { useIssueAiWorkEntry } from './issue-ai-work-registry'
import { issueAiWorkRegistryKey } from './issues-panel-ai-work'
import type { RepoIssueProvider } from './repo-issue-provider'

function formatElapsed(startedAt: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000))
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.round(minutes / 60)
  return `${hours}h`
}

/** Why: the launcher may not know the pane leaf id at spawn time (watch mode
 *  waits for TerminalPane to mint one), so resolve by scanning for any pane
 *  whose key sits inside this tab. Read-only over the store snapshot; no
 *  memoization needed because the map lookup is O(active panes) and callers
 *  already re-render on agentStatusByPaneKey changes. */
export function findAgentStatusForTab(
  byPaneKey: Record<string, AgentStatusEntry | undefined>,
  tabId: string,
  fallbackPaneKey?: string
): AgentStatusEntry | undefined {
  if (fallbackPaneKey) {
    const direct = byPaneKey[fallbackPaneKey]
    if (direct) {
      return direct
    }
  }
  const prefix = `${tabId}:`
  for (const key of Object.keys(byPaneKey)) {
    if (key.startsWith(prefix)) {
      const entry = byPaneKey[key]
      if (entry) {
        return entry
      }
    }
  }
  return undefined
}

export function IssueAiWorkBadge({
  provider,
  repoId,
  issueNumber
}: {
  provider: RepoIssueProvider
  repoId: string
  issueNumber: number
}): React.JSX.Element | null {
  const entry = useIssueAiWorkEntry(issueAiWorkRegistryKey(provider, repoId, issueNumber))
  const activateTab = useAppStore((s) => s.activateTab)
  const paneStatus = useAppStore((s) =>
    entry
      ? findAgentStatusForTab(s.agentStatusByPaneKey ?? {}, entry.tabId, entry.paneKey)
      : undefined
  )

  // Why: elapsed time must tick while the run is active without introducing a
  // store-wide re-render loop. Local 1s interval scoped to the badge lifetime.
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!entry || entry.outcome) {
      return
    }
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [entry])

  if (!entry) {
    return null
  }

  const outcome = entry.outcome
  const state = paneStatus?.state
  const isDone = outcome === 'succeeded' || state === 'done'
  const isFailed = outcome === 'failed'
  const isWorking = !isDone && !isFailed

  const tone = isFailed
    ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300'
    : isDone
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
      : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300'

  const label = isFailed
    ? translate('auto.components.right.sidebar.issuesPanel.aiBadge.failed', 'AI failed')
    : isDone
      ? translate(
          'auto.components.right.sidebar.issuesPanel.aiBadge.done',
          'AI done · {{value0}}',
          {
            value0: formatElapsed(entry.startedAt)
          }
        )
      : translate(
          'auto.components.right.sidebar.issuesPanel.aiBadge.working',
          'AI · {{value0}} · {{value1}}',
          {
            value0: paneStatus?.state === 'working' ? 'working' : 'booting',
            value1: formatElapsed(entry.startedAt)
          }
        )

  const Icon = isFailed ? XCircle : isDone ? CheckCircle2 : isWorking ? LoaderCircle : Bot

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        activateTab(entry.tabId)
      }}
      title={translate(
        'auto.components.right.sidebar.issuesPanel.aiBadge.openTab',
        'Open the AI worker terminal for #{{value0}}',
        { value0: issueNumber }
      )}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors hover:brightness-110',
        tone
      )}
    >
      <Icon className={cn('size-3', isWorking && 'animate-spin')} />
      <span>{label}</span>
    </button>
  )
}

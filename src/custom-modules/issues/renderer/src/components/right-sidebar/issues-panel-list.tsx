import React from 'react'
import { CircleDot, ExternalLink, Layers, LoaderCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { TaskPageGitHubWorkItemStateBadge } from '@/components/task-page-github-work-item-status-badge'
import { openHttpLink } from '@/lib/http-link-routing'
import { translate } from '@/i18n/i18n'
import { IssueAiWorkActions } from './issue-ai-work-actions'
import { IssueAiWorkBadge } from './issue-ai-work-badge'
import { IssuesPanelEmpty } from './issues-panel-empty'
import { useIssueListAgents } from './use-issue-list-agents'
import { formatIssueRelativeTime, type IssueRow } from './issues-panel-rows'
import { issueRefFromRow } from './issue-ref'
import { IssueRowAiMenus } from './issue-row-ai-menus'
import type { IssueAiWorkMode } from './issues-panel-ai-work'
import type { TuiAgent } from '../../../../shared/types'
import { useAppStore } from '@/store'

function IssueStateBadge({ row }: { row: IssueRow }): React.JSX.Element {
  if (row.provider === 'github' && row.githubItem) {
    return <TaskPageGitHubWorkItemStateBadge item={row.githubItem} />
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none',
        row.stateTone
      )}
    >
      {row.stateLabel}
    </span>
  )
}

export function IssuesPanelList({
  loading,
  rows,
  worktreeId,
  connectionId,
  aiPlanningIssueId,
  aiWorkingIssueId,
  closingIssueId,
  convertingIssueId,
  onOpenIssue,
  onAskAiPlan,
  onAskAiWork,
  onConvertToOrchestration,
  onCloseIssue,
  repoId
}: {
  loading: boolean
  rows: IssueRow[]
  worktreeId: string | null
  connectionId: string | null | undefined
  aiPlanningIssueId: string | null
  aiWorkingIssueId: string | null
  closingIssueId: string | null
  convertingIssueId?: string | null
  onOpenIssue: (row: IssueRow) => void
  onAskAiPlan: (row: IssueRow, agent: TuiAgent) => void
  onAskAiWork: (row: IssueRow, agent: TuiAgent, mode: IssueAiWorkMode) => void
  onConvertToOrchestration?: (row: IssueRow) => void
  onCloseIssue: (row: IssueRow) => void
  repoId: string | null
}): React.JSX.Element {
  const defaultAgent = useAppStore((s) => s.settings?.defaultTuiAgent ?? null)
  const { agents, detectingAgents } = useIssueListAgents(connectionId)

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 px-3 py-8 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" />
        {translate('auto.components.right.sidebar.issuesPanel.loading', 'Loading issues…')}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <IssuesPanelEmpty
        title={translate('auto.components.right.sidebar.issuesPanel.emptyTitle', 'No open issues')}
        description={translate(
          'auto.components.right.sidebar.issuesPanel.emptyBody',
          'Open issues for this repository will show up here.'
        )}
        compact
      />
    )
  }

  return (
    <div className="divide-y divide-border/50">
      {rows.map((row) => {
        const planning = aiPlanningIssueId === row.id
        const working = aiWorkingIssueId === row.id
        const closing = closingIssueId === row.id
        const converting = convertingIssueId === row.id
        const issueRef = issueRefFromRow(row)
        return (
          <div
            key={row.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenIssue(row)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onOpenIssue(row)
              }
            }}
            className="flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left hover:bg-accent"
          >
            <CircleDot className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">{row.label}</span>
                <IssueStateBadge row={row} />
                {row.updatedAt ? (
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                    {formatIssueRelativeTime(row.updatedAt)}
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 flex items-center gap-2 truncate text-sm text-foreground">
                <span className="truncate">{row.title}</span>
                {repoId ? (
                  <IssueAiWorkBadge provider={row.provider} repoId={repoId} issueRef={issueRef} />
                ) : null}
              </div>
              {repoId ? (
                <IssueAiWorkActions provider={row.provider} repoId={repoId} issueRef={issueRef} />
              ) : null}
            </div>
            <TooltipProvider delayDuration={300}>
              <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
                {onConvertToOrchestration ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={converting || planning || working}
                        onClick={(event) => {
                          event.stopPropagation()
                          onConvertToOrchestration(row)
                        }}
                        aria-label={translate(
                          'auto.components.right.sidebar.issuesPanel.toOrchestration',
                          'Convert to orchestration task'
                        )}
                      >
                        {converting ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <Layers className="size-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {translate(
                        'auto.components.right.sidebar.issuesPanel.toOrchestration',
                        'Convert to orchestration task'
                      )}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                <IssueRowAiMenus
                  row={row}
                  planning={planning}
                  working={working}
                  agents={agents}
                  detectingAgents={detectingAgents}
                  defaultAgent={defaultAgent}
                  onAskAiPlan={onAskAiPlan}
                  onAskAiWork={onAskAiWork}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={closing || planning || working}
                      onClick={(event) => {
                        event.stopPropagation()
                        onCloseIssue(row)
                      }}
                      aria-label={translate(
                        'auto.components.right.sidebar.issuesPanel.closeIssue',
                        'Close issue'
                      )}
                    >
                      {closing ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <XCircle className="size-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    {translate(
                      'auto.components.right.sidebar.issuesPanel.closeIssue',
                      'Close issue'
                    )}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={(event) => {
                        event.stopPropagation()
                        void openHttpLink(row.url, { worktreeId })
                      }}
                      aria-label={translate(
                        'auto.components.right.sidebar.issuesPanel.openInBrowser',
                        'Open in browser'
                      )}
                    >
                      <ExternalLink className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    {translate(
                      'auto.components.right.sidebar.issuesPanel.openInBrowser',
                      'Open in browser'
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
        )
      })}
    </div>
  )
}

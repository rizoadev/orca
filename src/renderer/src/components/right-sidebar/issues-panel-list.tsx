import React from 'react'
import { Bot, CircleDot, ExternalLink, LoaderCircle, Sparkles, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { TaskPageGitHubWorkItemStateBadge } from '@/components/task-page-github-work-item-status-badge'
import { openHttpLink } from '@/lib/http-link-routing'
import { getAgentCatalog, AgentIcon } from '@/lib/agent-catalog'
import { translate } from '@/i18n/i18n'
import { IssueAiWorkActions } from './issue-ai-work-actions'
import { IssueAiWorkBadge } from './issue-ai-work-badge'
import { IssuesPanelEmpty } from './issues-panel-empty'
import { useIssueListAgents } from './use-issue-list-agents'
import { formatIssueRelativeTime, type IssueRow } from './issues-panel-rows'
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
  onOpenIssue,
  onAskAiPlan,
  onAskAiWork,
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
  onOpenIssue: (row: IssueRow) => void
  onAskAiPlan: (row: IssueRow, agent: TuiAgent) => void
  onAskAiWork: (row: IssueRow, agent: TuiAgent, mode: IssueAiWorkMode) => void
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
                <span className="font-mono text-[11px] text-muted-foreground">#{row.number}</span>
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
                  <IssueAiWorkBadge
                    provider={row.provider}
                    repoId={repoId}
                    issueNumber={row.number}
                  />
                ) : null}
              </div>
              {repoId ? (
                <IssueAiWorkActions
                  provider={row.provider}
                  repoId={repoId}
                  issueNumber={row.number}
                />
              ) : null}
            </div>
            <TooltipProvider delayDuration={300}>
              <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
                {/* Why: stopPropagation on open avoids row click; modal=false so menus work if this ever sits under a dialog. */}
                <DropdownMenu modal={false}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={planning || working}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={translate(
                            'auto.components.right.sidebar.issuesPanel.askAiPlan',
                            'Ask AI to plan and comment'
                          )}
                        >
                          {planning ? (
                            <LoaderCircle className="size-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="size-3.5" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {translate(
                        'auto.components.right.sidebar.issuesPanel.askAiPlan',
                        'Ask AI to plan and comment'
                      )}
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent
                    align="end"
                    side="left"
                    sideOffset={6}
                    className="z-[80]"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <DropdownMenuLabel>
                      {translate(
                        'auto.components.right.sidebar.issuesPanel.chooseAgent',
                        'Plan with agent'
                      )}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {detectingAgents && agents.length === 0 ? (
                      <DropdownMenuItem disabled>
                        {translate(
                          'auto.components.right.sidebar.issuesPanel.detectingAgents',
                          'Detecting agents…'
                        )}
                      </DropdownMenuItem>
                    ) : agents.length === 0 ? (
                      <DropdownMenuItem disabled>
                        {translate(
                          'auto.components.right.sidebar.issuesPanel.noAgentsDetected',
                          'No agents detected'
                        )}
                      </DropdownMenuItem>
                    ) : (
                      agents.map((agent) => {
                        const entry = getAgentCatalog().find((item) => item.id === agent)
                        const label = entry?.label ?? agent
                        const isDefault =
                          defaultAgent && defaultAgent !== 'blank' && agent === defaultAgent
                        return (
                          <DropdownMenuItem
                            key={agent}
                            className="gap-2"
                            onSelect={() => onAskAiPlan(row, agent)}
                          >
                            <AgentIcon agent={agent} size={14} />
                            <span className="flex-1">{label}</span>
                            {isDefault ? (
                              <span className="text-[10px] text-muted-foreground">
                                {translate(
                                  'auto.components.right.sidebar.issuesPanel.defaultAgent',
                                  'Default'
                                )}
                              </span>
                            ) : null}
                          </DropdownMenuItem>
                        )
                      })
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu modal={false}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={planning || working}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={translate(
                            'auto.components.right.sidebar.issuesPanel.askAiWork',
                            'Work on this with AI'
                          )}
                        >
                          {working ? (
                            <LoaderCircle className="size-3.5 animate-spin" />
                          ) : (
                            <Bot className="size-3.5" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {translate(
                        'auto.components.right.sidebar.issuesPanel.askAiWork',
                        'Work on this with AI'
                      )}
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent
                    align="end"
                    side="left"
                    sideOffset={6}
                    className="z-[80]"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <DropdownMenuLabel>
                      {translate(
                        'auto.components.right.sidebar.issuesPanel.workInBackground',
                        'Work in background'
                      )}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {detectingAgents && agents.length === 0 ? (
                      <DropdownMenuItem disabled>
                        {translate(
                          'auto.components.right.sidebar.issuesPanel.detectingAgents',
                          'Detecting agents…'
                        )}
                      </DropdownMenuItem>
                    ) : agents.length === 0 ? (
                      <DropdownMenuItem disabled>
                        {translate(
                          'auto.components.right.sidebar.issuesPanel.noAgentsDetected',
                          'No agents detected'
                        )}
                      </DropdownMenuItem>
                    ) : (
                      agents.map((agent) => {
                        const entry = getAgentCatalog().find((item) => item.id === agent)
                        const label = entry?.label ?? agent
                        const isDefault =
                          defaultAgent && defaultAgent !== 'blank' && agent === defaultAgent
                        return (
                          <DropdownMenuItem
                            key={`work-bg-${agent}`}
                            className="gap-2"
                            onSelect={() => onAskAiWork(row, agent, 'background')}
                          >
                            <AgentIcon agent={agent} size={14} />
                            <span className="flex-1">{label}</span>
                            {isDefault ? (
                              <span className="text-[10px] text-muted-foreground">
                                {translate(
                                  'auto.components.right.sidebar.issuesPanel.defaultAgent',
                                  'Default'
                                )}
                              </span>
                            ) : null}
                          </DropdownMenuItem>
                        )
                      })
                    )}
                    {agents.length > 0 ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>
                          {translate(
                            'auto.components.right.sidebar.issuesPanel.workAndWatch',
                            'Work & watch (open terminal)'
                          )}
                        </DropdownMenuLabel>
                        {agents.map((agent) => {
                          const entry = getAgentCatalog().find((item) => item.id === agent)
                          const label = entry?.label ?? agent
                          return (
                            <DropdownMenuItem
                              key={`work-watch-${agent}`}
                              className="gap-2"
                              onSelect={() => onAskAiWork(row, agent, 'watch')}
                            >
                              <AgentIcon agent={agent} size={14} />
                              <span className="flex-1">{label}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {translate(
                                  'auto.components.right.sidebar.issuesPanel.workAndWatchShort',
                                  'watch'
                                )}
                              </span>
                            </DropdownMenuItem>
                          )
                        })}
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
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

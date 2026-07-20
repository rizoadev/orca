import React, { useMemo } from 'react'
import { CircleDot, ExternalLink, LoaderCircle, Sparkles } from 'lucide-react'
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
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { useAppStore } from '@/store'
import { filterEnabledTuiAgents } from '../../../../shared/tui-agent-selection'
import type { TuiAgent } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import { IssuesPanelEmpty } from './issues-panel-empty'
import { formatIssueRelativeTime, type IssueRow } from './issues-panel-rows'

function orderAgents(
  defaultAgent: TuiAgent | 'blank' | null | undefined,
  detected: TuiAgent[]
): TuiAgent[] {
  const inCatalogOrder = getAgentCatalog()
    .filter((entry) => detected.includes(entry.id))
    .map((entry) => entry.id)
  if (!defaultAgent || defaultAgent === 'blank' || !inCatalogOrder.includes(defaultAgent)) {
    return inCatalogOrder
  }
  return [defaultAgent, ...inCatalogOrder.filter((id) => id !== defaultAgent)]
}

export function IssuesPanelList({
  loading,
  rows,
  worktreeId,
  connectionId,
  aiPlanningIssueId,
  onOpenIssue,
  onAskAiPlan
}: {
  loading: boolean
  rows: IssueRow[]
  worktreeId: string | null
  connectionId: string | null | undefined
  aiPlanningIssueId: string | null
  onOpenIssue: (row: IssueRow) => void
  onAskAiPlan: (row: IssueRow, agent: TuiAgent) => void
}): React.JSX.Element {
  const defaultAgent = useAppStore((s) => s.settings?.defaultTuiAgent ?? null)
  const disabledAgents = useAppStore((s) => s.settings?.disabledTuiAgents ?? [])
  const { detectedIds, isLoading: detectingAgents } = useDetectedAgents(connectionId)

  const agents = useMemo(() => {
    if (!detectedIds) {
      return [] as TuiAgent[]
    }
    return orderAgents(defaultAgent, filterEnabledTuiAgents(detectedIds, disabledAgents))
  }, [defaultAgent, detectedIds, disabledAgents])

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
                {row.provider === 'github' && row.githubItem ? (
                  <TaskPageGitHubWorkItemStateBadge item={row.githubItem} />
                ) : (
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none',
                      row.stateTone
                    )}
                  >
                    {row.stateLabel}
                  </span>
                )}
                {row.updatedAt ? (
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                    {formatIssueRelativeTime(row.updatedAt)}
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 truncate text-sm text-foreground">{row.title}</div>
            </div>
            <TooltipProvider delayDuration={300}>
              <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={planning}
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

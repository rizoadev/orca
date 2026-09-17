import React from 'react'
import { Bot, Sparkles, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getAgentCatalog, AgentIcon } from '@/lib/agent-catalog'
import { translate } from '@/i18n/i18n'
import type { IssueRow } from './issues-panel-rows'
import type { IssueAiWorkMode } from './issues-panel-ai-work'
import type { TuiAgent } from '../../../../shared/types'

export function IssueRowAiMenus({
  row,
  planning,
  working,
  agents,
  detectingAgents,
  defaultAgent,
  onAskAiPlan,
  onAskAiWork
}: {
  row: IssueRow
  planning: boolean
  working: boolean
  agents: TuiAgent[]
  detectingAgents: boolean
  defaultAgent: TuiAgent | null
  onAskAiPlan: (row: IssueRow, agent: TuiAgent) => void
  onAskAiWork: (row: IssueRow, agent: TuiAgent, mode: IssueAiWorkMode) => void
}): React.JSX.Element {
  return (
    <>
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
            {translate('auto.components.right.sidebar.issuesPanel.chooseAgent', 'Plan with agent')}
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
              const isDefault = defaultAgent && defaultAgent !== 'blank' && agent === defaultAgent
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
              const isDefault = defaultAgent && defaultAgent !== 'blank' && agent === defaultAgent
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
    </>
  )
}

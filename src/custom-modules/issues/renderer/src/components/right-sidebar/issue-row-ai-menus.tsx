import React from 'react'
import { Bot, MessageCircle, Sparkles, LoaderCircle } from 'lucide-react'
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
import type { TuiAgent } from '../../../../../../shared/types'

type AgentListProps = {
  agents: TuiAgent[]
  detectingAgents: boolean
  defaultAgent: TuiAgent | 'blank' | null
  onPick: (agent: TuiAgent) => void
  keyPrefix: string
}

/** Shared agent picker items for the row action menus. */
function AgentMenuItems({
  agents,
  detectingAgents,
  defaultAgent,
  onPick,
  keyPrefix
}: AgentListProps): React.JSX.Element {
  if (detectingAgents && agents.length === 0) {
    return (
      <DropdownMenuItem disabled>
        {translate(
          'auto.components.right.sidebar.issuesPanel.detectingAgents',
          'Detecting agents…'
        )}
      </DropdownMenuItem>
    )
  }
  if (agents.length === 0) {
    return (
      <DropdownMenuItem disabled>
        {translate(
          'auto.components.right.sidebar.issuesPanel.noAgentsDetected',
          'No agents detected'
        )}
      </DropdownMenuItem>
    )
  }
  return (
    <>
      {agents.map((agent) => {
        const entry = getAgentCatalog().find((item) => item.id === agent)
        const label = entry?.label ?? agent
        const isDefault = defaultAgent && defaultAgent !== 'blank' && agent === defaultAgent
        return (
          <DropdownMenuItem
            key={`${keyPrefix}-${agent}`}
            className="gap-2"
            onSelect={() => onPick(agent)}
          >
            <AgentIcon agent={agent} size={14} />
            <span className="flex-1">{label}</span>
            {isDefault ? (
              <span className="text-[10px] text-muted-foreground">
                {translate('auto.components.right.sidebar.issuesPanel.defaultAgent', 'Default')}
              </span>
            ) : null}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}

function RowActionMenu({
  icon,
  busy,
  label,
  menuLabel,
  agentList,
  extraItems
}: {
  icon: React.ReactNode
  busy: boolean
  label: string
  menuLabel: string
  agentList: AgentListProps
  extraItems?: React.ReactNode
}): React.JSX.Element {
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={busy}
              onClick={(event) => event.stopPropagation()}
              aria-label={label}
            >
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : icon}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="left">{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        side="left"
        sideOffset={6}
        className="z-[80]"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuLabel>{menuLabel}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <AgentMenuItems {...agentList} />
        {extraItems}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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
  defaultAgent: TuiAgent | 'blank' | null
  onAskAiPlan: (row: IssueRow, agent: TuiAgent) => void
  onAskAiWork: (row: IssueRow, agent: TuiAgent, mode: IssueAiWorkMode) => void
}): React.JSX.Element {
  const agentList = { agents, detectingAgents, defaultAgent }
  const watchItems =
    agents.length > 0 ? (
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
                {translate('auto.components.right.sidebar.issuesPanel.workAndWatchShort', 'watch')}
              </span>
            </DropdownMenuItem>
          )
        })}
      </>
    ) : null

  return (
    <>
      <RowActionMenu
        icon={<Sparkles className="size-3.5" />}
        busy={planning}
        label={translate(
          'auto.components.right.sidebar.issuesPanel.askAiPlan',
          'Ask AI to plan and comment'
        )}
        menuLabel={translate(
          'auto.components.right.sidebar.issuesPanel.chooseAgent',
          'Plan with agent'
        )}
        agentList={{ ...agentList, onPick: (agent) => onAskAiPlan(row, agent), keyPrefix: 'plan' }}
      />
      <RowActionMenu
        icon={<Bot className="size-3.5" />}
        busy={working}
        label={translate(
          'auto.components.right.sidebar.issuesPanel.askAiWork',
          'Work on this with AI'
        )}
        menuLabel={translate(
          'auto.components.right.sidebar.issuesPanel.workInBackground',
          'Work in background'
        )}
        agentList={{
          ...agentList,
          onPick: (agent) => onAskAiWork(row, agent, 'background'),
          keyPrefix: 'work-bg'
        }}
        extraItems={watchItems}
      />
      <RowActionMenu
        icon={<MessageCircle className="size-3.5" />}
        busy={working}
        label={translate(
          'auto.components.right.sidebar.issuesPanel.discussIssue',
          'Discuss this issue with AI'
        )}
        menuLabel={translate(
          'auto.components.right.sidebar.issuesPanel.discussIssue',
          'Discuss this issue with AI'
        )}
        agentList={{
          ...agentList,
          onPick: (agent) => onAskAiWork(row, agent, 'discuss'),
          keyPrefix: 'discuss'
        }}
      />
    </>
  )
}

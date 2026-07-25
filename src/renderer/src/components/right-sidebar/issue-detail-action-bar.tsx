import React, { useMemo, useState } from 'react'
import { Bot, ChevronDown, ExternalLink, Layers, LoaderCircle, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { AgentIcon, getAgentCatalog } from '@/lib/agent-catalog'
import { createOrchestrationTaskFromIssue } from '@/lib/issue-to-orchestration-task'
import { useAppStore } from '@/store'
import { useActiveWorktree } from '@/store/selectors'
import { translate } from '@/i18n/i18n'
import { filterEnabledTuiAgents } from '../../../../shared/tui-agent-selection'
import type { GitHubWorkItem, GitLabWorkItem, Repo, TuiAgent } from '../../../../shared/types'
import { IssueAiWorkActions } from './issue-ai-work-actions'
import { IssueAiWorkBadge } from './issue-ai-work-badge'
import { IssueDetailMetadataControls } from './issue-detail-metadata-controls'
import { launchIssueAiPlanCommenter } from './issues-panel-ai-plan'
import { launchIssueAiWorker, type IssueAiWorkMode } from './issues-panel-ai-work'
import type { RepoIssueProvider } from './repo-issue-provider'
import { cn } from '@/lib/utils'

type DetailActionBarProps = {
  repo: Repo
  provider: RepoIssueProvider
  issueNumber: number
  issueTitle: string
  issueUrl: string
  issueBody?: string
  labels?: string[]
  assignees?: string[]
  state?: 'open' | 'closed' | 'opened'
  githubItem?: GitHubWorkItem | null
  gitlabItem?: GitLabWorkItem | null
  onIssueClosed?: () => void
  onCreateWorkspace?: () => void
  onStateChanged?: (state: 'open' | 'closed' | 'opened') => void
  onLabelsChanged?: (labels: string[]) => void
  onAssigneesChanged?: (assignees: string[]) => void
}

function orderAgents(
  defaultAgent: TuiAgent | 'blank' | null | undefined,
  detected: TuiAgent[]
): TuiAgent[] {
  const catalogOrder = getAgentCatalog()
    .filter((entry) => detected.includes(entry.id))
    .map((entry) => entry.id)
  if (!defaultAgent || defaultAgent === 'blank' || !catalogOrder.includes(defaultAgent)) {
    return catalogOrder
  }
  return [defaultAgent, ...catalogOrder.filter((id) => id !== defaultAgent)]
}

function AgentPickerMenu({
  agents,
  detectingAgents,
  disabled,
  title,
  sections,
  onPick
}: {
  agents: TuiAgent[]
  detectingAgents: boolean
  disabled: boolean
  title: string
  sections: { id: string; label: string; mode?: IssueAiWorkMode }[]
  onPick: (agent: TuiAgent, mode?: IssueAiWorkMode) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const defaultAgent = useAppStore((s) => s.settings?.defaultTuiAgent ?? null)

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="h-6 gap-1 px-2"
          disabled={disabled}
        >
          {disabled ? (
            <LoaderCircle className="size-3 animate-spin" />
          ) : title.toLowerCase().includes('work') ? (
            <Bot className="size-3" />
          ) : (
            <Sparkles className="size-3" />
          )}
          {title}
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="z-[80] w-56 p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {detectingAgents && agents.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {translate(
              'auto.components.right.sidebar.issuesPanel.detectingAgents',
              'Detecting agents…'
            )}
          </div>
        ) : agents.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {translate(
              'auto.components.right.sidebar.issuesPanel.noAgentsDetected',
              'No agents detected'
            )}
          </div>
        ) : (
          sections.map((section, index) => (
            <div key={section.id}>
              {index > 0 ? <div className="my-1 h-px bg-border" /> : null}
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
              </div>
              {agents.map((agent) => {
                const entry = getAgentCatalog().find((item) => item.id === agent)
                const label = entry?.label ?? agent
                const isDefault = defaultAgent && defaultAgent !== 'blank' && agent === defaultAgent
                return (
                  <button
                    key={`${section.id}-${agent}`}
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent'
                    )}
                    onClick={() => {
                      setOpen(false)
                      onPick(agent, section.mode)
                    }}
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
                  </button>
                )
              })}
            </div>
          ))
        )}
      </PopoverContent>
    </Popover>
  )
}

export function IssueDetailActionBar(props: DetailActionBarProps): React.JSX.Element {
  const activeWorktree = useActiveWorktree()
  const defaultAgent = useAppStore((s) => s.settings?.defaultTuiAgent ?? null)
  const disabledAgents = useAppStore((s) => s.settings?.disabledTuiAgents ?? [])
  // Why: undefined freezes useDetectedAgents in "hydration unknown" loading.
  const { detectedIds, isLoading: detectingAgents } = useDetectedAgents(
    props.repo.connectionId ?? null
  )

  const [planning, setPlanning] = useState(false)
  const [working, setWorking] = useState(false)
  const [converting, setConverting] = useState(false)
  const setRightSidebarTab = useAppStore((s) => s.setRightSidebarTab)
  const openOrchestrationBoardPage = useAppStore((s) => s.openOrchestrationBoardPage)
  const issueState =
    props.state ??
    (props.provider === 'github'
      ? props.githubItem?.state === 'closed'
        ? 'closed'
        : 'open'
      : props.gitlabItem?.state === 'closed'
        ? 'closed'
        : 'opened')
  const issueLabels = props.labels ?? props.githubItem?.labels ?? props.gitlabItem?.labels ?? []
  const issueAssignees =
    props.assignees ?? props.githubItem?.assignees?.map((user) => user.login) ?? []

  const agents = useMemo(() => {
    if (!detectedIds) {
      return [] as TuiAgent[]
    }
    return orderAgents(defaultAgent, filterEnabledTuiAgents(detectedIds, disabledAgents))
  }, [defaultAgent, detectedIds, disabledAgents])

  const runPlan = async (agent: TuiAgent): Promise<void> => {
    if (!activeWorktree) {
      toast.error(
        translate(
          'auto.components.right.sidebar.issuesPanel.noActiveWorktree',
          'Select a worktree first.'
        )
      )
      return
    }
    setPlanning(true)
    try {
      await launchIssueAiPlanCommenter({
        worktreeId: activeWorktree.id,
        repo: props.repo,
        agent,
        issue: {
          provider: props.provider,
          number: props.issueNumber,
          title: props.issueTitle,
          url: props.issueUrl,
          body: props.issueBody
        }
      })
    } finally {
      setPlanning(false)
    }
  }

  const runWork = async (agent: TuiAgent, mode: IssueAiWorkMode): Promise<void> => {
    if (!activeWorktree) {
      toast.error(
        translate(
          'auto.components.right.sidebar.issuesPanel.noActiveWorktree',
          'Select a worktree first.'
        )
      )
      return
    }
    setWorking(true)
    try {
      await launchIssueAiWorker({
        worktreeId: activeWorktree.id,
        repo: props.repo,
        agent,
        mode,
        issue: {
          provider: props.provider,
          number: props.issueNumber,
          title: props.issueTitle,
          url: props.issueUrl,
          body: props.issueBody
        }
      })
    } finally {
      setWorking(false)
    }
  }

  const convertToOrchestration = async (): Promise<void> => {
    setConverting(true)
    try {
      const result = await createOrchestrationTaskFromIssue({
        provider: props.provider,
        issueNumber: props.issueNumber,
        title: props.issueTitle,
        url: props.issueUrl,
        body: props.issueBody ?? '',
        repoId: props.repo.id,
        worktreeId: activeWorktree?.id ?? null,
        hostId: props.repo.connectionId ? `ssh:${props.repo.connectionId}` : 'local'
      })
      setRightSidebarTab('orchestration')
      toast.success(
        result.coalesced
          ? translate(
              'auto.components.right.sidebar.issuesPanel.orchestrationExists',
              'Orchestration task already exists for #{n}',
              { n: props.issueNumber }
            )
          : translate(
              'auto.components.right.sidebar.issuesPanel.orchestrationCreated',
              'Created orchestration task for #{n}',
              { n: props.issueNumber }
            ),
        {
          description: result.task.id,
          action: {
            label: translate(
              'auto.components.right.sidebar.issuesPanel.openBoard',
              'Board'
            ),
            onClick: () => openOrchestrationBoardPage()
          }
        }
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setConverting(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <IssueDetailMetadataControls
        repo={props.repo}
        provider={props.provider}
        issueNumber={props.issueNumber}
        issueTitle={props.issueTitle}
        issueUrl={props.issueUrl}
        labels={issueLabels}
        assignees={issueAssignees}
        state={issueState}
        githubItem={props.githubItem}
        gitlabItem={props.gitlabItem}
        onIssueClosed={props.onIssueClosed}
        onCreateWorkspace={props.onCreateWorkspace}
        onStateChanged={props.onStateChanged}
        onLabelsChanged={props.onLabelsChanged}
        onAssigneesChanged={props.onAssigneesChanged}
      />

      <AgentPickerMenu
        agents={agents}
        detectingAgents={detectingAgents}
        disabled={planning || working || converting}
        title={translate(
          'auto.components.right.sidebar.issuesPanel.askAiPlanShort',
          'Ask AI to plan'
        )}
        sections={[
          {
            id: 'plan',
            label: translate(
              'auto.components.right.sidebar.issuesPanel.chooseAgent',
              'Plan with agent'
            )
          }
        ]}
        onPick={(agent) => {
          void runPlan(agent)
        }}
      />

      <AgentPickerMenu
        agents={agents}
        detectingAgents={detectingAgents}
        disabled={planning || working || converting}
        title={translate(
          'auto.components.right.sidebar.issuesPanel.askAiWorkShort',
          'Work with AI'
        )}
        sections={[
          {
            id: 'bg',
            label: translate(
              'auto.components.right.sidebar.issuesPanel.workInBackground',
              'Work in background'
            ),
            mode: 'background'
          },
          {
            id: 'watch',
            label: translate(
              'auto.components.right.sidebar.issuesPanel.workAndWatch',
              'Work & watch (open terminal)'
            ),
            mode: 'watch'
          }
        ]}
        onPick={(agent, mode) => {
          void runWork(agent, mode ?? 'background')
        }}
      />

      <Button
        type="button"
        variant="secondary"
        size="xs"
        className="h-6 gap-1 px-2"
        disabled={converting || planning || working}
        onClick={() => {
          void convertToOrchestration()
        }}
      >
        {converting ? (
          <LoaderCircle className="size-3 animate-spin" />
        ) : (
          <Layers className="size-3" />
        )}
        {translate(
          'auto.components.right.sidebar.issuesPanel.toOrchestrationShort',
          'To orchestration'
        )}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="xs"
        className="h-6 gap-1 px-2"
        onClick={() => void window.api.shell.openUrl(props.issueUrl)}
      >
        <ExternalLink className="size-3" />
        {props.provider === 'github'
          ? translate('auto.components.right.sidebar.issuesPanel.openOnGitHub', 'Open on GitHub')
          : translate('auto.components.right.sidebar.issuesPanel.openOnGitLab', 'Open on GitLab')}
      </Button>
      <IssueAiWorkBadge
        provider={props.provider}
        repoId={props.repo.id}
        issueNumber={props.issueNumber}
      />
      <IssueAiWorkActions
        provider={props.provider}
        repoId={props.repo.id}
        issueNumber={props.issueNumber}
        showBranchLabel={false}
      />
    </div>
  )
}

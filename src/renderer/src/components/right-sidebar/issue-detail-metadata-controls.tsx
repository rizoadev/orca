import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FolderPlus, Tag, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useRepoAssignees, useRepoLabels } from '@/hooks/useIssueMetadata'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type {
  GitHubAssignableUser,
  GitHubIssueCloseReason,
  GitHubWorkItem,
  GitLabAssignableUser,
  GitLabWorkItem,
  Repo
} from '../../../../shared/types'
import { MultiSelectMenu, StatusMenu, type IssueStateValue } from './issue-detail-metadata-menus'
import { getRepoIssueSourceContext } from './issues-panel-rows'
import type { RepoIssueProvider } from './repo-issue-provider'

export type IssueDetailMetadataControlsProps = {
  repo: Repo
  provider: RepoIssueProvider
  issueNumber: number
  issueTitle: string
  issueUrl: string
  labels: string[]
  assignees: string[]
  state: IssueStateValue
  githubItem?: GitHubWorkItem | null
  gitlabItem?: GitLabWorkItem | null
  onStateChanged?: (state: IssueStateValue) => void
  onLabelsChanged?: (labels: string[]) => void
  onAssigneesChanged?: (assignees: string[]) => void
  onIssueClosed?: () => void
  onCreateWorkspace?: () => void
}

function sourceSelector(repo: Repo, provider: RepoIssueProvider) {
  return {
    repoPath: repo.path,
    repoId: repo.id,
    sourceContext: getRepoIssueSourceContext(repo, provider)
  }
}

export function IssueDetailMetadataControls(
  props: IssueDetailMetadataControlsProps
): React.JSX.Element {
  const [state, setState] = useState<IssueStateValue>(props.state)
  const [labels, setLabels] = useState<string[]>(props.labels)
  const [assignees, setAssignees] = useState<string[]>(props.assignees)
  const [busyKey, setBusyKey] = useState<'state' | 'labels' | 'assignees' | null>(null)

  useEffect(() => setState(props.state), [props.state])
  useEffect(() => setLabels(props.labels), [props.labels])
  useEffect(() => setAssignees(props.assignees), [props.assignees])

  const githubLabelMeta = useRepoLabels(
    props.provider === 'github' ? props.repo.path : null,
    props.provider === 'github' ? props.repo.id : null
  )
  const assigneeMeta = useRepoAssignees(
    props.provider === 'github' ? props.repo.path : null,
    props.provider === 'github' ? props.repo.id : null
  )
  const [gitlabUsers, setGitlabUsers] = useState<GitLabAssignableUser[]>([])
  const [gitlabUsersLoading, setGitlabUsersLoading] = useState(false)
  const [gitlabLabels, setGitlabLabels] = useState<string[]>([])
  const [gitlabLabelsLoading, setGitlabLabelsLoading] = useState(false)

  useEffect(() => {
    if (props.provider !== 'gitlab') {
      return
    }
    let cancelled = false
    setGitlabUsersLoading(true)
    setGitlabLabelsLoading(true)
    const selector = sourceSelector(props.repo, 'gitlab')
    void Promise.all([
      window.api.gl.listAssignableUsers(selector),
      window.api.gl.listLabels(selector)
    ])
      .then(([users, nextLabels]) => {
        if (!cancelled) {
          setGitlabUsers(users as GitLabAssignableUser[])
          setGitlabLabels((nextLabels as string[]) ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGitlabUsers([])
          setGitlabLabels([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setGitlabUsersLoading(false)
          setGitlabLabelsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [props.provider, props.repo])

  const providerLabels = useMemo(
    () => (props.provider === 'github' ? (githubLabelMeta.data ?? []) : gitlabLabels),
    [githubLabelMeta.data, gitlabLabels, props.provider]
  )
  const labelsLoading = props.provider === 'github' ? githubLabelMeta.loading : gitlabLabelsLoading

  const labelOptions = useMemo(
    () =>
      Array.from(new Set([...providerLabels, ...labels]))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .map((label) => ({ id: label, label })),
    [labels, providerLabels]
  )

  const assigneeOptions = useMemo(() => {
    if (props.provider === 'github') {
      const fromMeta = (assigneeMeta.data ?? []).map((user: GitHubAssignableUser) => ({
        id: user.login,
        label: user.name ? `${user.login} · ${user.name}` : user.login
      }))
      const extras = assignees
        .filter((login) => !fromMeta.some((row) => row.id.toLowerCase() === login.toLowerCase()))
        .map((login) => ({ id: login, label: login }))
      return [...fromMeta, ...extras].sort((a, b) => a.label.localeCompare(b.label))
    }
    const fromMeta = gitlabUsers.map((user) => ({
      id: user.username,
      label: user.name ? `${user.username} · ${user.name}` : user.username
    }))
    const extras = assignees
      .filter((login) => !fromMeta.some((row) => row.id.toLowerCase() === login.toLowerCase()))
      .map((login) => ({ id: login, label: login }))
    return [...fromMeta, ...extras].sort((a, b) => a.label.localeCompare(b.label))
  }, [assigneeMeta.data, assignees, gitlabUsers, props.provider])

  const updateGitHub = useCallback(
    async (updates: {
      state?: 'open' | 'closed'
      stateReason?: GitHubIssueCloseReason
      duplicateOf?: number
      addLabels?: string[]
      removeLabels?: string[]
      addAssignees?: string[]
      removeAssignees?: string[]
    }) => {
      return window.api.gh.updateIssue({
        ...sourceSelector(props.repo, 'github'),
        number: props.issueNumber,
        updates
      })
    },
    [props.issueNumber, props.repo]
  )

  const updateGitLab = useCallback(
    async (updates: {
      state?: 'opened' | 'closed'
      addLabels?: string[]
      removeLabels?: string[]
      addAssignees?: string[]
      removeAssignees?: string[]
    }) => {
      return window.api.gl.updateIssue({
        ...sourceSelector(props.repo, 'gitlab'),
        number: props.issueNumber,
        updates
      })
    },
    [props.issueNumber, props.repo]
  )

  const handleStatePick = async (next: {
    state: IssueStateValue
    stateReason?: GitHubIssueCloseReason
    duplicateOf?: number
  }): Promise<void> => {
    if (next.state === state && !next.stateReason) {
      return
    }
    setBusyKey('state')
    const previous = state
    setState(next.state)
    try {
      const result =
        props.provider === 'github'
          ? await updateGitHub({
              state: next.state === 'opened' ? 'open' : next.state,
              ...(next.stateReason ? { stateReason: next.stateReason } : {}),
              ...(typeof next.duplicateOf === 'number' ? { duplicateOf: next.duplicateOf } : {})
            })
          : await updateGitLab({
              state: next.state === 'open' ? 'opened' : next.state
            })
      if (!result.ok) {
        setState(previous)
        toast.error(result.error)
        return
      }
      props.onStateChanged?.(next.state)
      useAppStore
        .getState()
        .recordFeatureInteraction(props.provider === 'github' ? 'github-tasks' : 'gitlab-tasks')
      if (next.state === 'closed') {
        props.onIssueClosed?.()
      }
    } catch (err) {
      setState(previous)
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyKey(null)
    }
  }

  const handleToggleLabel = async (label: string, currentlySelected: boolean): Promise<void> => {
    setBusyKey('labels')
    const previous = labels
    const next = currentlySelected
      ? previous.filter((item) => item.toLowerCase() !== label.toLowerCase())
      : [...previous, label]
    setLabels(next)
    try {
      const result =
        props.provider === 'github'
          ? await updateGitHub(
              currentlySelected ? { removeLabels: [label] } : { addLabels: [label] }
            )
          : await updateGitLab(
              currentlySelected ? { removeLabels: [label] } : { addLabels: [label] }
            )
      if (!result.ok) {
        setLabels(previous)
        toast.error(result.error)
        return
      }
      props.onLabelsChanged?.(next)
      toast.success(
        currentlySelected
          ? translate(
              'auto.components.right.sidebar.issuesPanel.labelRemoved',
              'Removed label {{value0}}',
              { value0: label }
            )
          : translate(
              'auto.components.right.sidebar.issuesPanel.labelAdded',
              'Added label {{value0}}',
              { value0: label }
            )
      )
    } catch (err) {
      setLabels(previous)
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyKey(null)
    }
  }

  const handleToggleAssignee = async (login: string, currentlySelected: boolean): Promise<void> => {
    setBusyKey('assignees')
    const previous = assignees
    const next = currentlySelected
      ? previous.filter((item) => item.toLowerCase() !== login.toLowerCase())
      : [...previous, login]
    setAssignees(next)
    try {
      const result =
        props.provider === 'github'
          ? await updateGitHub(
              currentlySelected ? { removeAssignees: [login] } : { addAssignees: [login] }
            )
          : await updateGitLab(
              currentlySelected ? { removeAssignees: [login] } : { addAssignees: [login] }
            )
      if (!result.ok) {
        setAssignees(previous)
        toast.error(result.error)
        return
      }
      props.onAssigneesChanged?.(next)
      toast.success(
        currentlySelected
          ? translate(
              'auto.components.right.sidebar.issuesPanel.assigneeRemoved',
              'Unassigned {{value0}}',
              { value0: login }
            )
          : translate(
              'auto.components.right.sidebar.issuesPanel.assigneeAdded',
              'Assigned {{value0}}',
              { value0: login }
            )
      )
    } catch (err) {
      setAssignees(previous)
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusMenu
        provider={props.provider}
        state={state}
        busy={busyKey === 'state'}
        issueNumber={props.issueNumber}
        onPick={(next) => {
          void handleStatePick(next)
        }}
      />
      <MultiSelectMenu
        title={translate('auto.components.right.sidebar.issuesPanel.assignees', 'Assignees')}
        icon={<UserRound className="size-3" />}
        selected={assignees}
        options={assigneeOptions}
        loading={props.provider === 'github' ? assigneeMeta.loading : gitlabUsersLoading}
        busy={busyKey === 'assignees'}
        emptyLabel={translate(
          'auto.components.right.sidebar.issuesPanel.noAssignees',
          'No assignees found'
        )}
        searchPlaceholder={translate(
          'auto.components.right.sidebar.issuesPanel.searchPeople',
          'Search people…'
        )}
        onToggle={(id, selected) => {
          void handleToggleAssignee(id, selected)
        }}
      />
      <MultiSelectMenu
        title={translate('auto.components.right.sidebar.issuesPanel.labels', 'Labels')}
        icon={<Tag className="size-3" />}
        selected={labels}
        options={labelOptions}
        loading={labelsLoading}
        busy={busyKey === 'labels'}
        emptyLabel={translate(
          'auto.components.right.sidebar.issuesPanel.noLabels',
          'No labels found'
        )}
        searchPlaceholder={translate(
          'auto.components.right.sidebar.issuesPanel.searchLabels',
          'Search labels…'
        )}
        onToggle={(id, selected) => {
          void handleToggleLabel(id, selected)
        }}
      />
      {props.onCreateWorkspace ? (
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="h-6 gap-1 px-2"
          onClick={props.onCreateWorkspace}
        >
          <FolderPlus className="size-3" />
          {translate(
            'auto.components.right.sidebar.issuesPanel.createWorkspaceBtn',
            'Create workspace'
          )}
        </Button>
      ) : null}
    </div>
  )
}

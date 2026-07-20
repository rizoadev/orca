import { projectHostSetupProjectionFromRepos } from '../../../../shared/project-host-setup-projection'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import {
  normalizeTaskSourceContext,
  type TaskSourceContext
} from '../../../../shared/task-source-context'
import type {
  GitHubWorkItem,
  GitLabProjectRef,
  GitLabWorkItem,
  Repo
} from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import type { RepoIssueProvider } from './repo-issue-provider'

export const ISSUE_LIST_LIMIT = 40
export const GITHUB_OPEN_ISSUES_QUERY = 'is:issue is:open'

const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

export function formatIssueRelativeTime(input: string | undefined): string {
  if (!input) {
    return ''
  }
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const diffMs = date.getTime() - Date.now()
  const diffMinutes = Math.round(diffMs / 60_000)
  if (Math.abs(diffMinutes) < 60) {
    return relativeTimeFormatter.format(diffMinutes, 'minute')
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return relativeTimeFormatter.format(diffHours, 'hour')
  }

  const diffDays = Math.round(diffHours / 24)
  return relativeTimeFormatter.format(diffDays, 'day')
}

function buildGitLabIdentity(projectRef: GitLabProjectRef) {
  const pathParts = projectRef.path
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
  const projectName = pathParts.at(-1) ?? null
  const namespace = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : null
  return {
    provider: 'gitlab' as const,
    projectId: projectRef.path,
    namespace,
    project: projectName,
    webUrl: `https://${projectRef.host}/${projectRef.path}`
  }
}

function hostFromRemote(remoteUrl: string): string | null {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(remoteUrl)) {
    const scpLike = remoteUrl.match(/^(?:[^@/:]+@)?([^:\s/]+):/)
    return scpLike?.[1]?.trim().toLowerCase() || null
  }
  try {
    return new URL(remoteUrl).hostname.toLowerCase() || null
  } catch {
    return null
  }
}

function pathFromRemote(remoteUrl: string): string | null {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(remoteUrl)) {
    const scpLike = remoteUrl.match(/^(?:[^@/:]+@)?[^:\s/]+:([^\s]+?)(?:\.git)?$/)
    return scpLike?.[1]?.replace(/\/+$/, '') || null
  }
  try {
    return new URL(remoteUrl).pathname
      .replace(/^\/+/, '')
      .replace(/\.git$/i, '')
      .replace(/\/+$/, '')
  } catch {
    return null
  }
}

function buildGitLabProviderIdentityFromRepo(repo: Repo) {
  const remoteUrl = repo.gitRemoteIdentity?.remoteUrl?.trim()
  if (!remoteUrl) {
    return null
  }
  // Why: sourceContext only needs enough identity for routing/cache scope; the
  // main process still resolves the exact GitLab project from the repo path.
  const host =
    hostFromRemote(remoteUrl) ??
    repo.gitRemoteIdentity?.canonicalKey.split('/')[0]?.trim() ??
    'gitlab.com'
  const path =
    pathFromRemote(remoteUrl) ??
    repo.gitRemoteIdentity?.canonicalKey.split('/').slice(1).join('/') ??
    ''
  if (!path.includes('/')) {
    return null
  }
  return buildGitLabIdentity({ host, path })
}

export function getRepoIssueSourceContext(
  repo: Repo | null | undefined,
  provider: RepoIssueProvider
): TaskSourceContext | null {
  if (!repo) {
    return null
  }
  const projection = projectHostSetupProjectionFromRepos([repo])
  const project = projection.projects[0]
  const setup = projection.setups[0]
  const providerIdentity =
    provider === 'github' && project?.providerIdentity?.provider === 'github'
      ? project.providerIdentity
      : provider === 'gitlab'
        ? buildGitLabProviderIdentityFromRepo(repo)
        : null
  return normalizeTaskSourceContext({
    provider,
    projectId: setup?.projectId ?? project?.id ?? repo.id,
    hostId: setup?.hostId ?? getRepoExecutionHostId(repo),
    projectHostSetupId: setup?.id,
    repoId: repo.id,
    providerIdentity
  })
}

export type IssueRow = {
  id: string
  number: number
  title: string
  stateLabel: string
  stateTone: string
  updatedAt?: string
  url: string
  provider: RepoIssueProvider
  githubItem?: GitHubWorkItem
  gitlabItem?: GitLabWorkItem
}

function gitlabStateTone(state: GitLabWorkItem['state']): string {
  if (state === 'closed') {
    return 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300'
  }
  if (state === 'merged') {
    return 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300'
  }
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
}

function gitlabStateLabel(state: GitLabWorkItem['state']): string {
  if (state === 'closed') {
    return translate('auto.components.TaskPage.d09bf34db7', 'Closed')
  }
  if (state === 'merged') {
    return translate('auto.components.github.pr.merge.state.83ecdbb4a6', 'Merged')
  }
  if (state === 'draft') {
    return translate('auto.components.TaskPage.054bf695cc', 'Draft')
  }
  return translate('auto.components.TaskPage.606a85c774', 'Open')
}

export function toGitHubIssueRows(items: GitHubWorkItem[]): IssueRow[] {
  return items
    .filter((item) => item.type === 'issue')
    .map((item) => ({
      id: item.id,
      number: item.number,
      title: item.title,
      stateLabel: '',
      stateTone: '',
      updatedAt: item.updatedAt,
      url: item.url,
      provider: 'github' as const,
      githubItem: item
    }))
}

export function toGitLabIssueRows(items: GitLabWorkItem[], repoId: string): IssueRow[] {
  return items.map((item) => ({
    id: item.id,
    number: item.number,
    title: item.title,
    stateLabel: gitlabStateLabel(item.state),
    stateTone: gitlabStateTone(item.state),
    updatedAt: item.updatedAt,
    url: item.url,
    provider: 'gitlab' as const,
    gitlabItem: { ...item, repoId }
  }))
}

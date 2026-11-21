import { buildLinearIssueComposerData } from '@/lib/work-items/linear/linear-linked-work-item'
import type { LinkedWorkItemSummary } from '@/lib/workspace/creation/new-workspace'
import { useAppStore } from '@/store'
import type {
  GitHubWorkItem,
  GitLabWorkItem,
  LinearIssue,
  Repo
} from '../../../../../../shared/types'
import { getRepoIssueSourceContext } from './issues-panel-rows'

export function openGitHubIssueWorkspaceComposer(
  openModal: (modal: 'new-workspace-composer', data?: Record<string, unknown>) => void,
  repo: Repo,
  item: GitHubWorkItem
): void {
  const linkedWorkItem: LinkedWorkItemSummary = {
    type: item.type,
    number: item.number,
    title: item.title,
    url: item.url
  }
  openModal('new-workspace-composer', {
    linkedWorkItem,
    taskSourceContext: getRepoIssueSourceContext(repo, 'github'),
    prefilledName: item.title,
    initialRepoId: item.repoId,
    telemetrySource: 'sidebar'
  })
}

export function startGitHubIssueFromPanel(
  openModal: (modal: 'new-workspace-composer', data?: Record<string, unknown>) => void,
  repo: Repo,
  item: GitHubWorkItem
): void {
  useAppStore.getState().recordFeatureInteraction?.('github-tasks')
  openGitHubIssueWorkspaceComposer(openModal, repo, item)
}

export function startGitLabIssueFromPanel(
  openModal: (modal: 'new-workspace-composer', data?: Record<string, unknown>) => void,
  repo: Repo,
  item: GitLabWorkItem
): void {
  useAppStore.getState().recordFeatureInteraction?.('gitlab-tasks')
  const linkedWorkItem: LinkedWorkItemSummary = {
    type: item.type,
    number: item.number,
    title: item.title,
    url: item.url
  }
  openModal('new-workspace-composer', {
    linkedWorkItem,
    taskSourceContext: getRepoIssueSourceContext(repo, 'gitlab'),
    prefilledName: item.title,
    initialRepoId: item.repoId,
    telemetrySource: 'sidebar'
  })
}

// Why: Linear identifiers are strings, so the composer gets the linked-work-item
// shape (which carries linearIdentifier) instead of a numeric issue number.
export function startLinearIssueFromPanel(
  openModal: (modal: 'new-workspace-composer', data?: Record<string, unknown>) => void,
  repo: Repo,
  item: LinearIssue
): void {
  useAppStore.getState().recordFeatureInteraction?.('linear-tasks')
  const composer = buildLinearIssueComposerData(item, getRepoIssueSourceContext(repo, 'linear'))
  openModal('new-workspace-composer', {
    ...composer,
    initialRepoId: repo.id,
    telemetrySource: 'sidebar'
  })
}

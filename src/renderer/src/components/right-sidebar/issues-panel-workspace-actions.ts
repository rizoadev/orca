import { createGitHubWorkItemWorkspaceInBackground } from '@/lib/github-work-item-background-create'
import { buildLinearIssueLinkedWorkItem } from '@/lib/linear-linked-work-item'
import type { LinkedWorkItemSummary } from '@/lib/new-workspace'
import { useAppStore } from '@/store'
import type { GitHubWorkItem, GitLabWorkItem, LinearIssue, Repo } from '../../../../shared/types'
import { getLinearIssueWorkspaceName } from '../../../../shared/workspace-name'
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
  void createGitHubWorkItemWorkspaceInBackground({
    item,
    repoId: item.repoId,
    taskSourceContext: getRepoIssueSourceContext(repo, 'github'),
    telemetrySource: 'sidebar',
    openModalFallback: () => openGitHubIssueWorkspaceComposer(openModal, repo, item)
  })
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
  const linkedWorkItem = buildLinearIssueLinkedWorkItem(item)
  openModal('new-workspace-composer', {
    linkedWorkItem,
    taskSourceContext: getRepoIssueSourceContext(repo, 'linear'),
    prefilledName: getLinearIssueWorkspaceName(item),
    initialRepoId: repo.id,
    telemetrySource: 'sidebar'
  })
}

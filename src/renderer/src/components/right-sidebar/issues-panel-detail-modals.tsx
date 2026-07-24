import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import GitHubItemDialog from '@/components/GitHubItemDialog'
import GitLabItemDialog from '@/components/GitLabItemDialog'
import type { GitHubWorkItem, GitLabWorkItem, Repo } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import { IssueDetailActionBar } from './issue-detail-action-bar'
import { getRepoIssueSourceContext } from './issues-panel-rows'

export function IssuesPanelDetailModals({
  activeRepo,
  selectedGitHubItem,
  selectedGitLabItem,
  onCloseGitHub,
  onCloseGitLab,
  onUseGitHub,
  onUseGitLab
}: {
  activeRepo: Repo
  selectedGitHubItem: GitHubWorkItem | null
  selectedGitLabItem: GitLabWorkItem | null
  onCloseGitHub: () => void
  onCloseGitLab: () => void
  onUseGitHub: (item: GitHubWorkItem) => void
  onUseGitLab: (item: GitLabWorkItem) => void
}): React.JSX.Element {
  const [githubState, setGithubState] = useState<'open' | 'closed'>('open')
  const [githubLabels, setGithubLabels] = useState<string[]>([])
  const [githubAssignees, setGithubAssignees] = useState<string[]>([])
  const [gitlabState, setGitlabState] = useState<'opened' | 'closed'>('opened')
  const [gitlabLabels, setGitlabLabels] = useState<string[]>([])
  const [gitlabAssignees, setGitlabAssignees] = useState<string[]>([])

  useEffect(() => {
    if (!selectedGitHubItem) {
      return
    }
    setGithubState(selectedGitHubItem.state === 'closed' ? 'closed' : 'open')
    setGithubLabels(selectedGitHubItem.labels ?? [])
    setGithubAssignees((selectedGitHubItem.assignees ?? []).map((user) => user.login))
  }, [selectedGitHubItem])

  useEffect(() => {
    if (!selectedGitLabItem) {
      return
    }
    setGitlabState(selectedGitLabItem.state === 'closed' ? 'closed' : 'opened')
    setGitlabLabels(selectedGitLabItem.labels ?? [])
    setGitlabAssignees([])
    // Why: GitLab list rows don't carry assignees; hydrate once from work-item details.
    let cancelled = false
    void window.api.gl
      .workItemDetails({
        repoPath: activeRepo.path,
        repoId: activeRepo.id,
        sourceContext: getRepoIssueSourceContext(activeRepo, 'gitlab'),
        iid: selectedGitLabItem.number,
        type: 'issue'
      })
      .then((details) => {
        if (!cancelled && details?.assignees) {
          setGitlabAssignees(details.assignees)
        }
      })
      .catch(() => {
        // keep empty assignees on detail fetch failure
      })
    return () => {
      cancelled = true
    }
  }, [activeRepo, selectedGitLabItem])

  // Why: only render the AI action row for issues (not PRs); the shared dialog
  // wraps both types, so the slot is gated per item kind here.
  const githubTabBarSlot =
    selectedGitHubItem?.type === 'issue' ? (
      <IssueDetailActionBar
        repo={activeRepo}
        provider="github"
        issueNumber={selectedGitHubItem.number}
        issueTitle={selectedGitHubItem.title}
        issueUrl={selectedGitHubItem.url}
        labels={githubLabels}
        assignees={githubAssignees}
        state={githubState}
        githubItem={selectedGitHubItem}
        onIssueClosed={onCloseGitHub}
        onCreateWorkspace={() => {
          const item = selectedGitHubItem
          onCloseGitHub()
          onUseGitHub(item)
        }}
        onStateChanged={(state) => {
          setGithubState(state === 'opened' ? 'open' : state)
        }}
        onLabelsChanged={setGithubLabels}
        onAssigneesChanged={setGithubAssignees}
      />
    ) : null

  const gitlabTabBarSlot =
    selectedGitLabItem?.type === 'issue' ? (
      <IssueDetailActionBar
        repo={activeRepo}
        provider="gitlab"
        issueNumber={selectedGitLabItem.number}
        issueTitle={selectedGitLabItem.title}
        issueUrl={selectedGitLabItem.url}
        labels={gitlabLabels}
        assignees={gitlabAssignees}
        state={gitlabState}
        gitlabItem={selectedGitLabItem}
        onIssueClosed={onCloseGitLab}
        onCreateWorkspace={() => {
          const item = selectedGitLabItem
          onCloseGitLab()
          onUseGitLab(item)
        }}
        onStateChanged={(state) => {
          setGitlabState(state === 'open' ? 'opened' : state)
        }}
        onLabelsChanged={setGitlabLabels}
        onAssigneesChanged={setGitlabAssignees}
      />
    ) : null

  return (
    <>
      <Dialog
        open={selectedGitHubItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            onCloseGitHub()
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(820px,90vh)] w-[min(920px,calc(100vw-2rem))] max-w-[min(920px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(920px,calc(100vw-2rem))]"
        >
          <DialogTitle className="sr-only">
            {selectedGitHubItem
              ? selectedGitHubItem.title
              : translate('auto.components.right.sidebar.issuesPanel.githubDetail', 'Issue detail')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {translate(
              'auto.components.right.sidebar.issuesPanel.githubDetailBody',
              'GitHub issue detail'
            )}
          </DialogDescription>
          {selectedGitHubItem ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <GitHubItemDialog
                workItem={selectedGitHubItem}
                repoPath={activeRepo.path}
                repoId={activeRepo.id}
                sourceContext={getRepoIssueSourceContext(activeRepo, 'github')}
                backLabel={translate(
                  'auto.components.right.sidebar.issuesPanel.backToIssues',
                  'Issues'
                )}
                tabBarTrailingSlot={githubTabBarSlot}
                onUse={(item) => {
                  onCloseGitHub()
                  onUseGitHub(item)
                }}
                onClose={onCloseGitHub}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <GitLabItemDialog
        item={selectedGitLabItem}
        repoPath={activeRepo.path}
        repoId={activeRepo.id}
        sourceContext={getRepoIssueSourceContext(activeRepo, 'gitlab')}
        presentation="modal"
        hideFooterExternalActions={selectedGitLabItem?.type === 'issue'}
        tabBarTrailingSlot={gitlabTabBarSlot}
        onCreateWorkspace={(item) => {
          onCloseGitLab()
          onUseGitLab(item)
        }}
        onClose={onCloseGitLab}
      />
    </>
  )
}

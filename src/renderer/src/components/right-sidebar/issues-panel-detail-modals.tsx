import React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import GitHubItemDialog from '@/components/GitHubItemDialog'
import GitLabItemDialog from '@/components/GitLabItemDialog'
import type { GitHubWorkItem, GitLabWorkItem, Repo } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
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
            <div className="min-h-0 flex-1 overflow-hidden">
              <GitHubItemDialog
                workItem={selectedGitHubItem}
                repoPath={activeRepo.path}
                repoId={activeRepo.id}
                sourceContext={getRepoIssueSourceContext(activeRepo, 'github')}
                backLabel={translate(
                  'auto.components.right.sidebar.issuesPanel.backToIssues',
                  'Issues'
                )}
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
        onCreateWorkspace={(item) => {
          onCloseGitLab()
          onUseGitLab(item)
        }}
        onClose={onCloseGitLab}
      />
    </>
  )
}

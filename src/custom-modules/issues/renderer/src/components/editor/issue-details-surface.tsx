/**
 * Main-view surface for an issue-details tab: renders the same provider dialog
 * body used by the sidebar, but full-size inside the editor tab strip.
 */
import React from 'react'
import GitHubItemDialog from '@/components/GitHubItemDialog'
import GitLabItemDialog from '@/components/GitLabItemDialog'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import type { GitHubWorkItem, GitLabWorkItem } from '../../../../../../shared/types'

export function IssueDetailsSurface({ activeFile }: { activeFile: OpenFile }): React.JSX.Element {
  const state = activeFile.issueDetails
  const closeTab = useAppStore((s) => s.closeFile)

  if (!state) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {translate(
          'auto.components.editor.EditorContent.issueDetailsUnavailable',
          'Issue unavailable.'
        )}
      </div>
    )
  }

  if (state.provider === 'github' && state.githubItem) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <GitHubItemDialog
          workItem={state.githubItem}
          repoPath={state.repoPath}
          repoId={state.repoId}
          sourceContext={state.sourceContext}
          backLabel={translate('auto.components.right.sidebar.issuesPanel.backToIssues', 'Issues')}
          onUse={(item: GitHubWorkItem) => state.githubItem && void item}
          onClose={() => closeTab(activeFile.id)}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <GitLabItemDialog
        item={state.gitlabItem ?? null}
        repoPath={state.repoPath}
        repoId={state.repoId}
        sourceContext={state.sourceContext}
        onCreateWorkspace={(item: GitLabWorkItem) => void item}
        onClose={() => closeTab(activeFile.id)}
      />
    </div>
  )
}

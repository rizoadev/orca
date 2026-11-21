import type { EditorGet, EditorSet } from '../types/editor-set-get'
import type { EditorSlice } from '../types/editor-slice'
import type { OpenFile } from '../types/open-file'
import {
  buildIssueDetailsTabId,
  getIssueDetailsTabLabel
} from '../../../../../../shared/issue-details-tab'
import { openWorkspaceEditorItem } from '../tabs/workspace-editor-item'

export function createIssueDetailsActions(
  set: EditorSet,
  get: EditorGet
): Pick<EditorSlice, 'openIssueDetails'> {
  return {
    openIssueDetails: (worktreeId, state) => {
      const id = buildIssueDetailsTabId(
        worktreeId,
        state.provider,
        state.githubItem?.number ?? state.gitlabItem?.number ?? 0,
        state.repoId ?? state.repoPath
      )
      const item = state.githubItem ?? state.gitlabItem
      const label = item
        ? getIssueDetailsTabLabel({ number: item.number, title: item.title })
        : state.provider
      set((s) => {
        const focus = {
          activeFileId: id,
          activeTabType: 'editor' as const,
          activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
          activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' as const }
        }
        const existing = s.openFiles.find((f) => f.id === id)
        if (existing) {
          return {
            ...focus,
            openFiles: s.openFiles.map((f) =>
              f.id === id
                ? { ...f, mode: 'issue-details' as const, relativePath: label, issueDetails: state }
                : f
            )
          }
        }
        const newFile: OpenFile = {
          id,
          filePath: id,
          relativePath: label,
          worktreeId,
          language: 'plaintext',
          isDirty: false,
          mode: 'issue-details',
          issueDetails: state
        }
        return { ...focus, openFiles: [...s.openFiles, newFile] }
      })
      void openWorkspaceEditorItem(get(), id, worktreeId, label, 'issue-details')
    }
  }
}

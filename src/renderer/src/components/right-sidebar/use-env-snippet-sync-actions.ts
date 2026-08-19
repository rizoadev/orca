import { useCallback } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { joinPath } from '@/lib/path'
import type { GitLabSnippet, Repo } from '../../../../shared/types'
import {
  syncFileToSnippet,
  restoreFileFromSnippet,
  deleteSnippetFromGitLab,
  fetchSnippetContent,
  attachLocalRepo
} from './env-snippet-sync-actions'
import { relativePathFromSnippetTitle } from './env-snippet-sync-encoding'
import type { SyncStatus } from './env-snippet-sync-list'

export type SnippetSyncDeps = {
  repo: Repo
  worktreePath: string
  connectionId: string | null
  branch: string
  isGitLab: boolean
  setPathStatus: (relativePath: string, status: SyncStatus) => void
  loadSnippets: () => Promise<void>
  setSnippets: (updater: (current: GitLabSnippet[]) => GitLabSnippet[]) => void
  setPreview: (preview: { filePath: string; relativePath: string; snippetContent: string }) => void
  setAttaching: (value: boolean) => void
  setLoadError: (value: string | null) => void
}

export function useEnvSnippetSyncActions(deps: SnippetSyncDeps) {
  const { repo, worktreePath, connectionId, branch, isGitLab, setPathStatus } = deps

  const handleUpload = useCallback(
    async (relativePath: string) => {
      if (!isGitLab) {
        return
      }
      setPathStatus(relativePath, 'uploading')
      try {
        await syncFileToSnippet(
          { repo, worktreePath, connectionId },
          joinPath(worktreePath, relativePath),
          relativePath,
          branch
        )
        void deps.loadSnippets()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setPathStatus(relativePath, 'idle')
      }
    },
    [branch, connectionId, isGitLab, repo, setPathStatus, worktreePath] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleDownload = useCallback(
    async (snippet: GitLabSnippet) => {
      if (!isGitLab) {
        return
      }
      const relativePath = relativePathFromSnippetTitle(snippet.title)
      if (relativePath === null) {
        return
      }
      setPathStatus(relativePath, 'downloading')
      try {
        await restoreFileFromSnippet({ repo, worktreePath, connectionId }, relativePath, snippet)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setPathStatus(relativePath, 'idle')
      }
    },
    [connectionId, isGitLab, repo, setPathStatus, worktreePath]
  )

  const handleDelete = useCallback(
    async (snippet: GitLabSnippet) => {
      if (!isGitLab) {
        return
      }
      const relativePath = relativePathFromSnippetTitle(snippet.title)
      if (relativePath === null) {
        return
      }
      setPathStatus(relativePath, 'deleting')
      try {
        await deleteSnippetFromGitLab({ repo, worktreePath, connectionId }, snippet)
        deps.setSnippets((current) => current.filter((s) => s.id !== snippet.id))
        void deps.loadSnippets()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setPathStatus(relativePath, 'idle')
      }
    },
    [connectionId, isGitLab, repo, setPathStatus, worktreePath] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handlePreview = useCallback(
    async (snippet: GitLabSnippet) => {
      if (!isGitLab || !worktreePath) {
        return
      }
      const relativePath = relativePathFromSnippetTitle(snippet.title)
      if (relativePath === null) {
        return
      }
      try {
        const snippetContent = await fetchSnippetContent(
          { repo, worktreePath, connectionId },
          snippet
        )
        deps.setPreview({
          filePath: joinPath(worktreePath, relativePath),
          relativePath,
          snippetContent
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    },
    [connectionId, isGitLab, repo, worktreePath] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleAttach = useCallback(async () => {
    if (!worktreePath || !window.api.repos?.add) {
      return
    }
    deps.setAttaching(true)
    try {
      await attachLocalRepo(worktreePath)
      deps.setLoadError(null)
      await deps.loadSnippets()
      toast.success(
        translate(
          'auto.components.right.sidebar.EnvSnippetSyncSection.attached',
          'Project attached to Orca'
        )
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      deps.setAttaching(false)
    }
  }, [worktreePath]) // eslint-disable-line react-hooks/exhaustive-deps

  return { handleUpload, handleDownload, handleDelete, handlePreview, handleAttach }
}

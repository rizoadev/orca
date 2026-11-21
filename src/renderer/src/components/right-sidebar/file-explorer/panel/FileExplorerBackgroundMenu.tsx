import { preventSecondaryMenuSelection } from '@/components/ui/prevent-secondary-menu-selection'
import React, { useEffect } from 'react'
import { FilePlus, FolderPlus, Code2, Database } from 'lucide-react'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '@/lib/overlay-interaction/close-all-context-menus'
import { useRepoById } from '@/store/repos/use-repository-catalog'
import { useActiveWorktree } from '@/store/workspaces/selection/use-selected-worktree'
import { useAppStore } from '@/store'
import { branchName } from '@/lib/source-control/branches/branch-name'
import { toast } from 'sonner'
import type { GitLabSnippetCreateInput } from '../../../../../../custom-modules/snippets/shared/types'
import { gitLabApiFor } from '@/runtime/repository-gitlab/gitlab-owner-api'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host/execution-host'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useTranslate } from '@/i18n/use-translate'

/** Targets creation and paste at the displayed directory while keeping workspace operations rooted at the worktree. */
export function FileExplorerBackgroundMenu({
  open,
  onOpenChange,
  point,
  worktreePath,
  displayDepth = 0,
  onStartNew
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  point: { x: number; y: number }
  displayDepth?: number
  worktreePath: string
  onStartNew: (type: 'file' | 'folder', dir: string, depth: number) => void
}): React.JSX.Element {
  const t = useTranslate()
  useEffect(() => {
    const close = (): void => onOpenChange(false)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, close)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, close)
  }, [onOpenChange])

  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const isGitLab = activeRepo?.gitRemoteIdentity?.remoteUrl?.toLowerCase().includes('gitlab')
  const tursoUrl = useAppStore((s) => s.settings?.tursoDatabaseUrl?.trim() ?? '')
  const tursoToken = useAppStore((s) => s.settings?.tursoAuthToken?.trim() ?? '')
  const isTursoConfigured = tursoUrl !== '' && tursoToken !== ''

  const handleSnippetSync = async (): Promise<void> => {
    if (!isGitLab || !activeRepo?.path || !activeRepo?.id) {
      return
    }
    try {
      const result = await window.api.fs
        .readFile({ filePath: worktreePath })
        .catch(() => ({ content: '' }))
      const content = typeof result === 'string' ? result : (result?.content ?? '')
      const fileName = worktreePath.split('/').pop() ?? 'snippet-file'
      const isEnvFile = fileName.startsWith('.env')
      const title = isEnvFile
        ? `orca-sync:${branchName(activeWorktree?.branch ?? 'main')}:${fileName}`
        : fileName.replace(/\.[^.]+$/, '')
      const input: GitLabSnippetCreateInput = {
        title,
        fileName,
        content,
        visibility: 'private',
        description: 'Sync from Orca File Explorer'
      }
      const snippetResult = await gitLabApiFor({
        repoPath: activeRepo.path,
        repoOwnerExecutionHostId: getRepoExecutionHostId(activeRepo)
      }).createProjectSnippet({ repoPath: activeRepo.path, repoId: activeRepo.id, ...input })
      if (snippetResult.ok) {
        toast.success('Synced to GitLab snippet')
      } else {
        toast.error(snippetResult.error || 'Failed to sync snippet')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to sync snippet')
    }
  }

  const handleTursoSync = async (): Promise<void> => {
    if (!isTursoConfigured || !activeRepo?.id || !activeWorktree) {
      return
    }
    try {
      const result = await window.api.fs
        .readFile({ filePath: worktreePath })
        .catch(() => ({ content: '' }))
      const content = typeof result === 'string' ? result : (result?.content ?? '')
      const fileName = worktreePath.split('/').pop() ?? 'snippet-file'
      const isEnvFile = fileName.startsWith('.env')
      const title = isEnvFile
        ? `orca-sync:${branchName(activeWorktree.branch ?? 'main')}:${fileName}`
        : fileName.replace(/\.[^.]+$/, '')
      const snippetResult = await window.api.turso.createSnippet({
        url: tursoUrl,
        authToken: tursoToken,
        repoId: activeRepo.id,
        branch: branchName(activeWorktree.branch ?? 'main'),
        title,
        fileName,
        content
      })
      if (snippetResult.ok) {
        toast.success('Synced to Turso snippet')
      } else {
        toast.error(snippetResult.error || 'Failed to sync snippet')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to sync snippet')
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none fixed size-px opacity-0"
          style={{ left: point.x, top: point.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-48"
        sideOffset={0}
        align="start"
        onPointerUpCapture={preventSecondaryMenuSelection}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuItem onSelect={() => onStartNew('file', worktreePath, displayDepth)}>
          <FilePlus />
          {t('auto.components.right.sidebar.FileExplorerBackgroundMenu.21fe46ed36', 'New File')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onStartNew('folder', worktreePath, displayDepth)}>
          <FolderPlus />
          {t('auto.components.right.sidebar.FileExplorerBackgroundMenu.3b5e2dcb8d', 'New Folder')}
        </DropdownMenuItem>
        {isGitLab && (
          <DropdownMenuItem onSelect={() => void handleSnippetSync()}>
            <Code2 />
            {t(
              'auto.components.right.sidebar.FileExplorerBackgroundMenu.snippetSync',
              'Sync to GitLab Snippet'
            )}
          </DropdownMenuItem>
        )}
        {isTursoConfigured && (
          <DropdownMenuItem onSelect={() => void handleTursoSync()}>
            <Database />
            {t(
              'auto.components.right.sidebar.FileExplorerBackgroundMenu.tursoSync',
              'Sync to Turso'
            )}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

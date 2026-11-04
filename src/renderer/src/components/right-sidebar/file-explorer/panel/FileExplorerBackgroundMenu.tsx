import { preventSecondaryMenuSelection } from '@/components/ui/prevent-secondary-menu-selection'
import React, { useEffect } from 'react'
import { FilePlus, FolderPlus, Code2 } from 'lucide-react'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '@/lib/close-all-context-menus'
import { useRepoById, useActiveWorktree } from '@/store/selectors'
import { branchName } from '@/lib/git-utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { toast } from 'sonner'
import { createProjectSnippet } from '../../../../custom-modules/snippets/main/gitlab/snippets'
import type { GitLabSnippetCreateInput } from '../../../../custom-modules/snippets/shared/types'
import type { IssueSourcePreference } from '../../../../shared/repo-types'

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
  useEffect(() => {
    const close = (): void => onOpenChange(false)
    window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, close)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, close)
  }, [onOpenChange])

  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const isGitLab = activeRepo?.gitRemoteIdentity?.remoteUrl?.toLowerCase().includes('gitlab')

  const handleSnippetSync = async () => {
    if (!isGitLab || !activeRepo?.path || !activeRepo?.id) {
      return
    }

    try {
      // Read file content
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

      const preference: IssueSourcePreference = {
        provider: 'gitlab',
        remoteUrl: activeRepo.gitRemoteIdentity?.remoteUrl ?? '',
        connectionId: activeRepo.connectionId ?? undefined,
        branch: activeWorktree?.branch ?? 'main'
      }

      const snippetResult = await createProjectSnippet(
        activeRepo.path,
        input,
        preference,
        activeRepo.connectionId ?? null
      )

      if (snippetResult.ok) {
        toast.success('Synced to GitLab snippet')
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
          {translate(
            'auto.components.right.sidebar.FileExplorerBackgroundMenu.21fe46ed36',
            'New File'
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onStartNew('folder', worktreePath, displayDepth)}>
          <FolderPlus />
          {translate(
            'auto.components.right.sidebar.FileExplorerBackgroundMenu.3b5e2dcb8d',
            'New Folder'
          )}
        </DropdownMenuItem>
        {isGitLab && (
          <DropdownMenuItem onSelect={handleSnippetSync}>
            <Code2 />
            {translate(
              'auto.components.right.sidebar.FileExplorerBackgroundMenu.snippetSync',
              'Sync to GitLab Snippet'
            )}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

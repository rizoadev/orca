import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { joinPath } from '@/lib/path'
import type { GitLabSnippet, Repo } from '../../../../shared/types'
import { getRepoIssueSourceContext } from './issues-panel-rows'
import {
  snippetTitle,
  encodeSnippetFileName,
  SNIPPET_VISIBILITY
} from './env-snippet-sync-encoding'

export type EnvSnippetSyncContext = {
  repo: Repo
  worktreePath: string
  connectionId: string | null
}

function sourceArgs(repo: Repo) {
  return {
    repoPath: repo.path,
    repoId: repo.id,
    sourceContext: getRepoIssueSourceContext(repo, 'gitlab')
  }
}

function openSnippetToast(message: string, webUrl: string | null | undefined): void {
  const openLabel = translate(
    'auto.components.right.sidebar.EnvSnippetSyncSection.openSnippet',
    'Open'
  )
  if (!webUrl) {
    toast.success(message)
    return
  }
  toast.success(message, {
    action: {
      label: openLabel,
      onClick: () => {
        void window.api.shell.openUrl(webUrl)
      }
    }
  })
}

export async function syncFileToSnippet(
  context: EnvSnippetSyncContext,
  absolutePath: string,
  relativePath: string,
  branch: string | null
): Promise<void> {
  const { repo, connectionId } = context
  const readResult = await window.api.fs.readFile({
    filePath: absolutePath,
    connectionId: connectionId ?? undefined
  })
  const title = snippetTitle(branch ?? '', relativePath)
  // Why: upsert by the exact combined title (branch + path) so re-uploading the
  // same file never creates a duplicate snippet on GitLab. Looked up against the
  // live remote rather than renderer cache, so a cold first upload still updates
  // an existing snippet instead of blindly creating another.
  const { existing, staleDuplicates } = await findSnippetsByTitle(context, title)
  const result = existing
    ? await window.api.gl.updateProjectSnippet({
        ...sourceArgs(repo),
        snippetId: existing.id,
        updates: {
          title,
          fileName: encodeSnippetFileName(relativePath),
          content: readResult.content,
          description: 'Synced file via Orca',
          visibility: SNIPPET_VISIBILITY
        }
      })
    : await window.api.gl.createProjectSnippet({
        ...sourceArgs(repo),
        title,
        fileName: encodeSnippetFileName(relativePath),
        content: readResult.content,
        description: 'Synced file via Orca',
        visibility: SNIPPET_VISIBILITY
      })
  if (!result.ok) {
    throw new Error(result.error)
  }
  // Why: clean up any older duplicates that share the same title so past
  // duplicate-race uploads converge back to a single snippet per branch+path.
  for (const dup of staleDuplicates) {
    await window.api.gl
      .deleteProjectSnippet({ ...sourceArgs(repo), snippetId: dup.id })
      .catch(() => {})
  }
  openSnippetToast(
    translate(
      'auto.components.right.sidebar.EnvSnippetSyncSection.uploaded',
      'Synced {{value0}} to GitLab snippet',
      { value0: relativePath }
    ),
    result.snippet.webUrl
  )
}

async function findSnippetsByTitle(
  context: EnvSnippetSyncContext,
  title: string
): Promise<{ existing: GitLabSnippet | undefined; staleDuplicates: GitLabSnippet[] }> {
  const fallback = { existing: undefined, staleDuplicates: [] }
  if (!window.api.gl?.listProjectSnippets) {
    return fallback
  }
  const result = await window.api.gl.listProjectSnippets({
    ...sourceArgs(context.repo),
    limit: 100
  })
  if (result.error) {
    return fallback
  }
  const matches = (result.items as GitLabSnippet[])
    .filter((s) => s.title.trim() === title)
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  return { existing: matches[0], staleDuplicates: matches.slice(1) }
}

export async function restoreFileFromSnippet(
  context: EnvSnippetSyncContext,
  relativePath: string,
  snippet: GitLabSnippet
): Promise<void> {
  const { repo, connectionId } = context
  const detailResult = await window.api.gl.getProjectSnippet({
    ...sourceArgs(repo),
    snippetId: snippet.id
  })
  if (!detailResult.ok) {
    throw new Error(detailResult.error)
  }
  await window.api.fs.writeFile({
    filePath: joinPath(context.worktreePath, relativePath),
    content: detailResult.snippet.content,
    connectionId: connectionId ?? undefined
  })
  openSnippetToast(
    translate(
      'auto.components.right.sidebar.EnvSnippetSyncSection.restored',
      'Restored {{value0}} from GitLab snippet',
      { value0: relativePath }
    ),
    detailResult.snippet.webUrl
  )
}

export async function deleteSnippetFromGitLab(
  context: EnvSnippetSyncContext,
  snippet: GitLabSnippet
): Promise<void> {
  const result = await window.api.gl.deleteProjectSnippet({
    ...sourceArgs(context.repo),
    snippetId: snippet.id
  })
  if (!result.ok) {
    throw new Error(result.error)
  }
  toast.success(
    translate(
      'auto.components.right.sidebar.EnvSnippetSyncSection.deleted',
      'Deleted snippet {{value0}}',
      { value0: snippet.title }
    )
  )
}

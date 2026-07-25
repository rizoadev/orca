import type { ClassifiedError, GitLabSnippet, IssueSourcePreference } from '../../shared/types'
import {
  acquire,
  classifyListIssuesError,
  getGlabKnownHosts,
  glabExecFileAsync,
  glabHostnameArgs,
  glabRepoExecOptions,
  release,
  resolveIssueSource,
  type LocalGitExecOptions
} from './gl-utils'
import { resolveSnippetDisplayFileName } from './snippet-path'

export type ProjectSnippetListResult = {
  items: GitLabSnippet[]
  error?: ClassifiedError
}

export {
  createProjectSnippet,
  deleteProjectSnippet,
  getProjectSnippet,
  updateProjectSnippet,
  type ProjectSnippetDeleteResult,
  type ProjectSnippetMutationResult
} from './snippet-mutations'

function encodedProject(projectPath: string): string {
  return encodeURIComponent(projectPath)
}

type RESTSnippet = {
  id?: number
  title?: string
  file_name?: string
  description?: string | null
  visibility?: string
  web_url?: string
  raw_url?: string
  updated_at?: string
  created_at?: string
  files?: { path?: string }[]
  author?: { username?: string | null; name?: string | null } | null
}

function mapSnippet(row: RESTSnippet): GitLabSnippet {
  return {
    id: typeof row.id === 'number' ? row.id : 0,
    title: row.title?.trim() || row.file_name?.trim() || 'Untitled snippet',
    fileName: resolveSnippetDisplayFileName({
      description: row.description,
      fileName: row.file_name,
      files: row.files
    }),
    description: row.description?.trim() || '',
    visibility:
      row.visibility === 'public' || row.visibility === 'internal' ? row.visibility : 'private',
    webUrl: row.web_url?.trim() || '',
    rawUrl: row.raw_url?.trim() || '',
    updatedAt: row.updated_at?.trim() || row.created_at?.trim() || '',
    authorUsername: row.author?.username?.trim() || row.author?.name?.trim() || ''
  }
}

/**
 * List project snippets for the resolved GitLab remote.
 * Uses `glab api projects/:id/snippets` so self-hosted hosts and nested groups work.
 */
export async function listProjectSnippets(
  repoPath: string,
  limit = 50,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<ProjectSnippetListResult> {
  const knownHosts = await getGlabKnownHosts(connectionId, localGitOptions)
  const { source: projectRef } = await resolveIssueSource(
    repoPath,
    preference,
    knownHosts,
    connectionId,
    localGitOptions
  )
  if (!projectRef) {
    return {
      items: [],
      error: {
        type: 'not_found',
        message: 'Could not resolve a GitLab project for this repository.'
      }
    }
  }

  const perPage = Math.min(Math.max(Math.floor(limit) || 50, 1), 100)
  await acquire()
  try {
    const { stdout } = await glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        `projects/${encodedProject(projectRef.path)}/snippets?per_page=${perPage}`
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
    const data = JSON.parse(stdout) as RESTSnippet[]
    return { items: Array.isArray(data) ? data.map(mapSnippet) : [] }
  } catch (err) {
    const stderr = err instanceof Error ? err.message : String(err)
    return {
      items: [],
      error: classifyListIssuesError(stderr)
    }
  } finally {
    release()
  }
}

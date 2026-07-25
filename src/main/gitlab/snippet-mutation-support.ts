import type {
  GitLabSnippetDetail,
  GitLabSnippetVisibility,
  IssueSourcePreference
} from '../../shared/types'
import {
  getGlabKnownHosts,
  resolveIssueSource,
  type LocalGitExecOptions,
  type ProjectRef
} from './gl-utils'
import { resolveSnippetDisplayFileName } from './snippet-path'

export type RESTSnippet = {
  id?: number
  title?: string
  file_name?: string
  description?: string | null
  visibility?: string
  web_url?: string
  raw_url?: string
  updated_at?: string
  created_at?: string
  content?: string | null
  files?: { path?: string; raw_url?: string }[]
  author?: { username?: string | null; name?: string | null } | null
}

export function encodedProject(projectPath: string): string {
  return encodeURIComponent(projectPath)
}

export function mapVisibility(value: string | undefined): GitLabSnippetVisibility {
  return value === 'public' || value === 'internal' ? value : 'private'
}

export function mapSnippetDetail(row: RESTSnippet, contentOverride?: string): GitLabSnippetDetail {
  const content =
    typeof contentOverride === 'string'
      ? contentOverride
      : typeof row.content === 'string'
        ? row.content
        : ''
  return {
    id: typeof row.id === 'number' ? row.id : 0,
    title: row.title?.trim() || row.file_name?.trim() || 'Untitled snippet',
    fileName: resolveSnippetDisplayFileName({
      description: row.description,
      fileName: row.file_name,
      files: row.files
    }),
    description: row.description?.trim() || '',
    visibility: mapVisibility(row.visibility),
    webUrl: row.web_url?.trim() || '',
    rawUrl: row.raw_url?.trim() || '',
    updatedAt: row.updated_at?.trim() || row.created_at?.trim() || '',
    authorUsername: row.author?.username?.trim() || row.author?.name?.trim() || '',
    content
  }
}

export async function resolveProjectRef(
  repoPath: string,
  preference: IssueSourcePreference | undefined,
  connectionId: string | null | undefined,
  localGitOptions: LocalGitExecOptions
): Promise<ProjectRef | null> {
  const knownHosts = await getGlabKnownHosts(connectionId, localGitOptions)
  const { source } = await resolveIssueSource(
    repoPath,
    preference,
    knownHosts,
    connectionId,
    localGitOptions
  )
  return source
}

export function fieldArgs(fields: Record<string, string>): string[] {
  return Object.entries(fields).flatMap(([key, value]) => ['-f', `${key}=${value}`])
}

import type {
  GitLabSnippetCreateInput,
  GitLabSnippetUpdateInput,
  IssueSourcePreference
} from '../../shared/types'
import {
  acquire,
  classifyGlabError,
  glabExecFileAsync,
  glabHostnameArgs,
  glabRepoExecOptions,
  release,
  type LocalGitExecOptions
} from './gl-utils'
import {
  encodedProject,
  fieldArgs,
  mapSnippetDetail,
  mapVisibility,
  resolveProjectRef,
  type RESTSnippet
} from './snippet-mutation-support'

export type ProjectSnippetMutationResult =
  | { ok: true; snippet: ReturnType<typeof mapSnippetDetail> }
  | { ok: false; error: string }

export type ProjectSnippetDeleteResult = { ok: true } | { ok: false; error: string }

export async function getProjectSnippet(
  repoPath: string,
  snippetId: number,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<ProjectSnippetMutationResult> {
  if (!Number.isInteger(snippetId) || snippetId <= 0) {
    return { ok: false, error: 'Invalid snippet id' }
  }
  const projectRef = await resolveProjectRef(repoPath, preference, connectionId, localGitOptions)
  if (!projectRef) {
    return { ok: false, error: 'Could not resolve GitLab project for this repository' }
  }

  await acquire()
  try {
    const execOptions = glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    const hostArgs = glabHostnameArgs(projectRef, connectionId)
    const { stdout } = await glabExecFileAsync(
      ['api', ...hostArgs, `projects/${encodedProject(projectRef.path)}/snippets/${snippetId}`],
      execOptions
    )
    const data = JSON.parse(stdout) as RESTSnippet
    if (typeof data.id !== 'number') {
      return { ok: false, error: 'Unexpected response from GitLab' }
    }
    // Why: modern GitLab multi-file snippets omit `content` in JSON; body lives at /raw.
    let content = typeof data.content === 'string' ? data.content : ''
    if (!content.trim()) {
      try {
        const raw = await glabExecFileAsync(
          [
            'api',
            ...hostArgs,
            `projects/${encodedProject(projectRef.path)}/snippets/${snippetId}/raw`
          ],
          execOptions
        )
        content = raw.stdout ?? ''
      } catch {
        content = ''
      }
    }
    return { ok: true, snippet: mapSnippetDetail(data, content) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: classifyGlabError(msg).message }
  } finally {
    release()
  }
}

export async function createProjectSnippet(
  repoPath: string,
  input: GitLabSnippetCreateInput,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<ProjectSnippetMutationResult> {
  const title = input.title?.trim() || ''
  const fileName = input.fileName?.trim() || ''
  const content = input.content ?? ''
  if (!title) {
    return { ok: false, error: 'Title is required' }
  }
  if (!fileName) {
    return { ok: false, error: 'File name is required' }
  }
  if (!content.trim()) {
    return { ok: false, error: 'Content is required' }
  }

  const projectRef = await resolveProjectRef(repoPath, preference, connectionId, localGitOptions)
  if (!projectRef) {
    return { ok: false, error: 'Could not resolve GitLab project for this repository' }
  }

  await acquire()
  try {
    const { stdout } = await glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        '-X',
        'POST',
        `projects/${encodedProject(projectRef.path)}/snippets`,
        ...fieldArgs({
          title,
          file_name: fileName,
          content,
          visibility: mapVisibility(input.visibility),
          description: input.description?.trim() || ''
        })
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
    const data = JSON.parse(stdout) as RESTSnippet
    if (typeof data.id !== 'number') {
      return { ok: false, error: 'Unexpected response from GitLab' }
    }
    return { ok: true, snippet: mapSnippetDetail(data) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: classifyGlabError(msg).message }
  } finally {
    release()
  }
}

export async function updateProjectSnippet(
  repoPath: string,
  snippetId: number,
  input: GitLabSnippetUpdateInput,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<ProjectSnippetMutationResult> {
  if (!Number.isInteger(snippetId) || snippetId <= 0) {
    return { ok: false, error: 'Invalid snippet id' }
  }

  const fields: Record<string, string> = {}
  if (typeof input.title === 'string') {
    const title = input.title.trim()
    if (!title) {
      return { ok: false, error: 'Title is required' }
    }
    fields.title = title
  }
  if (typeof input.fileName === 'string') {
    const fileName = input.fileName.trim()
    if (!fileName) {
      return { ok: false, error: 'File name is required' }
    }
    fields.file_name = fileName
  }
  if (typeof input.content === 'string') {
    fields.content = input.content
  }
  if (typeof input.description === 'string') {
    fields.description = input.description.trim()
  }
  if (input.visibility) {
    fields.visibility = mapVisibility(input.visibility)
  }
  if (Object.keys(fields).length === 0) {
    return { ok: false, error: 'No snippet updates provided' }
  }

  const projectRef = await resolveProjectRef(repoPath, preference, connectionId, localGitOptions)
  if (!projectRef) {
    return { ok: false, error: 'Could not resolve GitLab project for this repository' }
  }

  await acquire()
  try {
    const { stdout } = await glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        '-X',
        'PUT',
        `projects/${encodedProject(projectRef.path)}/snippets/${snippetId}`,
        ...fieldArgs(fields)
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
    const data = JSON.parse(stdout) as RESTSnippet
    if (typeof data.id !== 'number') {
      return { ok: false, error: 'Unexpected response from GitLab' }
    }
    return { ok: true, snippet: mapSnippetDetail(data) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: classifyGlabError(msg).message }
  } finally {
    release()
  }
}

export async function deleteProjectSnippet(
  repoPath: string,
  snippetId: number,
  preference?: IssueSourcePreference,
  connectionId?: string | null,
  localGitOptions: LocalGitExecOptions = {}
): Promise<ProjectSnippetDeleteResult> {
  if (!Number.isInteger(snippetId) || snippetId <= 0) {
    return { ok: false, error: 'Invalid snippet id' }
  }
  const projectRef = await resolveProjectRef(repoPath, preference, connectionId, localGitOptions)
  if (!projectRef) {
    return { ok: false, error: 'Could not resolve GitLab project for this repository' }
  }

  await acquire()
  try {
    await glabExecFileAsync(
      [
        'api',
        ...glabHostnameArgs(projectRef, connectionId),
        '-X',
        'DELETE',
        `projects/${encodedProject(projectRef.path)}/snippets/${snippetId}`
      ],
      glabRepoExecOptions(repoPath, connectionId, localGitOptions)
    )
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: classifyGlabError(msg).message }
  } finally {
    release()
  }
}

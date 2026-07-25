import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  acquireMock,
  releaseMock,
  getGlabKnownHostsMock,
  resolveIssueSourceMock,
  glabExecFileAsyncMock,
  glabHostnameArgsMock,
  glabRepoExecOptionsMock,
  classifyListIssuesErrorMock,
  classifyGlabErrorMock
} = vi.hoisted(() => ({
  acquireMock: vi.fn(),
  releaseMock: vi.fn(),
  getGlabKnownHostsMock: vi.fn(),
  resolveIssueSourceMock: vi.fn(),
  glabExecFileAsyncMock: vi.fn(),
  glabHostnameArgsMock: vi.fn(),
  glabRepoExecOptionsMock: vi.fn(),
  classifyListIssuesErrorMock: vi.fn(),
  classifyGlabErrorMock: vi.fn()
}))

vi.mock('./gl-utils', () => ({
  acquire: acquireMock,
  release: releaseMock,
  getGlabKnownHosts: getGlabKnownHostsMock,
  resolveIssueSource: resolveIssueSourceMock,
  glabExecFileAsync: glabExecFileAsyncMock,
  glabHostnameArgs: glabHostnameArgsMock,
  glabRepoExecOptions: glabRepoExecOptionsMock,
  classifyListIssuesError: classifyListIssuesErrorMock,
  classifyGlabError: classifyGlabErrorMock
}))

import {
  createProjectSnippet,
  deleteProjectSnippet,
  getProjectSnippet,
  listProjectSnippets,
  updateProjectSnippet
} from './snippets'

describe('project snippets', () => {
  beforeEach(() => {
    acquireMock.mockReset().mockResolvedValue(undefined)
    releaseMock.mockReset()
    getGlabKnownHostsMock.mockReset().mockResolvedValue(['gitlab.com'])
    resolveIssueSourceMock.mockReset().mockResolvedValue({
      source: { host: 'gitlab.com', path: 'group/project' }
    })
    glabExecFileAsyncMock.mockReset()
    glabHostnameArgsMock.mockReset().mockReturnValue([])
    glabRepoExecOptionsMock.mockReset().mockReturnValue({ cwd: '/repo' })
    classifyListIssuesErrorMock.mockReset().mockReturnValue({
      type: 'auth',
      message: 'auth failed'
    })
    classifyGlabErrorMock.mockReset().mockReturnValue({
      type: 'auth',
      message: 'classified failure'
    })
  })

  it('maps project snippets from glab api', async () => {
    glabExecFileAsyncMock.mockResolvedValueOnce({
      stdout: JSON.stringify([
        {
          id: 12,
          title: 'Deploy notes',
          file_name: 'deploy.md',
          description: 'How we ship',
          visibility: 'private',
          web_url: 'https://gitlab.com/group/project/-/snippets/12',
          raw_url: 'https://gitlab.com/group/project/-/snippets/12/raw',
          updated_at: '2026-07-01T10:00:00Z',
          author: { username: 'alice' }
        }
      ])
    })

    await expect(listProjectSnippets('/repo', 25)).resolves.toEqual({
      items: [
        {
          id: 12,
          title: 'Deploy notes',
          fileName: 'deploy.md',
          description: 'How we ship',
          visibility: 'private',
          webUrl: 'https://gitlab.com/group/project/-/snippets/12',
          rawUrl: 'https://gitlab.com/group/project/-/snippets/12/raw',
          updatedAt: '2026-07-01T10:00:00Z',
          authorUsername: 'alice'
        }
      ]
    })

    expect(glabExecFileAsyncMock).toHaveBeenCalledWith(
      ['api', 'projects/group%2Fproject/snippets?per_page=25'],
      { cwd: '/repo' }
    )
    expect(releaseMock).toHaveBeenCalled()
  })

  it('returns not_found when the project cannot be resolved', async () => {
    resolveIssueSourceMock.mockResolvedValueOnce({ source: null })

    await expect(listProjectSnippets('/repo')).resolves.toEqual({
      items: [],
      error: {
        type: 'not_found',
        message: 'Could not resolve a GitLab project for this repository.'
      }
    })
    expect(glabExecFileAsyncMock).not.toHaveBeenCalled()
  })

  it('classifies glab failures', async () => {
    glabExecFileAsyncMock.mockRejectedValueOnce(new Error('HTTP 401 Unauthorized'))

    await expect(listProjectSnippets('/repo')).resolves.toEqual({
      items: [],
      error: { type: 'auth', message: 'auth failed' }
    })
    expect(classifyListIssuesErrorMock).toHaveBeenCalledWith('HTTP 401 Unauthorized')
    expect(releaseMock).toHaveBeenCalled()
  })

  it('gets a snippet with content', async () => {
    glabExecFileAsyncMock.mockResolvedValueOnce({
      stdout: JSON.stringify({
        id: 12,
        title: 'Deploy notes',
        file_name: 'deploy.md',
        content: 'echo ship',
        visibility: 'private'
      })
    })

    await expect(getProjectSnippet('/repo', 12)).resolves.toEqual({
      ok: true,
      snippet: expect.objectContaining({
        id: 12,
        content: 'echo ship',
        fileName: 'deploy.md'
      })
    })
    expect(glabExecFileAsyncMock).toHaveBeenCalledWith(
      ['api', 'projects/group%2Fproject/snippets/12'],
      { cwd: '/repo' }
    )
  })

  it('fetches /raw when multi-file snippets omit content', async () => {
    glabExecFileAsyncMock
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          id: 6010171,
          title: 'hive-env',
          file_name: 'app__readyou.md',
          description: 'path: /app/readyou.md\nDo not edit',
          files: [{ path: 'app__readyou.md' }],
          visibility: 'private'
        })
      })
      .mockResolvedValueOnce({ stdout: 'kopet!!@' })

    await expect(getProjectSnippet('/repo', 6010171)).resolves.toEqual({
      ok: true,
      snippet: expect.objectContaining({
        id: 6010171,
        content: 'kopet!!@',
        fileName: 'app/readyou.md'
      })
    })
    expect(glabExecFileAsyncMock).toHaveBeenNthCalledWith(
      2,
      ['api', 'projects/group%2Fproject/snippets/6010171/raw'],
      { cwd: '/repo' }
    )
  })

  it('creates a project snippet', async () => {
    glabExecFileAsyncMock.mockResolvedValueOnce({
      stdout: JSON.stringify({
        id: 99,
        title: 'Notes',
        file_name: 'notes.md',
        content: 'hello',
        visibility: 'private'
      })
    })

    await expect(
      createProjectSnippet('/repo', {
        title: 'Notes',
        fileName: 'notes.md',
        content: 'hello',
        visibility: 'private'
      })
    ).resolves.toMatchObject({
      ok: true,
      snippet: { id: 99, title: 'Notes', content: 'hello' }
    })

    const args = glabExecFileAsyncMock.mock.calls[0][0] as string[]
    expect(args).toContain('-X')
    expect(args).toContain('POST')
    expect(args).toContain('projects/group%2Fproject/snippets')
    expect(args).toContain('title=Notes')
    expect(args).toContain('file_name=notes.md')
    expect(args).toContain('content=hello')
  })

  it('updates a project snippet', async () => {
    glabExecFileAsyncMock.mockResolvedValueOnce({
      stdout: JSON.stringify({
        id: 12,
        title: 'Updated',
        file_name: 'notes.md',
        content: 'next',
        visibility: 'internal'
      })
    })

    await expect(
      updateProjectSnippet('/repo', 12, {
        title: 'Updated',
        content: 'next',
        visibility: 'internal'
      })
    ).resolves.toMatchObject({
      ok: true,
      snippet: { id: 12, title: 'Updated', content: 'next', visibility: 'internal' }
    })

    const args = glabExecFileAsyncMock.mock.calls[0][0] as string[]
    expect(args).toContain('PUT')
    expect(args).toContain('projects/group%2Fproject/snippets/12')
    expect(args).toContain('title=Updated')
    expect(args).toContain('content=next')
  })

  it('deletes a project snippet', async () => {
    glabExecFileAsyncMock.mockResolvedValueOnce({ stdout: '' })

    await expect(deleteProjectSnippet('/repo', 12)).resolves.toEqual({ ok: true })
    expect(glabExecFileAsyncMock).toHaveBeenCalledWith(
      ['api', '-X', 'DELETE', 'projects/group%2Fproject/snippets/12'],
      { cwd: '/repo' }
    )
  })
})

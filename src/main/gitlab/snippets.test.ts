import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  acquireMock,
  releaseMock,
  getGlabKnownHostsMock,
  resolveIssueSourceMock,
  glabExecFileAsyncMock,
  glabHostnameArgsMock,
  glabRepoExecOptionsMock,
  classifyListIssuesErrorMock
} = vi.hoisted(() => ({
  acquireMock: vi.fn(),
  releaseMock: vi.fn(),
  getGlabKnownHostsMock: vi.fn(),
  resolveIssueSourceMock: vi.fn(),
  glabExecFileAsyncMock: vi.fn(),
  glabHostnameArgsMock: vi.fn(),
  glabRepoExecOptionsMock: vi.fn(),
  classifyListIssuesErrorMock: vi.fn()
}))

vi.mock('./gl-utils', () => ({
  acquire: acquireMock,
  release: releaseMock,
  getGlabKnownHosts: getGlabKnownHostsMock,
  resolveIssueSource: resolveIssueSourceMock,
  glabExecFileAsync: glabExecFileAsyncMock,
  glabHostnameArgs: glabHostnameArgsMock,
  glabRepoExecOptions: glabRepoExecOptionsMock,
  classifyListIssuesError: classifyListIssuesErrorMock
}))

import { listProjectSnippets } from './snippets'

describe('listProjectSnippets', () => {
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
})

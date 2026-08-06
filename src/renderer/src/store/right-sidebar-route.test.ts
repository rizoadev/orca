import { describe, expect, it } from 'vitest'
import { normalizeRightSidebarRoute } from './right-sidebar-route'

describe('normalizeRightSidebarRoute', () => {
  it('preserves the folder-only PR Checks route', () => {
    expect(normalizeRightSidebarRoute('pr-checks')).toEqual({
      rightSidebarTab: 'pr-checks',
      rightSidebarExplorerView: 'files'
    })
  })

  it('preserves the git Issues route', () => {
    expect(normalizeRightSidebarRoute('issues')).toEqual({
      rightSidebarTab: 'issues',
      rightSidebarExplorerView: 'files'
    })
  })

  it('preserves the orchestration route', () => {
    expect(normalizeRightSidebarRoute('orchestration')).toEqual({
      rightSidebarTab: 'orchestration',
      rightSidebarExplorerView: 'files'
    })
  })

  it('preserves the remote chat route', () => {
    expect(normalizeRightSidebarRoute('remote-chat')).toEqual({
      rightSidebarTab: 'remote-chat',
      rightSidebarExplorerView: 'files'
    })
  })

  it('preserves the GitLab snippets route', () => {
    expect(normalizeRightSidebarRoute('snippets')).toEqual({
      rightSidebarTab: 'snippets',
      rightSidebarExplorerView: 'files'
    })
  })

  it('preserves the pomodoro route', () => {
    expect(normalizeRightSidebarRoute('pomodoro')).toEqual({
      rightSidebarTab: 'pomodoro',
      rightSidebarExplorerView: 'files'
    })
  })

  it('still normalizes invalid tabs to Explorer files', () => {
    expect(normalizeRightSidebarRoute('missing')).toEqual({
      rightSidebarTab: 'explorer',
      rightSidebarExplorerView: 'files'
    })
  })
})

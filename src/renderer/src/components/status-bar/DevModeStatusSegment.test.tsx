// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { AppIdentity } from '../../../../shared/app-identity'

vi.mock('@/i18n/i18n', () => ({
  i18n: { language: 'en' },
  translate: (_key: string, fallback: string, values?: Record<string, string>) => {
    let result = fallback
    for (const [key, value] of Object.entries(values ?? {})) {
      result = result.replace(`{{${key}}}`, value)
    }
    return result
  }
}))

const mocks = vi.hoisted(() => ({ isRendererDevBuild: true }))

vi.mock('@/lib/renderer-build-mode', () => ({
  get isRendererDevBuild() {
    return mocks.isRendererDevBuild
  }
}))

import { DevModeStatusSegment } from './DevModeStatusSegment'

function identity(overrides: Partial<AppIdentity> = {}): AppIdentity {
  return {
    name: 'Orca: main',
    isDev: true,
    devLabel: 'orca @ main',
    devBranch: 'main',
    devWorktreeName: 'orca',
    devRepoRoot: '/repo/orca',
    dockBadgeLabel: null,
    ...overrides
  }
}

function setIdentityBridge(getIdentity: (() => Promise<AppIdentity>) | undefined): void {
  Object.defineProperty(window, 'api', {
    value: { app: { getIdentity } },
    configurable: true,
    writable: true
  })
}

// Why: the app mounts TooltipProvider at the root; the segment's tooltip needs it.
function renderSegment(props?: { iconOnly?: boolean }): void {
  render(
    <TooltipProvider>
      <DevModeStatusSegment {...props} />
    </TooltipProvider>
  )
}

describe('DevModeStatusSegment', () => {
  beforeEach(() => {
    mocks.isRendererDevBuild = true
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the dev badge in a source build', () => {
    setIdentityBridge(() => Promise.resolve(identity()))

    renderSegment()

    expect(screen.getByTestId('dev-mode-status-segment')).toHaveTextContent('Dev')
  })

  it('renders nothing in a packaged build so prod users never see it', () => {
    mocks.isRendererDevBuild = false
    setIdentityBridge(() => Promise.resolve(identity()))

    renderSegment()

    expect(screen.queryByTestId('dev-mode-status-segment')).toBeNull()
  })

  it('shows the dev instance inline once main answers', async () => {
    setIdentityBridge(() => Promise.resolve(identity()))

    renderSegment()

    await waitFor(() => {
      expect(screen.getByTestId('dev-mode-status-segment')).toHaveTextContent('orca @ main')
    })
  })

  it('drops the instance label on a narrow status bar, keeping only the badge', async () => {
    setIdentityBridge(() => Promise.resolve(identity()))

    renderSegment({ iconOnly: true })

    const badge = await waitFor(() => {
      const node = screen.getByTestId('dev-mode-status-segment')
      expect(node).toHaveTextContent('Dev')
      return node
    })

    expect(badge).not.toHaveTextContent('orca @ main')
  })

  it('keeps the badge when the preload identity bridge is missing', () => {
    // Why: dev:web has no Electron preload, so window.api.app can be absent
    // entirely — the footer must not go down with the enrichment.
    setIdentityBridge(undefined)

    renderSegment()

    expect(screen.getByTestId('dev-mode-status-segment')).toHaveTextContent('Dev')
  })

  it('keeps the badge when the identity lookup rejects', async () => {
    // Why: a hot-reloaded dev renderer can call main mid-teardown; the badge is
    // the signal the user needs most at exactly that moment.
    setIdentityBridge(() => Promise.reject(new Error('ipc down')))

    renderSegment()

    await waitFor(() => {
      expect(screen.getByTestId('dev-mode-status-segment')).toHaveTextContent('Dev')
    })
  })
})

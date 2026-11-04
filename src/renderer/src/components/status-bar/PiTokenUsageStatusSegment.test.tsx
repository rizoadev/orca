// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../store'
import { TooltipProvider } from '../ui/tooltip'
import { formatUsageLocalDay } from '../../../../shared/usage-local-day'
import { PiTokenUsageStatusSegment } from './PiTokenUsageStatusSegment'

const piUsage = {
  getScanState: vi.fn(),
  setEnabled: vi.fn(),
  refresh: vi.fn(),
  getSnapshot: vi.fn(),
  getSummary: vi.fn(),
  getDaily: vi.fn(),
  getBreakdown: vi.fn(),
  getRecentSessions: vi.fn()
}

const today = formatUsageLocalDay(new Date())

function stage(overrides: { enabled: boolean; tokensByDay: Record<string, number> }): void {
  useAppStore.setState({
    piUsageScanState: {
      enabled: overrides.enabled,
      isScanning: false,
      lastScanStartedAt: null,
      lastScanCompletedAt: null,
      lastScanError: null,
      hasAnyPiData: true
    },
    piUsageDaily: Object.entries(overrides.tokensByDay).map(([day, totalTokens]) => ({
      day,
      totalTokens,
      inputTokens: totalTokens,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0
    })),
    piUsageSummary: {
      scope: 'all',
      range: '30d',
      sessions: 4,
      events: 90,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 2_400_000,
      topModel: 'ag/gemini-3.8-flash',
      topProject: 'repo/main',
      hasAnyPiData: true
    }
  })
}

beforeEach(() => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { piUsage }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PiTokenUsageStatusSegment', () => {
  it('shows today’s Pi tokens once tracking is enabled', () => {
    stage({ enabled: true, tokensByDay: { [today]: 1_500_000 } })

    render(
      <TooltipProvider>
        <PiTokenUsageStatusSegment />
      </TooltipProvider>
    )

    expect(screen.getByTestId('pi-token-usage').textContent).toContain('1.5M')
  })

  it('stays hidden until tracking is enabled', () => {
    stage({ enabled: false, tokensByDay: { [today]: 1_500_000 } })

    render(
      <TooltipProvider>
        <PiTokenUsageStatusSegment />
      </TooltipProvider>
    )

    expect(screen.queryByTestId('pi-token-usage')).toBeNull()
  })

  it('stays hidden when nothing was used today', () => {
    // History alone must not leave a zero chip in the footer.
    stage({ enabled: true, tokensByDay: { '2026-01-02': 900_000 } })

    render(
      <TooltipProvider>
        <PiTokenUsageStatusSegment />
      </TooltipProvider>
    )

    expect(screen.queryByTestId('pi-token-usage')).toBeNull()
  })
})

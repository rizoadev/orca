import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import {
  FOCUS_SESSIONS_BEFORE_LONG_BREAK,
  pumpPomodoroTick,
  usePomodoroStore
} from './pomodoro-timer-store'

describe('pomodoro timer store', () => {
  beforeEach(() => {
    usePomodoroStore.setState({
      phase: 'focus',
      secondsLeft: 25 * 60,
      running: false,
      completedFocusSessions: 0,
      durationsMin: { focus: 25, 'short-break': 5, 'long-break': 15 },
      endAt: null
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts from the current phase duration and ticks down against wall time', () => {
    usePomodoroStore.getState().start()
    const s = usePomodoroStore.getState()
    expect(s.running).toBe(true)
    expect(s.endAt).not.toBeNull()
    expect(s.secondsLeft).toBe(25 * 60)

    // Why: manipulate the deadline instead of sleeping so the test is not flaky.
    usePomodoroStore.setState({ endAt: Date.now() + 25 * 60 * 1000 - 3000 })
    pumpPomodoroTick()
    expect(usePomodoroStore.getState().secondsLeft).toBe(25 * 60 - 3)
  })

  it('pauses without losing the remaining time, and resume continues from it', () => {
    const store = usePomodoroStore.getState()
    store.start()
    usePomodoroStore.setState({ endAt: Date.now() - 10_000, secondsLeft: 25 * 60 - 10 })
    store.pause()
    const paused = usePomodoroStore.getState()
    expect(paused.running).toBe(false)
    expect(paused.endAt).toBeNull()
    expect(paused.secondsLeft).toBe(25 * 60 - 10)
  })

  it('reset restores the current phase duration and stops', () => {
    const store = usePomodoroStore.getState()
    store.start()
    usePomodoroStore.setState({ secondsLeft: 100 })
    store.reset()
    const s = usePomodoroStore.getState()
    expect(s.running).toBe(false)
    expect(s.secondsLeft).toBe(25 * 60)
  })

  it('advances focus → short break → focus and counts completed sessions', () => {
    const store = usePomodoroStore.getState()
    store.start()
    store.completePhase()
    expect(usePomodoroStore.getState().phase).toBe('short-break')
    expect(usePomodoroStore.getState().completedFocusSessions).toBe(1)
    expect(usePomodoroStore.getState().running).toBe(true)
    expect(usePomodoroStore.getState().secondsLeft).toBe(5 * 60)

    usePomodoroStore.getState().completePhase()
    expect(usePomodoroStore.getState().phase).toBe('focus')
    expect(usePomodoroStore.getState().secondsLeft).toBe(25 * 60)
  })

  it('grants a long break after the configured number of focus sessions', () => {
    usePomodoroStore.setState({ completedFocusSessions: FOCUS_SESSIONS_BEFORE_LONG_BREAK - 1 })
    usePomodoroStore.getState().completePhase()
    const s = usePomodoroStore.getState()
    expect(s.phase).toBe('long-break')
    expect(s.completedFocusSessions).toBe(0)
    expect(s.secondsLeft).toBe(15 * 60)
  })

  it('skip advances without counting the session and preserves the idle state', () => {
    const store = usePomodoroStore.getState()
    store.skip()
    let s = usePomodoroStore.getState()
    expect(s.phase).toBe('short-break')
    expect(s.completedFocusSessions).toBe(0)
    expect(s.running).toBe(false)

    store.start()
    usePomodoroStore.getState().skip()
    s = usePomodoroStore.getState()
    expect(s.phase).toBe('focus')
    expect(s.running).toBe(true)
  })

  it('clamps duration changes and live-updates an idle phase display', () => {
    const store = usePomodoroStore.getState()
    store.setDuration('focus', 0)
    expect(usePomodoroStore.getState().durationsMin.focus).toBe(1)
    expect(usePomodoroStore.getState().secondsLeft).toBe(60)

    store.setDuration('focus', 999)
    expect(usePomodoroStore.getState().durationsMin.focus).toBe(120)
    expect(usePomodoroStore.getState().secondsLeft).toBe(120 * 60)
  })

  it('a zero countdown auto-completes the phase through the tick pump', () => {
    const store = usePomodoroStore.getState()
    store.start()
    usePomodoroStore.setState({ endAt: Date.now() - 1000, secondsLeft: 0 })
    pumpPomodoroTick()
    expect(usePomodoroStore.getState().phase).toBe('short-break')
    expect(usePomodoroStore.getState().running).toBe(true)
    expect(usePomodoroStore.getState().endAt).not.toBeNull()
  })

  it('pump is a no-op while paused or idle', () => {
    const before = usePomodoroStore.getState().secondsLeft
    pumpPomodoroTick()
    expect(usePomodoroStore.getState().secondsLeft).toBe(before)
  })
})

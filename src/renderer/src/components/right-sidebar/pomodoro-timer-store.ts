import { create } from 'zustand'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'

export type PomodoroPhase = 'focus' | 'short-break' | 'long-break'

export const FOCUS_SESSIONS_BEFORE_LONG_BREAK = 4
export const MIN_DURATION_MINUTES = 1
export const MAX_DURATION_MINUTES = 120

const DEFAULT_DURATIONS_MIN = { focus: 25, 'short-break': 5, 'long-break': 15 } as const

function clampMinutes(value: number): number {
  return Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, Math.round(value)))
}

export type PomodoroDurationsMin = Record<PomodoroPhase, number>

type PomodoroStore = {
  phase: PomodoroPhase
  secondsLeft: number
  running: boolean
  completedFocusSessions: number
  durationsMin: PomodoroDurationsMin
  /** Wall-clock deadline while running; null when paused/idle. */
  endAt: number | null
  start: () => void
  pause: () => void
  reset: () => void
  skip: () => void
  setDuration: (phase: PomodoroPhase, minutes: number) => void
  /** Internal: advance to the next phase after a countdown hits zero. */
  completePhase: () => void
}

function advance(
  set: (partial: Partial<PomodoroStore>) => void,
  get: () => PomodoroStore,
  fromPhase: PomodoroPhase,
  counted: boolean
): void {
  const s = get()
  let nextPhase: PomodoroPhase
  let sessions: number
  if (fromPhase === 'focus') {
    const nextFocusSessions = counted ? s.completedFocusSessions + 1 : s.completedFocusSessions
    if (nextFocusSessions >= FOCUS_SESSIONS_BEFORE_LONG_BREAK) {
      nextPhase = 'long-break'
      sessions = 0
    } else {
      nextPhase = 'short-break'
      sessions = nextFocusSessions
    }
  } else {
    nextPhase = 'focus'
    sessions = s.completedFocusSessions
  }
  const durationSec = s.durationsMin[nextPhase] * 60
  set({
    phase: nextPhase,
    secondsLeft: durationSec,
    completedFocusSessions: sessions,
    running: true,
    endAt: Date.now() + durationSec * 1000
  })
}

export const usePomodoroStore = create<PomodoroStore>()((set, get) => ({
  phase: 'focus',
  secondsLeft: DEFAULT_DURATIONS_MIN.focus * 60,
  running: false,
  completedFocusSessions: 0,
  durationsMin: { ...DEFAULT_DURATIONS_MIN },
  endAt: null,
  start: () => {
    const s = get()
    if (s.running) {
      return
    }
    const secondsLeft = s.secondsLeft > 0 ? s.secondsLeft : s.durationsMin[s.phase] * 60
    set({ running: true, secondsLeft, endAt: Date.now() + secondsLeft * 1000 })
  },
  pause: () => set({ running: false, endAt: null }),
  reset: () => {
    const s = get()
    set({ running: false, endAt: null, secondsLeft: s.durationsMin[s.phase] * 60 })
  },
  skip: () => {
    const s = get()
    const wasRunning = s.running
    advance(set, get, s.phase, false)
    // Why: skipping is a manual detour — preserve the previous run state instead
    // of force-starting the next phase from an idle timer.
    if (!wasRunning) {
      set({ running: false, endAt: null })
    }
  },
  setDuration: (phase, minutes) => {
    const clamped = clampMinutes(minutes)
    const s = get()
    set({
      durationsMin: { ...s.durationsMin, [phase]: clamped },
      // Why: live-preview the new duration when editing the idle phase so the
      // display never disagrees with the stepper.
      ...(s.running || s.phase !== phase ? {} : { secondsLeft: clamped * 60 })
    })
  },
  completePhase: () => {
    const s = get()
    advance(set, get, s.phase, true)
    notifyPhaseComplete(s.phase)
  }
}))

// Why: the ticking loop lives at module scope instead of inside the panel so the
// countdown stays realtime even when the panel is unmounted (tab switched away).
const TICK_MS = 250
export function pumpPomodoroTick(): void {
  const s = usePomodoroStore.getState()
  if (!s.running || s.endAt === null) {
    return
  }
  const remaining = Math.max(0, Math.round((s.endAt - Date.now()) / 1000))
  if (remaining !== s.secondsLeft) {
    usePomodoroStore.setState({ secondsLeft: remaining })
  }
  if (remaining === 0) {
    s.completePhase()
  }
}
setInterval(pumpPomodoroTick, TICK_MS)

function notifyPhaseComplete(completedPhase: PomodoroPhase): void {
  try {
    playPhaseChime()
  } catch {
    // Why: the chime is best-effort; a blocked AudioContext must not break the timer.
  }
  const isFocusDone = completedPhase === 'focus'
  toast(
    isFocusDone
      ? translate(
          'auto.components.right.sidebar.pomodoroTimerStore.focusComplete',
          'Focus session complete — time for a break'
        )
      : translate(
          'auto.components.right.sidebar.pomodoroTimerStore.breakComplete',
          'Break over — back to focus'
        )
  )
}

function playPhaseChime(): void {
  const AudioCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtor) {
    return
  }
  const ctx = new AudioCtor()
  // Two descending tones signal a phase boundary without an asset file.
  ;[880, 660].forEach((freq, index) => {
    const start = ctx.currentTime + index * 0.18
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 0.18)
  })
}

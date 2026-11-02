import React, { useCallback } from 'react'
import { Timer, Play, Pause, RotateCcw, SkipForward } from 'lucide-react'
import { usePomodoroStore } from './renderer/src/components/right-sidebar/pomodoro-timer-store'
import type { PomodoroPhase } from './renderer/src/components/right-sidebar/pomodoro-timer-store'

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const PHASE_LABELS: Record<PomodoroPhase, string> = {
  focus: '🍅 Focus',
  'short-break': '☕ Break',
  'long-break': '🌙 Long Break'
}

const PHASE_COLORS: Record<PomodoroPhase, string> = {
  focus: 'bg-red-500/10 text-red-600 dark:text-red-400',
  'short-break': 'bg-green-500/10 text-green-600 dark:text-green-400',
  'long-break': 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
}

export default function PomodoroPanel(): React.JSX.Element {
  const phase = usePomodoroStore((s) => s.phase)
  const secondsLeft = usePomodoroStore((s) => s.secondsLeft)
  const running = usePomodoroStore((s) => s.running)
  const completedFocusSessions = usePomodoroStore((s) => s.completedFocusSessions)
  const durationsMin = usePomodoroStore((s) => s.durationsMin)
  const start = usePomodoroStore((s) => s.start)
  const pause = usePomodoroStore((s) => s.pause)
  const reset = usePomodoroStore((s) => s.reset)
  const skip = usePomodoroStore((s) => s.skip)
  const setDuration = usePomodoroStore((s) => s.setDuration)

  const toggle = useCallback(() => {
    if (running) {
      pause()
    } else {
      start()
    }
  }, [running, start, pause])

  const totalSec = durationsMin[phase] * 60
  const progress = totalSec > 0 ? (totalSec - secondsLeft) / totalSec : 0
  const circumference = 2 * Math.PI * 54
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Timer size={16} className="text-muted-foreground" />
        <span className="text-sm font-medium">Pomodoro</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {completedFocusSessions} session{completedFocusSessions !== 1 ? 's' : ''} done
        </span>
      </div>

      {/* Phase tabs */}
      <div className="flex gap-1 border-b border-border px-3 py-2">
        {(Object.keys(PHASE_LABELS) as PomodoroPhase[]).map((p) => (
          <button
            key={p}
            className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
              phase === p ? PHASE_COLORS[p] : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => {
              if (phase !== p) {
                skip()
              }
            }}
          >
            {PHASE_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Timer ring */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
        <div className="relative flex items-center justify-center">
          <svg width="128" height="128" className="-rotate-90">
            <circle
              cx="64"
              cy="64"
              r="54"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-border"
            />
            <circle
              cx="64"
              cy="64"
              r="54"
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className={
                phase === 'focus'
                  ? 'stroke-red-500'
                  : phase === 'short-break'
                    ? 'stroke-green-500'
                    : 'stroke-blue-500'
              }
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="font-mono text-3xl font-bold tabular-nums">
              {formatCountdown(secondsLeft)}
            </span>
            <span className="text-[10px] text-muted-foreground">{PHASE_LABELS[phase]}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="rounded-md border border-border p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Reset"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
            {running ? 'Pause' : 'Start'}
          </button>
          <button
            onClick={skip}
            className="rounded-md border border-border p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Skip"
          >
            <SkipForward size={14} />
          </button>
        </div>
      </div>

      {/* Duration settings */}
      <div className="border-t border-border px-3 py-2">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Durations (min)
        </p>
        <div className="flex gap-3">
          {(Object.entries(durationsMin) as [PomodoroPhase, number][]).map(([p, mins]) => (
            <label key={p} className="flex flex-col items-center gap-0.5">
              <span className="text-[9px] text-muted-foreground">
                {p === 'focus' ? 'Focus' : p === 'short-break' ? 'Short' : 'Long'}
              </span>
              <input
                type="number"
                min={1}
                max={120}
                value={mins}
                onChange={(e) => setDuration(p, Number.parseInt(e.target.value, 10))}
                className="w-10 rounded border border-border bg-background px-1 py-0.5 text-center text-xs tabular-nums"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

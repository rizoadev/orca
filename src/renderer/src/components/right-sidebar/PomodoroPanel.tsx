import React from 'react'
import { Minus, Pause, Play, Plus, RotateCcw, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  FOCUS_SESSIONS_BEFORE_LONG_BREAK,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  usePomodoroStore,
  type PomodoroPhase
} from './pomodoro-timer-store'

const RING_RADIUS = 56
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const PHASE_ORDER: PomodoroPhase[] = ['focus', 'short-break', 'long-break']

const PHASE_LABEL: Record<PomodoroPhase, { key: string; fallback: string }> = {
  focus: {
    key: 'auto.components.right.sidebar.PomodoroPanel.phase.focus',
    fallback: 'Focus'
  },
  'short-break': {
    key: 'auto.components.right.sidebar.PomodoroPanel.phase.shortBreak',
    fallback: 'Short Break'
  },
  'long-break': {
    key: 'auto.components.right.sidebar.PomodoroPanel.phase.longBreak',
    fallback: 'Long Break'
  }
}

function phaseLabel(phase: PomodoroPhase): string {
  return translate(PHASE_LABEL[phase].key, PHASE_LABEL[phase].fallback)
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function PomodoroPanel(): React.JSX.Element {
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

  const totalSeconds = durationsMin[phase] * 60
  const progress = totalSeconds > 0 ? secondsLeft / totalSeconds : 0
  const isBreak = phase !== 'focus'
  const ringDashOffset = RING_CIRCUMFERENCE * (1 - progress)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto scrollbar-sleek px-4 py-5">
      <div className="flex flex-col items-center gap-3 pt-2">
        <span
          className={cn(
            'text-[11px] font-semibold uppercase tracking-wider',
            isBreak ? 'text-muted-foreground' : 'text-foreground'
          )}
        >
          {phaseLabel(phase)}
        </span>

        {/* Progress ring with the countdown in the middle */}
        <div className="relative flex size-[148px] items-center justify-center py-1">
          <svg
            className="-rotate-90"
            width="140"
            height="140"
            viewBox="0 0 140 140"
            role="img"
            aria-label={translate(
              'auto.components.right.sidebar.PomodoroPanel.timeRemaining',
              'Time remaining: {{value}}',
              { value: formatTime(secondsLeft) }
            )}
          >
            <circle
              cx="70"
              cy="70"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="4"
              className="stroke-border"
            />
            <circle
              cx="70"
              cy="70"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={ringDashOffset}
              className={cn(
                'transition-[stroke-dashoffset] duration-300 ease-linear',
                isBreak ? 'stroke-foreground/40' : 'stroke-primary'
              )}
            />
          </svg>
          <span className="absolute font-mono text-3xl font-medium tabular-nums text-foreground">
            {formatTime(secondsLeft)}
          </span>
        </div>

        {/* Completed focus sessions this cycle */}
        <div className="flex items-center gap-1.5" aria-hidden>
          {Array.from({ length: FOCUS_SESSIONS_BEFORE_LONG_BREAK }, (_, index) => (
            <span
              key={index}
              className={cn(
                'size-2 rounded-full transition-colors',
                index < completedFocusSessions ? 'bg-primary' : 'bg-border'
              )}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="mt-1 flex items-center gap-2">
          <Button
            size="sm"
            className="w-24"
            onClick={running ? pause : start}
            aria-label={
              running
                ? translate('auto.components.right.sidebar.PomodoroPanel.pause', 'Pause')
                : translate('auto.components.right.sidebar.PomodoroPanel.start', 'Start')
            }
          >
            {running ? <Pause /> : <Play />}
            {running
              ? translate('auto.components.right.sidebar.PomodoroPanel.pause', 'Pause')
              : translate('auto.components.right.sidebar.PomodoroPanel.start', 'Start')}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={reset}
                aria-label={translate('auto.components.right.sidebar.PomodoroPanel.reset', 'Reset')}
              >
                <RotateCcw />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              {translate('auto.components.right.sidebar.PomodoroPanel.reset', 'Reset')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={skip}
                aria-label={translate(
                  'auto.components.right.sidebar.PomodoroPanel.skip',
                  'Skip phase'
                )}
              >
                <SkipForward />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              {translate('auto.components.right.sidebar.PomodoroPanel.skip', 'Skip phase')}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Duration settings */}
      <div className="mt-6 border-t border-border pt-4">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {translate('auto.components.right.sidebar.PomodoroPanel.durations', 'Durations')}
        </div>
        <div className="flex flex-col gap-2">
          {PHASE_ORDER.map((entryPhase) => {
            const minutes = durationsMin[entryPhase]
            return (
              <div key={entryPhase} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-foreground">{phaseLabel(entryPhase)}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={minutes <= MIN_DURATION_MINUTES}
                    onClick={() => setDuration(entryPhase, minutes - 1)}
                    aria-label={translate(
                      'auto.components.right.sidebar.PomodoroPanel.decrease',
                      'Decrease {{label}} by one minute',
                      { label: phaseLabel(entryPhase) }
                    )}
                  >
                    <Minus />
                  </Button>
                  <span className="w-12 text-center font-mono text-xs tabular-nums text-foreground">
                    {minutes}
                    <span className="ml-0.5 text-muted-foreground">
                      {translate('auto.components.right.sidebar.PomodoroPanel.minutesUnit', 'min')}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={minutes >= MAX_DURATION_MINUTES}
                    onClick={() => setDuration(entryPhase, minutes + 1)}
                    aria-label={translate(
                      'auto.components.right.sidebar.PomodoroPanel.increase',
                      'Increase {{label}} by one minute',
                      { label: phaseLabel(entryPhase) }
                    )}
                  >
                    <Plus />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default PomodoroPanel

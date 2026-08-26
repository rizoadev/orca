import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { OfficeAgent } from './use-office-data'

const STATUS_LABEL: Record<OfficeAgent['status'], string> = {
  working: 'Working',
  idle: 'Idle',
  blocked: 'Blocked',
  done: 'Done'
}

const WORKING_THOUGHTS = [
  'Processing…',
  'Running tests…',
  'Writing code…',
  'Analyzing…',
  'Reviewing…',
  'Refactoring…',
  'Debugging…',
  'Planning next step…'
]

export function OfficeAgentSprite({
  agent,
  style,
  onClick
}: {
  agent: OfficeAgent
  style?: React.CSSProperties
  onClick?: (agent: OfficeAgent) => void
}): React.JSX.Element {
  const [bounce, setBounce] = useState(false)
  const [thoughtIdx, setThoughtIdx] = useState(0)
  const bounceRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const thoughtRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Random bounce animation while working
  useEffect(() => {
    if (agent.status !== 'working') {
      return
    }
    bounceRef.current = setInterval(
      () => {
        setBounce(true)
        setTimeout(() => {
          setBounce(false)
        }, 400)
      },
      3000 + Math.random() * 3000
    )
    return () => {
      if (bounceRef.current) {
        clearInterval(bounceRef.current)
      }
    }
  }, [agent.status])

  // Rotate thoughts
  useEffect(() => {
    thoughtRef.current = setInterval(() => {
      setThoughtIdx((p) => (p + 1) % WORKING_THOUGHTS.length)
    }, 6000)
    return () => {
      if (thoughtRef.current) {
        clearInterval(thoughtRef.current)
      }
    }
  }, [])

  const isWorking = agent.status === 'working'
  const isBlocked = agent.status === 'blocked'
  const isDone = agent.status === 'done'

  return (
    <div
      className="group relative flex cursor-pointer flex-col items-center"
      style={style}
      onClick={() => {
        onClick?.(agent)
      }}
    >
      {/* Thought bubble on hover */}
      <div className="pointer-events-none absolute -top-14 left-1/2 z-50 w-44 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <div
          className="rounded-lg border px-2 py-1.5 text-[10px] leading-snug"
          style={{
            background: 'var(--background)',
            borderColor: agent.color,
            boxShadow: `0 0 12px ${agent.color}44`
          }}
        >
          <p className="truncate text-muted-foreground italic">
            {isWorking ? WORKING_THOUGHTS[thoughtIdx] : agent.taskTitle}
          </p>
        </div>
        {/* Bubble tail */}
        <div className="mt-0.5 flex justify-center gap-0.5">
          <div className="h-1.5 w-1.5 rounded-full" style={{ background: `${agent.color}66` }} />
          <div className="mt-0.5 h-1 w-1 rounded-full" style={{ background: `${agent.color}44` }} />
        </div>
      </div>

      {/* Avatar */}
      <div
        className={cn(
          'relative flex h-12 w-12 items-center justify-center rounded-lg text-2xl transition-transform duration-300',
          bounce && 'translate-y-[-4px]'
        )}
        style={{
          background: `linear-gradient(135deg, ${agent.color}22, ${agent.color}0a)`,
          border: `2px solid ${agent.color}`,
          boxShadow: isWorking
            ? `0 0 14px ${agent.color}66, 0 0 28px ${agent.color}22`
            : `0 0 6px ${agent.color}33`
        }}
      >
        {/* Scanlines */}
        <div
          className="pointer-events-none absolute inset-0 rounded-lg opacity-10"
          style={{
            background:
              'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.4) 2px,rgba(0,0,0,0.4) 4px)'
          }}
        />
        <span className="relative z-10">{agent.emoji}</span>

        {/* Working pulse ring */}
        {isWorking && (
          <div
            className="absolute inset-0 animate-ping rounded-lg opacity-20"
            style={{ border: `2px solid ${agent.color}` }}
          />
        )}

        {/* Status dot */}
        <div
          className={cn(
            'absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-background',
            isWorking && 'animate-pulse'
          )}
          style={{
            background: isWorking
              ? '#39ff14'
              : isBlocked
                ? '#ef4444'
                : isDone
                  ? '#00d9a5'
                  : '#6b7280'
          }}
        />
      </div>

      {/* Desk bar */}
      <div
        className="-mt-1 h-2.5 w-14 rounded-sm"
        style={{
          background: `linear-gradient(180deg, ${agent.color}22, ${agent.color}0a)`,
          border: `1px solid ${agent.color}33`
        }}
      />

      {/* Name tag */}
      <div className="mt-1 flex flex-col items-center gap-0">
        <span
          className="max-w-[72px] truncate rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            background: `${agent.color}18`,
            border: `1px solid ${agent.color}`,
            color: agent.color
          }}
        >
          {agent.name.length > 10 ? `${agent.name.slice(0, 10)}…` : agent.name}
        </span>
        <span className="mt-0.5 text-[9px] text-muted-foreground">
          {STATUS_LABEL[agent.status]}
        </span>
      </div>
    </div>
  )
}

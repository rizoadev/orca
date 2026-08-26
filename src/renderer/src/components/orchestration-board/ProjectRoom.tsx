import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import type { OfficeRoom, OfficeAgent } from './use-office-data'
import { OfficeAgentSprite } from './OfficeAgentSprite'

const GRID_POSITIONS = [
  { x: 20, y: 35 },
  { x: 50, y: 35 },
  { x: 80, y: 35 },
  { x: 20, y: 65 },
  { x: 50, y: 65 },
  { x: 80, y: 65 },
  { x: 35, y: 50 },
  { x: 65, y: 50 }
]

export function ProjectRoom({
  room,
  onSelectAgent
}: {
  room: OfficeRoom
  onSelectAgent?: (agent: OfficeAgent) => void
}): React.JSX.Element {
  const [hovered, setHovered] = useState(false)
  const isActive = room.activeCount > 0
  const isBlocked = room.blockedCount > 0 && room.activeCount === 0

  const statusColor = isActive ? '#39ff14' : isBlocked ? '#ef4444' : 'var(--muted-foreground)'

  const glowColor = isActive ? '#39ff1422' : isBlocked ? '#ef444422' : 'transparent'

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-xl border transition-all duration-300',
        hovered ? 'border-border' : 'border-border/50'
      )}
      style={{
        background: `linear-gradient(160deg, var(--card) 80%, ${glowColor})`,
        boxShadow: isActive ? `0 0 0 1px #39ff1422, 0 4px 24px #39ff1411` : undefined
      }}
      onMouseEnter={() => {
        setHovered(true)
      }}
      onMouseLeave={() => {
        setHovered(false)
      }}
    >
      {/* Room header */}
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        {/* Active indicator */}
        <div
          className={cn('h-2 w-2 shrink-0 rounded-full', isActive && 'animate-pulse')}
          style={{ background: statusColor }}
        />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
          {room.label}
        </span>
        {/* Counters */}
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground">
          {room.activeCount > 0 && (
            <span
              className="rounded px-1 py-0.5"
              style={{ background: '#39ff1418', color: '#39ff14' }}
            >
              {room.activeCount} active
            </span>
          )}
          {room.blockedCount > 0 && (
            <span
              className="rounded px-1 py-0.5 text-destructive"
              style={{ background: '#ef444418' }}
            >
              {room.blockedCount} blocked
            </span>
          )}
          <span>{room.totalCount} tasks</span>
        </div>
      </div>

      {/* Office floor — agent sprites positioned on a grid */}
      <div className="relative min-h-[140px] flex-1">
        {/* Floor grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)',
            backgroundSize: '24px 24px'
          }}
        />

        {room.agents.length === 0 ? (
          <div className="flex h-full min-h-[140px] items-center justify-center">
            <span className="text-[11px] text-muted-foreground/40">No active agents</span>
          </div>
        ) : (
          room.agents.slice(0, 8).map((agent, i) => {
            const pos = GRID_POSITIONS[i % GRID_POSITIONS.length]
            return (
              <OfficeAgentSprite
                key={agent.id}
                agent={agent}
                style={{
                  position: 'absolute',
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)'
                }}
                onClick={onSelectAgent}
              />
            )
          })
        )}

        {/* Overflow badge */}
        {room.agents.length > 8 && (
          <div className="absolute bottom-2 right-2 rounded-full border border-border/60 bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            +{room.agents.length - 8} more
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full bg-muted/40">
        {room.totalCount > 0 && (
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.round((room.doneCount / room.totalCount) * 100)}%`,
              background: 'var(--status-success, #39ff14)',
              opacity: 0.7
            }}
          />
        )}
      </div>
    </div>
  )
}

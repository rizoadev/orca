import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import type { OfficeRoom, OfficeAgent } from './use-office-data'
import { ProjectRoom } from './ProjectRoom'

export function OfficeFloor({
  rooms,
  onSelectAgent,
  onSelectRoom
}: {
  rooms: OfficeRoom[]
  onSelectAgent?: (agent: OfficeAgent) => void
  onSelectRoom?: (room: OfficeRoom) => void
}): React.JSX.Element {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)

  function handleRoomClick(room: OfficeRoom): void {
    setSelectedRoomId(room.id === selectedRoomId ? null : room.id)
    onSelectRoom?.(room)
  }

  if (rooms.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground/50">
        No projects yet — create a task to open a room.
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: 'thin' }}>
      {/* Building sign */}
      <div className="mb-4 flex items-center gap-2">
        <div className="h-px flex-1 bg-border/40" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          🏢 Orca HQ — {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}
        </span>
        <div className="h-px flex-1 bg-border/40" />
      </div>

      {/* Responsive grid — 1 col on narrow, 2 col on medium, 3 on wide */}
      <div
        className={cn(
          'grid gap-4',
          rooms.length === 1
            ? 'grid-cols-1'
            : rooms.length === 2
              ? 'grid-cols-2'
              : 'grid-cols-[repeat(auto-fill,minmax(280px,1fr))]'
        )}
      >
        {rooms.map((room) => (
          <div
            key={room.id}
            className={cn(
              'cursor-pointer rounded-xl outline-none ring-0 transition-all duration-150',
              selectedRoomId === room.id && 'ring-2 ring-primary/60'
            )}
            onClick={() => {
              handleRoomClick(room)
            }}
          >
            <ProjectRoom room={room} onSelectAgent={onSelectAgent} />
          </div>
        ))}
      </div>
    </div>
  )
}

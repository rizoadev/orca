import React, { useMemo, useState } from 'react'
import { useOfficeData, type OfficeAgent } from './use-office-data'
import { OfficeFloor } from './OfficeFloor'
import { OfficeStatsBar } from './OfficeStatsBar'
import { OfficeActivityFeed } from './OfficeActivityFeed'
import type { OrchestrationBoardTask } from './orchestration-board-model'

export function OrcaOfficePage({ tasks }: { tasks: OrchestrationBoardTask[] }): React.JSX.Element {
  const { rooms, stats } = useOfficeData(tasks)
  const [selectedAgent, setSelectedAgent] = useState<OfficeAgent | null>(null)

  // Collect all root task ids for the activity feed
  const allTaskIds = useMemo(() => tasks.filter((t) => !t.parent_id).map((t) => t.id), [tasks])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <OfficeStatsBar stats={stats} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <OfficeFloor
          rooms={rooms}
          onSelectAgent={(agent) => {
            setSelectedAgent((prev) => (prev?.id === agent.id ? null : agent))
          }}
        />

        <OfficeActivityFeed taskIds={allTaskIds} />
      </div>

      {/* Agent detail popover at bottom */}
      {selectedAgent && (
        <div className="flex shrink-0 items-center gap-3 border-t border-border/40 bg-card/60 px-4 py-2">
          <span className="text-lg">{selectedAgent.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold" style={{ color: selectedAgent.color }}>
              {selectedAgent.name}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{selectedAgent.taskTitle}</p>
          </div>
          <span
            className="rounded px-2 py-0.5 text-[10px] font-medium capitalize"
            style={{
              background: `${selectedAgent.color}18`,
              color: selectedAgent.color,
              border: `1px solid ${selectedAgent.color}44`
            }}
          >
            {selectedAgent.status}
          </span>
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSelectedAgent(null)
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

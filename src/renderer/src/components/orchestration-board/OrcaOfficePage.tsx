import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import officeImg from '@/assets/office/office-real.png'
import type { OrchestrationBoardTask } from './orchestration-board-model'
import { useOfficeData } from './use-office-data'
import { OfficeStatsBar } from './OfficeStatsBar'
import { OfficeActivityFeed } from './OfficeActivityFeed'
import { FlyingTaskCard, OfficeAgentLabel, type FlyingTask } from './office-agent-label'

// ── position layouts ──────────────────────────────────────────────────────────
const LAYOUTS: Record<number, { x: number; y: number }[]> = {
  1: [{ x: 50, y: 45 }],
  2: [
    { x: 35, y: 45 },
    { x: 65, y: 45 }
  ],
  3: [
    { x: 50, y: 35 },
    { x: 25, y: 60 },
    { x: 75, y: 60 }
  ],
  4: [
    { x: 30, y: 35 },
    { x: 70, y: 35 },
    { x: 30, y: 65 },
    { x: 70, y: 65 }
  ],
  5: [
    { x: 50, y: 30 },
    { x: 20, y: 45 },
    { x: 80, y: 45 },
    { x: 30, y: 70 },
    { x: 70, y: 70 }
  ],
  6: [
    { x: 30, y: 30 },
    { x: 70, y: 30 },
    { x: 15, y: 55 },
    { x: 50, y: 55 },
    { x: 85, y: 55 },
    { x: 50, y: 78 }
  ],
  7: [
    { x: 50, y: 28 },
    { x: 20, y: 35 },
    { x: 80, y: 35 },
    { x: 35, y: 55 },
    { x: 65, y: 55 },
    { x: 22, y: 75 },
    { x: 78, y: 75 }
  ]
}

import type { OfficeAgent } from './use-office-data'

function buildDefaultPositions(agents: OfficeAgent[]): Record<string, { x: number; y: number }> {
  const layout = LAYOUTS[Math.min(agents.length, 7)] ?? LAYOUTS[7]
  const out: Record<string, { x: number; y: number }> = {}
  agents.forEach((a, i) => {
    out[a.id] = layout[i % layout.length] ?? { x: 20 + ((i * 15) % 60), y: 30 + ((i * 12) % 50) }
  })
  return out
}

const LS_KEY = 'orca-office-label-pos'

export function OrcaOfficePage({ tasks }: { tasks: OrchestrationBoardTask[] }): React.JSX.Element {
  const { rooms, stats } = useOfficeData(tasks)
  const allAgents = useMemo(() => rooms.flatMap((r) => r.agents), [rooms])

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => {
    try {
      const saved = localStorage.getItem(LS_KEY)
      return saved ? (JSON.parse(saved) as Record<string, { x: number; y: number }>) : {}
    } catch {
      return {}
    }
  })

  const mergedPositions = useMemo(() => {
    return { ...buildDefaultPositions(allAgents), ...positions }
  }, [allAgents, positions])

  const [flying, setFlying] = useState<FlyingTask[]>([])
  const prevStatuses = useRef<Record<string, string>>({})

  useEffect(() => {
    for (const agent of allAgents) {
      const prev = prevStatuses.current[agent.id]
      if (agent.status === 'working' && prev !== 'working') {
        const to = mergedPositions[agent.id] ?? { x: 50, y: 50 }
        setFlying((f) => [
          ...f,
          {
            id: Date.now() + Math.random(),
            from: { x: 50, y: 10 },
            to,
            label: agent.taskTitle.slice(0, 40)
          }
        ])
      }
      prevStatuses.current[agent.id] = agent.status
    }
  }, [allAgents, mergedPositions])

  const removeFlight = useCallback((id: number) => {
    setFlying((f) => f.filter((x) => x.id !== id))
  }, [])

  const handleDragEnd = useCallback((id: string, x: number, y: number) => {
    setPositions((prev) => {
      const next = { ...prev, [id]: { x, y } }
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const [time, setTime] = useState(() => new Date().toLocaleTimeString())
  useEffect(() => {
    const t = setInterval(() => {
      setTime(new Date().toLocaleTimeString())
    }, 1000)
    return () => {
      clearInterval(t)
    }
  }, [])

  const allTaskIds = useMemo(() => tasks.filter((t) => !t.parent_id).map((t) => t.id), [tasks])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <OfficeStatsBar stats={stats} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden bg-gray-950">
          <div className="relative h-full w-full" style={{ aspectRatio: '2816 / 1536' }}>
            {/* Isometric office background */}
            <img
              src={officeImg}
              alt="Orca HQ"
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />

            {/* LIVE badge + clock */}
            <div className="absolute left-3 top-3 z-30 flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-full border border-green-500/50 bg-green-900/70 px-3 py-1 backdrop-blur-sm">
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                <span className="text-[11px] font-bold text-green-400">LIVE</span>
              </div>
              <div className="rounded-lg border border-cyan-500/30 bg-gray-900/70 px-3 py-1 backdrop-blur-sm">
                <span className="font-mono text-[11px] text-cyan-400">{time}</span>
              </div>
            </div>

            {/* Active agents badge */}
            {stats.activeTasks > 0 && (
              <div className="absolute bottom-3 left-3 z-30 rounded-lg border border-yellow-500/50 bg-yellow-900/70 px-2 py-1 backdrop-blur-sm">
                <span className="text-[11px] text-yellow-400">
                  ⚡ {stats.activeTasks} agent{stats.activeTasks > 1 ? 's' : ''} working
                </span>
              </div>
            )}

            {/* Room labels */}
            {rooms.map((room, i) => (
              <div
                key={room.id}
                className="absolute z-10 rounded border bg-background/60 px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm"
                style={{
                  left: `${10 + (i % 3) * 30}%`,
                  top: `${8 + Math.floor(i / 3) * 25}%`,
                  borderColor: room.activeCount > 0 ? '#39ff1466' : 'var(--border)',
                  color: room.activeCount > 0 ? '#39ff14' : 'var(--foreground)'
                }}
              >
                {room.label}
                {room.activeCount > 0 && (
                  <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#39ff14]" />
                )}
              </div>
            ))}

            {/* Flying tasks */}
            {flying.map((item) => (
              <FlyingTaskCard key={item.id} item={item} onDone={removeFlight} />
            ))}

            {/* Agent sprites */}
            {allAgents.map((agent) => (
              <OfficeAgentLabel
                key={agent.id}
                agent={agent}
                pos={mergedPositions[agent.id] ?? { x: 50, y: 50 }}
                isWorking={agent.status === 'working'}
                isBlocked={agent.status === 'blocked'}
                taskTitle={agent.taskTitle}
                onDragEnd={handleDragEnd}
              />
            ))}

            {allAgents.length === 0 && (
              <div className="absolute inset-0 flex items-end justify-center pb-12">
                <div className="rounded-xl border border-border/40 bg-background/70 px-6 py-3 text-sm text-muted-foreground backdrop-blur-sm">
                  No active agents — start a task to populate the office
                </div>
              </div>
            )}
          </div>
        </div>

        <OfficeActivityFeed taskIds={allTaskIds} />
      </div>
    </div>
  )
}

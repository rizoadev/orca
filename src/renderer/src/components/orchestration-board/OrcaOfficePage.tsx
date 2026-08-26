import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import officeImg from '@/assets/office/office-real.png'
import type { OrchestrationBoardTask } from './orchestration-board-model'
import { useOfficeData, type OfficeAgent } from './use-office-data'
import { OfficeStatsBar } from './OfficeStatsBar'
import { OfficeActivityFeed } from './OfficeActivityFeed'

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

function defaultPositions(agents: OfficeAgent[]): Record<string, { x: number; y: number }> {
  const count = agents.length
  const layout = LAYOUTS[Math.min(count, 7)] ?? LAYOUTS[7]
  const out: Record<string, { x: number; y: number }> = {}
  agents.forEach((a, i) => {
    out[a.id] = layout[i % layout.length] ?? { x: 20 + ((i * 15) % 60), y: 30 + ((i * 12) % 50) }
  })
  return out
}

// ── FlyingTask CSS animation ──────────────────────────────────────────────────
type FlyingTask = {
  id: number
  from: { x: number; y: number }
  to: { x: number; y: number }
  label: string
  done: boolean
}

function FlyingTaskCard({
  item,
  onDone
}: {
  item: FlyingTask
  onDone: (id: number) => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) {
      return
    }
    const anim = el.animate(
      [
        {
          left: `${item.from.x}%`,
          top: `${item.from.y}%`,
          opacity: 0,
          transform: 'translate(-50%,-50%) scale(0.4)'
        },
        {
          left: `${(item.from.x + item.to.x) / 2}%`,
          top: `${Math.min(item.from.y, item.to.y) - 14}%`,
          opacity: 1,
          transform: 'translate(-50%,-50%) scale(1.2)'
        },
        {
          left: `${item.to.x}%`,
          top: `${item.to.y}%`,
          opacity: 0.9,
          transform: 'translate(-50%,-50%) scale(1)'
        }
      ],
      { duration: 2200, easing: 'ease-in-out', fill: 'forwards' }
    )
    anim.onfinish = () => {
      onDone(item.id)
    }
    return () => {
      anim.cancel()
    }
  }, [item, onDone])

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute z-50"
      style={{ left: `${item.from.x}%`, top: `${item.from.y}%`, transform: 'translate(-50%,-50%)' }}
    >
      <div
        className="rounded-lg border-2 border-cyan-400 px-3 py-1.5 text-[10px] font-bold text-cyan-200 shadow-2xl"
        style={{
          background: 'linear-gradient(135deg,rgba(0,245,255,0.15),rgba(157,78,221,0.15))',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 0 24px rgba(0,245,255,0.6)'
        }}
      >
        📋 {item.label}
      </div>
    </div>
  )
}

// ── AgentLabel ────────────────────────────────────────────────────────────────
function AgentLabel({
  agent,
  pos,
  isWorking,
  isBlocked,
  taskTitle,
  onDragEnd
}: {
  agent: OfficeAgent
  pos: { x: number; y: number }
  isWorking: boolean
  isBlocked: boolean
  taskTitle?: string
  onDragEnd: (id: string, x: number, y: number) => void
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const parent = containerRef.current?.parentElement
      if (!parent) {
        return
      }
      const rect = parent.getBoundingClientRect()
      dragStart.current = {
        mx: e.clientX,
        my: e.clientY,
        ox: pos.x,
        oy: pos.y
      }
      const onMove = (ev: MouseEvent): void => {
        if (!dragStart.current) {
          return
        }
        const dx = ((ev.clientX - dragStart.current.mx) / rect.width) * 100
        const dy = ((ev.clientY - dragStart.current.my) / rect.height) * 100
        const nx = Math.max(5, Math.min(95, dragStart.current.ox + dx))
        const ny = Math.max(5, Math.min(95, dragStart.current.oy + dy))
        if (containerRef.current) {
          containerRef.current.style.left = `${nx}%`
          containerRef.current.style.top = `${ny}%`
        }
      }
      const onUp = (ev: MouseEvent): void => {
        if (!dragStart.current) {
          return
        }
        const dx = ((ev.clientX - dragStart.current.mx) / rect.width) * 100
        const dy = ((ev.clientY - dragStart.current.my) / rect.height) * 100
        const nx = Math.max(5, Math.min(95, dragStart.current.ox + dx))
        const ny = Math.max(5, Math.min(95, dragStart.current.oy + dy))
        onDragEnd(agent.id, nx, ny)
        dragStart.current = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [agent.id, onDragEnd, pos]
  )

  const statusDot = isWorking ? '#39ff14' : isBlocked ? '#ef4444' : '#6b7280'

  return (
    <div
      ref={containerRef}
      className="group absolute z-20 cursor-grab select-none"
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, 0)' }}
      onMouseDown={handleMouseDown}
    >
      {/* Task bubble shown while working */}
      {isWorking && taskTitle && (
        <div className="pointer-events-none mb-1 flex flex-col items-center">
          <div
            className="max-w-[220px] rounded-lg px-2.5 py-1.5 text-[10px]"
            style={{
              background: 'rgba(10,10,26,0.95)',
              border: `2px solid ${agent.color}`,
              boxShadow: `0 0 14px ${agent.color}44`
            }}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5 animate-ping rounded-full"
                style={{ background: agent.color }}
              />
              <span className="font-bold" style={{ color: agent.color }}>
                Working
              </span>
            </div>
            <p className="mt-0.5 truncate text-gray-300">{taskTitle}</p>
          </div>
          <div
            className="h-2 w-2 rotate-45 -mt-1"
            style={{
              background: 'rgba(10,10,26,0.95)',
              borderRight: `2px solid ${agent.color}`,
              borderBottom: `2px solid ${agent.color}`
            }}
          />
        </div>
      )}

      {/* Name tag */}
      <div className="relative inline-block">
        <div
          className="rounded px-2 py-1 text-[11px] font-bold text-white shadow-lg"
          style={{
            background: '#1a1a2e',
            border: `2px solid ${agent.color}`,
            boxShadow: isWorking
              ? `0 0 14px ${agent.color}, 0 2px 8px rgba(0,0,0,0.7)`
              : '0 2px 8px rgba(0,0,0,0.7)'
          }}
        >
          {agent.name}
          <div className="text-[9px] font-normal opacity-75">{agent.handle}</div>
        </div>
        {/* Status dot */}
        <div
          className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2"
          style={{
            background: statusDot,
            borderColor: '#0f0f1a',
            boxShadow: `0 0 6px ${statusDot}`
          }}
        />
      </div>
    </div>
  )
}

// ── Main OrcaOfficePage ───────────────────────────────────────────────────────
const LS_KEY = 'orca-office-label-pos'

export function OrcaOfficePage({ tasks }: { tasks: OrchestrationBoardTask[] }): React.JSX.Element {
  const { rooms, stats } = useOfficeData(tasks)
  const containerRef = useRef<HTMLDivElement>(null)

  // Flatten all dispatched agents across all rooms
  const allAgents = useMemo(() => rooms.flatMap((r) => r.agents), [rooms])

  // Positions state — initialized from localStorage + default layout
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => {
    try {
      const saved = localStorage.getItem(LS_KEY)
      return saved ? (JSON.parse(saved) as Record<string, { x: number; y: number }>) : {}
    } catch {
      return {}
    }
  })

  // Merge default positions for any new agents
  const mergedPositions = useMemo(() => {
    const defaults = defaultPositions(allAgents)
    return { ...defaults, ...positions }
  }, [allAgents, positions])

  // Flying task animations
  const [flying, setFlying] = useState<FlyingTask[]>([])
  const prevStatuses = useRef<Record<string, string>>({})

  // Detect newly dispatched agents → trigger flying animation from center
  useEffect(() => {
    for (const agent of allAgents) {
      const prev = prevStatuses.current[agent.id]
      if (agent.status === 'working' && prev !== 'working') {
        const from = { x: 50, y: 20 }
        const to = mergedPositions[agent.id] ?? { x: 50, y: 50 }
        setFlying((f) => [
          ...f,
          {
            id: Date.now() + Math.random(),
            from,
            to,
            label: agent.taskTitle.slice(0, 40),
            done: false
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
        {/* Office floor */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-gray-950">
          <div
            ref={containerRef}
            className="relative h-full w-full"
            style={{ aspectRatio: '2816 / 1536' }}
          >
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

            {/* Room label badges */}
            {rooms.map((room, i) => (
              <div
                key={room.id}
                className="absolute z-10 rounded border border-border/40 bg-background/60 px-2 py-0.5 text-[10px] font-semibold text-foreground backdrop-blur-sm"
                style={{
                  left: `${10 + (i % 3) * 30}%`,
                  top: `${8 + Math.floor(i / 3) * 25}%`,
                  borderColor: room.activeCount > 0 ? '#39ff1466' : undefined,
                  color: room.activeCount > 0 ? '#39ff14' : undefined
                }}
              >
                {room.label}
                {room.activeCount > 0 && (
                  <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#39ff14]" />
                )}
              </div>
            ))}

            {/* Flying task animations */}
            {flying.map((item) => (
              <FlyingTaskCard key={item.id} item={item} onDone={removeFlight} />
            ))}

            {/* Agent labels */}
            {allAgents.map((agent) => (
              <AgentLabel
                key={agent.id}
                agent={agent}
                pos={mergedPositions[agent.id] ?? { x: 50, y: 50 }}
                isWorking={agent.status === 'working'}
                isBlocked={agent.status === 'blocked'}
                taskTitle={agent.taskTitle}
                onDragEnd={handleDragEnd}
              />
            ))}

            {/* Empty state overlay */}
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

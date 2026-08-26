import React, { useEffect, useRef } from 'react'
import charWickedman from '@/assets/office/char-wickedman.png'
import charPy from '@/assets/office/char-py.png'
import charVigil from '@/assets/office/char-vigil.png'
import charQuill from '@/assets/office/char-quill.png'
import charSavy from '@/assets/office/char-savy.png'
import type { OfficeAgent } from './use-office-data'

// ── sprite pool ───────────────────────────────────────────────────────────────
const CHAR_SPRITES = [charWickedman, charPy, charVigil, charQuill, charSavy]

export function spriteFor(handle: string): string {
  let h = 0
  for (let i = 0; i < handle.length; i++) {
    h = (Math.imul(31, h) + handle.charCodeAt(i)) | 0
  }
  return CHAR_SPRITES[Math.abs(h) % CHAR_SPRITES.length]
}

// ── FlyingTask ────────────────────────────────────────────────────────────────
export type FlyingTask = {
  id: number
  from: { x: number; y: number }
  to: { x: number; y: number }
  label: string
}

export function FlyingTaskCard({
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
export function OfficeAgentLabel({
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
  const sprite = spriteFor(agent.handle)
  const statusDot = isWorking ? '#39ff14' : isBlocked ? '#ef4444' : '#6b7280'

  const handleMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    const parent = containerRef.current?.parentElement
    if (!parent) {
      return
    }
    const rect = parent.getBoundingClientRect()
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y }

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
      onDragEnd(
        agent.id,
        Math.max(5, Math.min(95, dragStart.current.ox + dx)),
        Math.max(5, Math.min(95, dragStart.current.oy + dy))
      )
      dragStart.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={containerRef}
      className="absolute z-20 cursor-grab select-none"
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, 0)' }}
      onMouseDown={handleMouseDown}
    >
      <div className="flex flex-col items-center">
        {/* Task bubble */}
        {isWorking && taskTitle && (
          <div className="pointer-events-none mb-1 flex flex-col items-center">
            <div
              className="max-w-[200px] rounded-lg px-2.5 py-1.5"
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
                <span className="text-[10px] font-bold" style={{ color: agent.color }}>
                  Working
                </span>
              </div>
              <p className="mt-0.5 truncate text-[9px] text-gray-300">{taskTitle}</p>
            </div>
            <div
              className="-mt-1 h-2 w-2 rotate-45"
              style={{
                background: 'rgba(10,10,26,0.95)',
                borderRight: `2px solid ${agent.color}`,
                borderBottom: `2px solid ${agent.color}`
              }}
            />
          </div>
        )}

        {/* 3D character sprite */}
        <div className="relative">
          <img
            src={sprite}
            alt={agent.name}
            draggable={false}
            className="h-auto w-16 object-contain"
            style={{
              filter: isWorking
                ? `drop-shadow(0 0 10px ${agent.color}) drop-shadow(0 0 4px ${agent.color})`
                : isBlocked
                  ? 'drop-shadow(0 0 8px #ef4444) grayscale(0.4)'
                  : 'drop-shadow(0 2px 6px rgba(0,0,0,0.9))',
              animation: isWorking ? 'office-bounce 0.7s ease-in-out infinite alternate' : undefined
            }}
          />
          <div
            className="absolute right-0 top-1 h-3 w-3 rounded-full border-2"
            style={{
              background: statusDot,
              borderColor: '#0f0f1a',
              boxShadow: `0 0 6px ${statusDot}`
            }}
          />
        </div>

        {/* Name tag */}
        <div
          className="mt-0.5 rounded px-2 py-0.5 text-center text-[10px] font-bold text-white"
          style={{
            background: '#1a1a2ecc',
            border: `1px solid ${agent.color}`,
            boxShadow: isWorking ? `0 0 10px ${agent.color}66` : undefined
          }}
        >
          {agent.name.length > 12 ? `${agent.name.slice(0, 12)}\u2026` : agent.name}
        </div>
      </div>
    </div>
  )
}

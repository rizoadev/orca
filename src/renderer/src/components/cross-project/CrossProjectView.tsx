import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Suspense } from 'react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { Columns3, Plus, Terminal as TerminalIcon, X } from 'lucide-react'
import { useAppStore } from '../../store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { TerminalTab } from '../../../../shared/types'

// Why: TerminalPane is 3k+ lines; lazy-load so cross-project view doesn't bloat initial bundle.
const TerminalPane = lazy(() => import('../terminal-pane/TerminalPane'))

const MIN_COLUMN_RATIO = 0.15

type ColumnState = {
  worktreeId: string
  tabId: string
}

function ResizeHandle({ onResize }: { onResize: (delta: number) => void }): React.JSX.Element {
  const handleRef = useRef<HTMLDivElement>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const handle = handleRef.current
      if (!handle) {
        return
      }
      handle.setPointerCapture(e.pointerId)

      const onMove = (ev: PointerEvent) => {
        onResize(ev.clientX - startX)
      }
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove)
        handle.removeEventListener('pointerup', onUp)
      }
      handle.addEventListener('pointermove', onMove)
      handle.addEventListener('pointerup', onUp)
    },
    [onResize]
  )

  return (
    <div
      ref={handleRef}
      className="w-1.5 shrink-0 cursor-col-resize bg-border/40 hover:bg-blue-500/60 active:bg-blue-500 transition-colors z-10"
      onPointerDown={onPointerDown}
    />
  )
}

// Why: find first terminal tab for a worktree so each column shows a live PTY.
function pickTerminalTab(
  worktreeId: string,
  unifiedTabs: Record<
    string,
    ReturnType<typeof useAppStore.getState>['unifiedTabsByWorktree'][string]
  >
): TerminalTab | null {
  const tabs = unifiedTabs[worktreeId] ?? []
  const terminal = tabs.find((t) => t.contentType === 'terminal')
  return (terminal as TerminalTab | undefined) ?? null
}

export function CrossProjectView({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element | null {
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const unifiedTabsByWorktree = useAppStore((s) => s.unifiedTabsByWorktree)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const closeUnifiedTab = useAppStore((s) => s.closeUnifiedTab)

  const allWorktrees = useMemo(() => Object.values(worktreesByRepo ?? {}).flat(), [worktreesByRepo])

  const [columns, setColumns] = useState<ColumnState[]>([])
  const [ratios, setRatios] = useState<number[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  // Why: seed columns from active worktree's first terminal tab on open.
  useEffect(() => {
    if (!open) {
      return
    }
    const seed: ColumnState[] = []
    for (const w of allWorktrees) {
      const tab = pickTerminalTab(w.id, unifiedTabsByWorktree)
      if (tab) {
        seed.push({ worktreeId: w.id, tabId: tab.id })
        if (seed.length >= 2) {
          break
        }
      }
    }
    if (seed.length === 0 && activeWorktreeId) {
      const tab = pickTerminalTab(activeWorktreeId, unifiedTabsByWorktree)
      if (tab) {
        seed.push({ worktreeId: activeWorktreeId, tabId: tab.id })
      }
    }
    setColumns(seed)
    // Why: only re-seed on open toggle, not on every tab/worktree change — user may have manually adjusted columns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Initialize / rebalance ratios when column count changes
  useEffect(() => {
    if (columns.length > 0) {
      setRatios((prev) => {
        if (prev.length === columns.length) {
          return prev
        }
        const even = 1 / columns.length
        return Array.from({ length: columns.length }, () => even)
      })
    }
  }, [columns.length])

  const addColumn = useCallback(
    (worktreeId: string) => {
      const tab = pickTerminalTab(worktreeId, unifiedTabsByWorktree)
      if (!tab) {
        return
      }
      setColumns((prev) => {
        if (prev.some((c) => c.worktreeId === worktreeId)) {
          return prev
        }
        return [...prev, { worktreeId, tabId: tab.id }]
      })
    },
    [unifiedTabsByWorktree]
  )

  const removeColumn = useCallback((index: number) => {
    setColumns((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const onResize = useCallback((colIndex: number, delta: number) => {
    const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 1000
    const deltaRatio = delta / containerWidth
    setRatios((prev) => {
      const next = [...prev]
      const left = next[colIndex] ?? 0
      const right = next[colIndex + 1] ?? 0
      let newLeft = left + deltaRatio
      let newRight = right - deltaRatio
      if (newLeft < MIN_COLUMN_RATIO) {
        newLeft = MIN_COLUMN_RATIO
        newRight = left + right - MIN_COLUMN_RATIO
      }
      if (newRight < MIN_COLUMN_RATIO) {
        newRight = MIN_COLUMN_RATIO
        newLeft = left + right - MIN_COLUMN_RATIO
      }
      next[colIndex] = newLeft
      next[colIndex + 1] = newRight
      return next
    })
  }, [])

  const handlePtyExit = useCallback((ptyId: string) => {
    // Why: keep the column mounted; the terminal pane shows its own exit state.
    void ptyId
  }, [])

  const handleCloseTab = useCallback(
    (colIndex: number) => {
      const col = columns[colIndex]
      if (!col) {
        return
      }
      closeUnifiedTab(col.tabId)
      removeColumn(colIndex)
    },
    [columns, closeUnifiedTab, removeColumn]
  )

  if (!open) {
    return null
  }

  const availableWorktrees = allWorktrees.filter((w) => !columns.some((c) => c.worktreeId === w.id))

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg-titlebar,var(--card))]">
      {/* Header — padding-right clears the OS window controls (minimize/maximize/close) */}
      <div
        className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3"
        style={{ paddingRight: 'var(--window-controls-width, 0px)' }}
      >
        <Columns3 className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Cross-Project View</span>
        <div className="flex-1" />
        {availableWorktrees.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-6 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3" />
                Add Project
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
              {availableWorktrees.map((w) => {
                const hasTerminal = pickTerminalTab(w.id, unifiedTabsByWorktree) !== null
                return (
                  <DropdownMenuItem
                    key={w.id}
                    onSelect={() => addColumn(w.id)}
                    disabled={!hasTerminal}
                  >
                    <TerminalIcon className="mr-1.5 size-3 text-muted-foreground" />
                    <span className="truncate max-w-[200px]">{w.displayName ?? w.id}</span>
                    {!hasTerminal && (
                      <span className="ml-auto text-[10px] text-muted-foreground">no terminal</span>
                    )}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={onClose}
            >
              <X className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Close cross-project view</TooltipContent>
        </Tooltip>
      </div>

      {/* Columns */}
      <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
        {columns.map((col, i) => {
          const worktree = allWorktrees.find((w) => w.id === col.worktreeId)
          const widthPct = ratios[i] ? `${ratios[i] * 100}%` : undefined

          return (
            <div
              key={`${col.worktreeId}:${col.tabId}`}
              className="flex flex-col min-h-0 overflow-hidden"
              style={{ width: widthPct, flex: widthPct ? 'none' : '1 1 0' }}
            >
              {/* Column header */}
              <div className="flex h-7 shrink-0 items-center gap-1 border-b border-border px-2 bg-card">
                <TerminalIcon className="size-3 shrink-0 text-muted-foreground" />
                <span className="text-[11px] font-medium text-foreground truncate flex-1">
                  {worktree?.displayName ?? col.worktreeId}
                </span>
                {columns.length > 1 && (
                  <button
                    type="button"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-red-500"
                    onClick={() => removeColumn(i)}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>

              {/* Terminal pane — rendered directly, bypassing overlay system */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Loading terminal…
                    </div>
                  }
                >
                  <TerminalPane
                    tabId={col.tabId}
                    worktreeId={col.worktreeId}
                    isActive={true}
                    isVisible={true}
                    isWorktreeActive={true}
                    showSplitButton={false}
                    onPtyExit={handlePtyExit}
                    onCloseTab={() => handleCloseTab(i)}
                  />
                </Suspense>
              </div>
            </div>
          )
        })}

        {/* Resize handles between columns */}
        {columns.length > 1 &&
          Array.from({ length: columns.length - 1 }).map((_, i) => (
            <ResizeHandle key={`resize-${i}`} onResize={(delta) => onResize(i, delta)} />
          ))}

        {/* Empty state */}
        {columns.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Columns3 className="mx-auto size-8 mb-2 opacity-40" />
              <p className="text-sm">No projects with terminals</p>
              <p className="text-xs mt-1">
                Open a terminal in a worktree first, then reopen this view
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

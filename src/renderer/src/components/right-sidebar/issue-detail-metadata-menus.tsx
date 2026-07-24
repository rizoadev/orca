import React, { useMemo, useState } from 'react'
import { Ban, Check, ChevronDown, CircleDot, Copy, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { GitHubIssueCloseReason } from '../../../../shared/types'
import type { RepoIssueProvider } from './repo-issue-provider'

export type IssueStateValue = 'open' | 'closed' | 'opened'

export function StatusMenu({
  provider,
  state,
  busy,
  issueNumber,
  onPick
}: {
  provider: RepoIssueProvider
  state: IssueStateValue
  busy: boolean
  issueNumber?: number
  onPick: (next: {
    state: IssueStateValue
    stateReason?: GitHubIssueCloseReason
    duplicateOf?: number
  }) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [duplicateMode, setDuplicateMode] = useState(false)
  const [duplicateDraft, setDuplicateDraft] = useState('')
  const isOpen = state === 'open' || state === 'opened'
  const label = isOpen
    ? translate('auto.components.right.sidebar.issuesPanel.statusOpen', 'Open')
    : translate('auto.components.right.sidebar.issuesPanel.statusClosed', 'Closed')

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setDuplicateMode(false)
          setDuplicateDraft('')
        }
      }}
      modal={false}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className={cn(
            'h-6 gap-1 px-2',
            isOpen
              ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
              : 'border-rose-500/40 text-rose-700 dark:text-rose-300'
          )}
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle className="size-3 animate-spin" />
          ) : isOpen ? (
            <CircleDot className="size-3" />
          ) : (
            <Ban className="size-3" />
          )}
          {label}
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className={cn('z-[80] p-1', duplicateMode ? 'w-64' : 'w-56')}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {duplicateMode ? (
          <div className="space-y-2 p-1">
            <div className="px-1 text-[11px] font-medium text-foreground">
              {translate(
                'auto.components.right.sidebar.issuesPanel.closeAsDuplicate',
                'Close as duplicate'
              )}
            </div>
            <input
              autoFocus
              value={duplicateDraft}
              onChange={(event) => setDuplicateDraft(event.target.value)}
              placeholder={translate(
                'auto.components.right.sidebar.issuesPanel.duplicateOfPlaceholder',
                'Issue number (e.g. 42)'
              )}
              className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/50"
              onKeyDown={(event) => {
                if (event.key !== 'Enter') {
                  return
                }
                event.preventDefault()
                const n = Number(duplicateDraft.replace(/[^0-9]/g, ''))
                if (!Number.isFinite(n) || n <= 0 || n === issueNumber) {
                  return
                }
                setOpen(false)
                setDuplicateMode(false)
                setDuplicateDraft('')
                onPick({ state: 'closed', stateReason: 'duplicate', duplicateOf: n })
              }}
            />
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-6 px-2 text-[11px]"
                onClick={() => {
                  setDuplicateMode(false)
                  setDuplicateDraft('')
                }}
              >
                {translate('auto.components.right.sidebar.issuesPanel.cancel', 'Cancel')}
              </Button>
              <Button
                type="button"
                size="xs"
                className="h-6 px-2 text-[11px]"
                onClick={() => {
                  const n = Number(duplicateDraft.replace(/[^0-9]/g, ''))
                  if (!Number.isFinite(n) || n <= 0 || n === issueNumber) {
                    return
                  }
                  setOpen(false)
                  setDuplicateMode(false)
                  setDuplicateDraft('')
                  onPick({ state: 'closed', stateReason: 'duplicate', duplicateOf: n })
                }}
              >
                {translate('auto.components.right.sidebar.issuesPanel.closeIssueShort', 'Close')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent',
                isOpen && 'bg-accent/50'
              )}
              onClick={() => {
                setOpen(false)
                onPick({ state: provider === 'github' ? 'open' : 'opened' })
              }}
            >
              <CircleDot className="size-3.5 text-emerald-500" />
              {translate('auto.components.right.sidebar.issuesPanel.reopenIssue', 'Open')}
            </button>
            {provider === 'github' ? (
              <>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                  onClick={() => {
                    setOpen(false)
                    onPick({ state: 'closed', stateReason: 'completed' })
                  }}
                >
                  <Check className="size-3.5 text-muted-foreground" />
                  {translate(
                    'auto.components.right.sidebar.issuesPanel.closeAsCompleted',
                    'Close as completed'
                  )}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                  onClick={() => {
                    setOpen(false)
                    onPick({ state: 'closed', stateReason: 'not_planned' })
                  }}
                >
                  <Ban className="size-3.5 text-muted-foreground" />
                  {translate(
                    'auto.components.right.sidebar.issuesPanel.closeAsNotPlanned',
                    'Close as not planned'
                  )}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                  onClick={() => setDuplicateMode(true)}
                >
                  <Copy className="size-3.5 text-muted-foreground" />
                  {translate(
                    'auto.components.right.sidebar.issuesPanel.closeAsDuplicate',
                    'Close as duplicate'
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent',
                  !isOpen && 'bg-accent/50'
                )}
                onClick={() => {
                  setOpen(false)
                  onPick({ state: 'closed' })
                }}
              >
                <Ban className="size-3.5 text-muted-foreground" />
                {translate(
                  'auto.components.right.sidebar.issuesPanel.closeIssueShort',
                  'Close issue'
                )}
              </button>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function MultiSelectMenu({
  title,
  icon,
  selected,
  options,
  loading,
  busy,
  emptyLabel,
  searchPlaceholder,
  onToggle
}: {
  title: string
  icon: React.ReactNode
  selected: string[]
  options: { id: string; label: string }[]
  loading: boolean
  busy: boolean
  emptyLabel: string
  searchPlaceholder: string
  onToggle: (id: string, selected: boolean) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selectedSet = useMemo(() => new Set(selected.map((v) => v.toLowerCase())), [selected])
  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      return options
    }
    return options.filter(
      (option) => option.id.toLowerCase().includes(q) || option.label.toLowerCase().includes(q)
    )
  }, [options, query])
  const summary =
    selected.length === 0
      ? title
      : selected.length <= 2
        ? selected.join(', ')
        : translate(
            'auto.components.right.sidebar.issuesPanel.selectedCount',
            '{{value0}} selected',
            {
              value0: selected.length
            }
          )

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setQuery('')
        }
      }}
      modal={false}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="h-6 max-w-[200px] gap-1 px-2"
          disabled={busy}
          title={selected.length > 0 ? selected.join(', ') : title}
        >
          {busy ? <LoaderCircle className="size-3 animate-spin" /> : icon}
          <span className="truncate">{summary}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="z-[80] w-72 p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
        <div className="px-1 pb-1">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/50"
          />
        </div>
        {selected.length > 0 ? (
          <div className="mb-1 flex flex-wrap gap-1 px-2 pb-1">
            {selected.slice(0, 6).map((item) => (
              <span
                key={item}
                className="inline-flex max-w-full items-center rounded-full border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                <span className="truncate">{item}</span>
              </span>
            ))}
            {selected.length > 6 ? (
              <span className="text-[10px] text-muted-foreground">+{selected.length - 6}</span>
            ) : null}
          </div>
        ) : null}
        {loading ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            {translate('auto.components.right.sidebar.issuesPanel.loadingOptions', 'Loading…')}
          </div>
        ) : options.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">{emptyLabel}</div>
        ) : filteredOptions.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            {translate(
              'auto.components.right.sidebar.issuesPanel.noMatchingOptions',
              'No matching options.'
            )}
          </div>
        ) : (
          <div className="scrollbar-sleek max-h-56 overflow-y-auto">
            {filteredOptions.map((option) => {
              const isSelected = selectedSet.has(option.id.toLowerCase())
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={busy}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-50',
                    isSelected && 'bg-accent/40'
                  )}
                  // Why: keep the menu open for multi-edit assign/label toggles.
                  onClick={() => onToggle(option.id, isSelected)}
                >
                  <span
                    className={cn(
                      'flex size-3.5 shrink-0 items-center justify-center rounded-sm border',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border'
                    )}
                  >
                    {isSelected ? <Check className="size-2.5" /> : null}
                  </span>
                  <span className="min-w-0 truncate">{option.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

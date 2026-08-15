/* eslint-disable max-lines -- Why: NotesPage owns the whole three-pane notes layout
 * (vault navigation, note list, editor) so the note-taking flow reads as one surface. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  Download,
  FileText,
  Loader2,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  Upload
} from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { useConfirmationDialog } from '@/components/confirmation-dialog'
import type {
  Note,
  NoteSearchQuery,
  NoteTag,
  NotesListResult
} from '../../../../shared/notes-types'
import type {
  NotesSyncStatus,
  NotesSyncUserConfig
} from '../../../../shared/notes-sync-types'

const VIEW_OPTIONS = ['all', 'recent', 'pinned'] as const
type NotesViewOption = (typeof VIEW_OPTIONS)[number]

const TAG_COLORS = ['#94a3b8', '#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7'] as const

// Why: autosave on a short debounce keeps every keystroke durable without hammering
// the store per key; superseded writes are harmless because each payload is the full note.
const AUTOSAVE_MS = 600
const SEARCH_DEBOUNCE_MS = 250

type NotesSaveState = 'idle' | 'saving' | 'saved' | 'error'

type NotesVaultState = NotesListResult & { loading: boolean }

const EMPTY_VAULT: NotesVaultState = { notes: [], tags: [], loading: true }

async function loadNotes(query: NoteSearchQuery | undefined): Promise<NotesVaultState> {
  const result = await window.api.notes.list(query)
  return { ...result, loading: false }
}

function deriveNoteTitle(content: string, fallback: string): string {
  const firstLine = content
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
  if (!firstLine) {
    return fallback
  }
  return firstLine.replace(/^#{1,6}\s+/, '').replace(/[*_`]/g, '').trim() || fallback
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) {
    return translate('auto.components.notes.time.justNow', 'now')
  }
  if (minutes < 60) {
    return translate('auto.components.notes.time.minutesAgo', '{{value0}}m', {
      value0: String(minutes)
    })
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return translate('auto.components.notes.time.hoursAgo', '{{value0}}h', {
      value0: String(hours)
    })
  }
  const days = Math.floor(hours / 24)
  return translate('auto.components.notes.time.daysAgo', '{{value0}}d', {
    value0: String(days)
  })
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

// Why: autosave is captured per note id so a controller only fires the latest
// pending write for the note the user is currently editing.
function useNoteAutosave(onSave: (id: string, title: string, content: string) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<{ id: string; title: string; content: string } | null>(null)

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (pendingRef.current) {
      const { id, title, content } = pendingRef.current
      pendingRef.current = null
      onSave(id, title, content)
    }
  }, [onSave])

  const schedule = useCallback(
    (id: string, title: string, content: string) => {
      pendingRef.current = { id, title, content }
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(flush, AUTOSAVE_MS)
    },
    [flush]
  )

  useEffect(() => flush, [flush])

  return schedule
}

export function NotesPage(): React.JSX.Element {
  const [vault, setVault] = useState<NotesVaultState>(EMPTY_VAULT)
  const [saveState, setSaveState] = useState<NotesSaveState>('idle')
  // Why: sidebar counters must reflect total counts even while a filter shrinks
  // vault.notes, so keep an unfiltered snapshot distinct from the visible list.
  const [allNotes, setAllNotes] = useState<Note[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [selectedView, setSelectedView] = useState<NotesViewOption>('all')
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [newTagOpen, setNewTagOpen] = useState(false)
  const debouncedSearch = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS)

  const [syncStatus, setSyncStatus] = useState<NotesSyncStatus | null>(null)
  const [syncConfig, setSyncConfig] = useState<NotesSyncUserConfig | null>(null)
  const [syncing, setSyncing] = useState(false)
  const confirm = useConfirmationDialog()

  useEffect(() => {
    void window.api.notes.syncStatus().then(setSyncStatus)
    void window.api.notes.syncConfig().then(setSyncConfig)
    const unsubscribe = window.api.notes.onSyncStatusChanged(setSyncStatus)
    return unsubscribe
  }, [])

  // Why: reload an unfiltered list so view/tag counters stay accurate regardless
  // of the currently applied search or tag filter.
  const refreshCounts = useCallback(async () => {
    const result = await loadNotes(undefined)
    setAllNotes(result.notes)
  }, [])

  const refresh = useCallback(async (query: NoteSearchQuery | undefined) => {
    setVault((prev) => ({ ...prev, loading: true }))
    const next = await loadNotes(query)
    setVault(next)
    void refreshCounts()
  }, [refreshCounts])

  useEffect(() => {
    void refresh(undefined)
    setHasLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [refresh])

  useEffect(() => {
    if (!hasLoaded) {
      return
    }
    void refresh({
      text: debouncedSearch || undefined,
      tagIds: selectedTagId ? [selectedTagId] : undefined
    })
  }, [debouncedSearch, selectedTagId, hasLoaded, refresh])

  const notes = vault.notes
  const tags = vault.tags
  const tagLookup = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags])

  const viewCounts = useMemo(() => {
    const total = allNotes.length
    return { all: total, recent: total, pinned: allNotes.filter((n) => n.pinned).length }
  }, [allNotes])

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const note of allNotes) {
      for (const tagId of note.tagIds) {
        counts.set(tagId, (counts.get(tagId) ?? 0) + 1)
      }
    }
    return counts
  }, [allNotes])

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === editingNoteId) ?? null,
    [notes, editingNoteId]
  )

  const visibleNotes = useMemo(() => {
    if (selectedView === 'pinned') {
      return notes.filter((note) => note.pinned)
    }
    if (selectedView === 'recent') {
      return [...notes].sort((a, b) => b.updatedAt - a.updatedAt)
    }
    return notes
  }, [notes, selectedView])

  const persistNote = useCallback(
    async (id: string, updates: { title?: string; content?: string; pinned?: boolean; tagIds?: string[] }) => {
      setSaveState('saving')
      try {
        const result = await window.api.notes.updateNote(id, updates)
        setVault((prev) => ({ ...prev, ...result, loading: false }))
        setSaveState('saved')
        void refreshCounts()
      } catch (error) {
        console.error('Note autosave failed:', error)
        setSaveState('error')
        toast.error(
          translate('auto.components.notes.autosave.failed', 'Could not save note'),
          {
            description: error instanceof Error ? error.message : String(error)
          }
        )
      }
    },
    [refreshCounts]
  )

  const autosave = useNoteAutosave(
    useCallback(
      (id: string, title: string, content: string) => {
        void persistNote(id, { title, content })
      },
      [persistNote]
    )
  )

  const persistTitle = useCallback(
    async (id: string, title: string) => {
      setSaveState('saving')
      try {
        const result = await window.api.notes.updateNote(id, { title })
        setVault((prev) => ({ ...prev, ...result, loading: false }))
        setSaveState('saved')
        void refreshCounts()
      } catch (error) {
        console.error('Note title save failed:', error)
        setSaveState('error')
        toast.error(
          translate('auto.components.notes.autosave.failed', 'Could not save note'),
          {
            description: error instanceof Error ? error.message : String(error)
          }
        )
      }
    },
    [refreshCounts]
  )

  const handleCreateNote = useCallback(async () => {
    const result = await window.api.notes.createNote({})
    setVault((prev) => ({ ...prev, ...result, loading: false }))
    void refreshCounts()
    const id = result.notes[0]?.id
    if (id) {
      setEditingNoteId(id)
    }
  }, [refreshCounts])

  const handleSyncNow = useCallback(async () => {
    if (syncing) {
      return
    }
    setSyncing(true)
    try {
      const result = await window.api.notes.syncNow()
      if (result.status === 'error') {
        toast.error(
          translate('auto.components.notes.sync.failed', 'Sync failed'),
          { description: result.error }
        )
      }
      // Why: a successful sync may have merged remote notes in — refresh the list.
      await refresh(undefined)
    } finally {
      setSyncing(false)
    }
  }, [refresh, syncing])

  const isTursoLinked = syncConfig?.provider === 'turso'

  const handleExportNotes = useCallback(async () => {
    const result = await window.api.notes.exportNotes()
    if (result.status === 'ok') {
      toast.success(
        translate('auto.components.notes.export.success', 'Exported {{notes0}} notes and {{tags0}} tags', {
          notes0: String(result.notes),
          tags0: String(result.tags)
        })
      )
    } else if (result.status === 'error') {
      toast.error(translate('auto.components.notes.export.failed', 'Export failed'), {
        description: result.error
      })
    }
  }, [])

  const handleBackupNotes = useCallback(async () => {
    const result = await window.api.notes.backupNotes()
    if (result.status === 'ok') {
      toast.success(translate('auto.components.notes.backup.success', 'Backup created'))
    } else if (result.status === 'error') {
      toast.error(translate('auto.components.notes.backup.failed', 'Backup failed'), {
        description: result.error
      })
    }
  }, [])

  const handleImportNotes = useCallback(async () => {
    const result = await window.api.notes.importNotes()
    if (result.status === 'ok') {
      toast.success(
        translate(
          'auto.components.notes.import.success',
          'Imported {{imported0}} notes and updated {{updated0}}',
          {
            imported0: String(result.notesImported),
            updated0: String(result.notesUpdated)
          }
        )
      )
      await refresh(undefined)
    } else if (result.status === 'error') {
      toast.error(translate('auto.components.notes.import.failed', 'Import failed'), {
        description: result.error
      })
    }
  }, [refresh])

  const handleContentChange = useCallback(
    (content: string) => {
      if (!editingNoteId) {
        return
      }
      const base = notes.find((note) => note.id === editingNoteId)
      const title = base ? deriveNoteTitle(content, base.title) : ''
      setVault((prev) => ({
        ...prev,
        notes: prev.notes.map((note) =>
          note.id === editingNoteId ? { ...note, content, title, updatedAt: Date.now() } : note
        )
      }))
      if (base) {
        autosave(editingNoteId, title, content)
      }
    },
    [autosave, editingNoteId, notes]
  )

  const handleDeleteNote = useCallback(
    async (id: string) => {
      const base = notes.find((note) => note.id === id)
      const confirmed = await confirm({
        title: translate('auto.components.notes.deleteNoteConfirm', 'Delete note?'),
        description: base
          ? translate(
              'auto.components.notes.deleteNoteConfirmDesc',
              '\u201C{{value0}}\u201D will be permanently deleted. This cannot be undone.',
              { value0: base.title }
            )
          : undefined,
        confirmLabel: translate('auto.components.notes.deleteConfirmLabel', 'Delete'),
        confirmVariant: 'destructive'
      })
      if (!confirmed) {
        return
      }
      const result = await window.api.notes.deleteNote(id)
      setVault((prev) => ({ ...prev, ...result, loading: false }))
      void refreshCounts()
      if (editingNoteId === id) {
        setEditingNoteId(null)
      }
    },
    [editingNoteId, refreshCounts, notes, confirm]
  )

  const handleTogglePin = useCallback(
    async (id: string, pinned: boolean) => {
      const result = await window.api.notes.updateNote(id, { pinned })
      setVault((prev) => ({ ...prev, ...result, loading: false }))
      void refreshCounts()
    },
    [refreshCounts]
  )

  const handleCreateTag = useCallback(() => {
    setNewTagOpen(true)
  }, [])

  const handleConfirmCreateTag = useCallback(
    async (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) {
        return
      }
      const color = TAG_COLORS[tags.length % TAG_COLORS.length]
      try {
        const result = await window.api.notes.createTag({ name: trimmed, color })
        setVault((prev) => ({ ...prev, ...result, loading: false }))
        void refreshCounts()
        setNewTagOpen(false)
      } catch (error) {
        console.error('Failed to create tag:', error)
        toast.error(translate('auto.components.notes.tag.createFailed', 'Could not create tag'))
      }
    },
    [tags.length, refreshCounts]
  )

  const handleDeleteTag = useCallback(
    async (id: string) => {
      const confirmed = await confirm({
        title: translate('auto.components.notes.deleteTagConfirm', 'Delete tag?'),
        description: translate(
          'auto.components.notes.deleteTagConfirmDesc',
          'The tag will be deleted and removed from all notes that use it. Your notes are kept.'
        ),
        confirmLabel: translate('auto.components.notes.deleteConfirmLabel', 'Delete'),
        confirmVariant: 'destructive'
      })
      if (!confirmed) {
        return
      }
      const result = await window.api.notes.deleteTag(id)
      setVault((prev) => ({ ...prev, ...result, loading: false }))
      void refreshCounts()
      if (selectedTagId === id) {
        setSelectedTagId(null)
      }
    },
    [selectedTagId, refreshCounts, confirm]
  )

  const handleAssignTag = useCallback(
    async (noteId: string, tagId: string) => {
      const base = notes.find((note) => note.id === noteId)
      if (!base) {
        return
      }
      const has = base.tagIds.includes(tagId)
      const tagIds = has ? base.tagIds.filter((id) => id !== tagId) : [...base.tagIds, tagId]
      const result = await window.api.notes.updateNote(noteId, { tagIds })
      setVault((prev) => ({ ...prev, ...result, loading: false }))
      void refreshCounts()
    },
    [notes, refreshCounts]
  )

  const activeTag = tags.find((tag) => tag.id === selectedTagId) ?? null

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background text-foreground">
      {/* Left rail: views + tags */}
      <nav className="flex w-56 shrink-0 flex-col border-r border-border bg-card/30">
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            {translate('auto.components.notes.viewsLabel', 'Views')}
          </span>
          <div className="flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={translate('auto.components.notes.actions', 'Notes actions')}
                >
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={4}>
                <DropdownMenuItem onClick={() => void handleExportNotes()}>
                  <Download className="size-3.5" />
                  {translate('auto.components.notes.export.label', 'Export all')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleBackupNotes()}>
                  <Cloud className="size-3.5" />
                  {translate('auto.components.notes.backup.label', 'Create backup')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleImportNotes()}>
                  <Upload className="size-3.5" />
                  {translate('auto.components.notes.import.label', 'Import…')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => void handleCreateNote()}
                  aria-label={translate('auto.components.notes.newNote', 'New note')}
                >
                  <Plus className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {translate('auto.components.notes.newNote', 'New note')}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 px-2">
          {VIEW_OPTIONS.map((view) => {
            const active = selectedView === view && !selectedTagId
            return (
              <button
                key={view}
                type="button"
                onClick={() => {
                  setSelectedView(view)
                  setSelectedTagId(null)
                }}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                <FileText className="size-3.5 text-muted-foreground/70" />
                <span className="flex-1">{translate(viewLabelKey(view), view)}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground/50">
                  {viewCounts[view]}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          <span>{translate('auto.components.notes.tagsLabel', 'Tags')}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => void handleCreateTag()}
                aria-label={translate('auto.components.notes.newTag', 'New tag')}
              >
                <Plus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {translate('auto.components.notes.newTag', 'New tag')}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="mt-1 flex flex-col gap-0.5 overflow-y-auto px-2 pb-2 scrollbar-sleek">
          {tags.length === 0 ? (
            <p className="px-2 py-1 text-[12px] text-muted-foreground/70">
              {translate('auto.components.notes.tagsEmpty', 'No tags yet')}
            </p>
          ) : (
            tags.map((tag) => {
              const active = selectedTagId === tag.id
              return (
                <div
                  key={tag.id}
                  className={cn(
                    'group flex items-center rounded-md transition-colors',
                    active ? 'bg-worktree-sidebar-accent' : 'hover:bg-accent/50'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedView('all')
                      setSelectedTagId(tag.id)
                    }}
                    className={cn(
                      'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight',
                      active ? 'text-worktree-sidebar-accent-foreground' : 'text-muted-foreground'
                    )}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color ?? '#94a3b8' }}
                    />
                    <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="mr-0.5 opacity-0 group-hover:opacity-100"
                        aria-label={translate('auto.components.notes.tagActions', 'Tag actions')}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={4}>
                      <DropdownMenuItem
                        onClick={() => void handleDeleteTag(tag.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                        {translate('auto.components.notes.deleteTag', 'Delete tag')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span className="pr-2 text-[11px] tabular-nums text-muted-foreground/50">
                    {tagCounts.get(tag.id) ?? 0}
                  </span>
                </div>
              )
            })
          )}
        </div>
        <SyncFooter
          linked={isTursoLinked}
          syncing={syncing}
          status={syncStatus}
          onSyncNow={() => void handleSyncNow()}
        />
      </nav>

      {/* Middle rail: searchable note list */}
      <section className="flex w-72 shrink-0 flex-col border-r border-border bg-card/20">
        <div className="p-3 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/40" />
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={translate('auto.components.notes.searchPlaceholder', 'Search notes…')}
              className="h-8 pl-7 text-[13px]"
            />
          </div>
        </div>
        <div className="flex items-center justify-between px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          <span>
            {activeTag
              ? activeTag.name
              : translate(viewListLabelKey(selectedView), selectedView)}
          </span>
          <span className="font-normal normal-case tracking-normal">
            {translate('auto.components.notes.count', '{{value0}}', {
              value0: String(visibleNotes.length)
            })}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2 scrollbar-sleek">
          {visibleNotes.length === 0 ? (
            <EmptyNotesState onNewNote={() => void handleCreateNote()} hasActiveFilter={selectedTagId !== null || debouncedSearch !== ''} />
          ) : (
            visibleNotes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                tagLookup={tagLookup}
                active={editingNoteId === note.id}
                onSelect={() => setEditingNoteId(note.id)}
                onDelete={() => void handleDeleteNote(note.id)}
                onTogglePin={() => void handleTogglePin(note.id, !note.pinned)}
                onAssignTag={() => {
                  const firstTag = tags[0]
                  if (firstTag) {
                    void handleAssignTag(note.id, firstTag.id)
                  }
                }}
              />
            ))
          )}
        </div>
      </section>

      {/* Main editor pane */}
      <main className="flex min-w-0 flex-1 flex-col bg-editor-surface">
        {selectedNote ? (
          <NoteEditor
            note={selectedNote}
            onContentChange={handleContentChange}
            onDelete={() => void handleDeleteNote(selectedNote.id)}
            onTogglePin={() => void handleTogglePin(selectedNote.id, !selectedNote.pinned)}
            onAssignTag={(tagId) => void handleAssignTag(selectedNote.id, tagId)}
            onPersistTitle={(title) => void persistTitle(selectedNote.id, title)}
            saveState={saveState}
            tags={tags}
          />
        ) : (
          <div
            className="flex flex-1 items-center justify-center"
            data-contextual-tour-target="notes-editor-empty"
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <NotebookPen className="size-8 text-muted-foreground/30" />
              <p className="text-[14px] font-medium text-muted-foreground">
                {translate('auto.components.notes.editorEmpty', 'Select a note to start writing')}
              </p>
            </div>
          </div>
        )}
      </main>
      <NewTagDialog
        open={newTagOpen}
        onOpenChange={setNewTagOpen}
        onSubmit={(name) => void handleConfirmCreateTag(name)}
      />
    </div>
  )
}

const VIEW_COUNTS = {
  all: { label: 'auto.components.notes.view.all.label', list: 'auto.components.notes.view.all.listLabel' },
  recent: { label: 'auto.components.notes.view.recent.label', list: 'auto.components.notes.view.recent.listLabel' },
  pinned: { label: 'auto.components.notes.view.pinned.label', list: 'auto.components.notes.view.pinned.listLabel' }
} as const

function viewLabelKey(view: NotesViewOption): string {
  return VIEW_COUNTS[view].label
}

function viewListLabelKey(view: NotesViewOption): string {
  return VIEW_COUNTS[view].list
}

function NoteRow({
  note,
  tagLookup,
  active,
  onSelect,
  onDelete,
  onTogglePin,
  onAssignTag
}: {
  note: Note
  tagLookup: Map<string, NoteTag>
  active: boolean
  onSelect: () => void
  onDelete: () => void
  onTogglePin: () => void
  onAssignTag: () => void
}): React.JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onSelect()
        }
      }}
      className={cn(
        'group flex cursor-pointer flex-col gap-1 rounded-md px-2 py-2 transition-colors',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {note.pinned ? <Pin className="size-3 shrink-0 text-muted-foreground/60" /> : null}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-tight">
          {note.title}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
          {formatRelativeTime(note.updatedAt)}
        </span>
      </div>
      {note.content.trim() && (
        <p className="line-clamp-2 text-[12px] leading-snug text-muted-foreground/80">
          {stripMarkdown(note.content)}
        </p>
      )}
      <div className="flex min-w-0 items-center gap-1">
        {note.tagIds.slice(0, 3).map((tagId) => {
          const tag = tagLookup.get(tagId)
          return tag ? (
            <Badge key={tag.id} variant="outline" className="px-1 py-0 text-[10px] font-normal">
              <span
                className="mr-1 size-1.5 rounded-full"
                style={{ backgroundColor: tag.color ?? '#94a3b8' }}
              />
              {tag.name}
            </Badge>
          ) : null
        })}
        <span className="flex-1" />
        <RowIconButton
          title={translate('auto.components.notes.assignTag', 'Assign tag')}
          onClick={onAssignTag}
        >
          <Tag className="size-3" />
        </RowIconButton>
        <RowIconButton
          title={
            note.pinned
              ? translate('auto.components.notes.unpin', 'Unpin')
              : translate('auto.components.notes.pin', 'Pin')
          }
          onClick={onTogglePin}
          className={note.pinned ? 'text-foreground' : undefined}
        >
          <Pin className={cn('size-3', note.pinned && 'fill-current')} />
        </RowIconButton>
        <RowIconButton
          title={translate('auto.components.notes.delete', 'Delete')}
          onClick={onDelete}
          destructive
        >
          <Trash2 className="size-3" />
        </RowIconButton>
      </div>
    </div>
  )
}

function RowIconButton({
  title,
  onClick,
  children,
  className,
  destructive
}: {
  title: string
  onClick: (event: React.MouseEvent) => void
  children: React.ReactNode
  className?: string
  destructive?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={(event) => {
        event.stopPropagation()
        onClick(event)
      }}
      className={cn(
        'text-muted-foreground/50 transition-colors hover:text-foreground',
        destructive && 'hover:text-destructive',
        className
      )}
    >
      {children}
    </button>
  )
}

// Why: lightweight markdown strip for list previews — avoids mounting a full MD parser per row.
function stripMarkdown(content: string): string {
  return content
    .split('\n')
    .map((line) => line.replace(/^#{1,6}\s+/, '').replace(/[*_`>~]/g, '').trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
}

function NoteEditor({
  note,
  tags,
  onContentChange,
  onDelete,
  onTogglePin,
  onAssignTag,
  onPersistTitle,
  saveState
}: {
  note: Note
  tags: NoteTag[]
  onContentChange: (content: string) => void
  onDelete: () => void
  onTogglePin: () => void
  onAssignTag: (tagId: string) => void
  onPersistTitle: (title: string) => void
  saveState: NotesSaveState
}): React.JSX.Element {
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const [draftTitle, setDraftTitle] = useState(note.title)
  const [draftContent, setDraftContent] = useState(note.content)

  // Why: when a different note is selected, adopt its content without firing a save.
  useEffect(() => {
    setDraftTitle(note.title)
    setDraftContent(note.content)
    setMode('write')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- adopt only on note switch
  }, [note.id])

  const handleTitleBlur = useCallback(() => {
    const cleaned = draftTitle.trim()
    if (cleaned !== note.title) {
      onPersistTitle(cleaned || note.title)
    }
  }, [draftTitle, note.title, onPersistTitle])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <Input
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={handleTitleBlur}
          placeholder={translate('auto.components.notes.titlePlaceholder', 'Note title')}
          className="h-7 border-0 bg-transparent px-0 text-[15px] font-semibold tracking-tight shadow-none focus-visible:ring-0"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onTogglePin}
              aria-label={
                note.pinned
                  ? translate('auto.components.notes.unpin', 'Unpin')
                  : translate('auto.components.notes.pin', 'Pin')
              }
            >
              <Pin className={cn('size-4', note.pinned && 'fill-current')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {note.pinned
              ? translate('auto.components.notes.unpin', 'Unpin')
              : translate('auto.components.notes.pin', 'Pin')}
          </TooltipContent>
        </Tooltip>
        <NoteTagAssignMenu tags={tags} noteTagIds={note.tagIds} onAssignTag={onAssignTag} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              aria-label={translate('auto.components.notes.delete', 'Delete')}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {translate('auto.components.notes.delete', 'Delete')}
          </TooltipContent>
        </Tooltip>
        <div className="ml-auto flex items-center gap-0.5 rounded-md border border-border p-0.5">
          <EditModeButton
            active={mode === 'write'}
            onClick={() => setMode('write')}
            label={translate('auto.components.notes.modeEdit', 'Edit')}
            icon={<Pencil className="size-3.5" />}
          />
          <EditModeButton
            active={mode === 'preview'}
            onClick={() => setMode('preview')}
            label={translate('auto.components.notes.modePreview', 'Preview')}
            icon={<FileText className="size-3.5" />}
          />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {mode === 'preview' ? (
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-editor">
            {draftContent.trim() ? (
              <div className="markdown-body px-6 py-4 text-[14px] leading-relaxed">
                <Markdown remarkPlugins={[remarkGfm]}>{draftContent}</Markdown>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
                {translate('auto.components.notes.noPreview', 'Nothing to preview yet')}
              </div>
            )}
          </div>
        ) : (
          <textarea
            value={draftContent}
            onChange={(event) => {
              setDraftContent(event.target.value)
              onContentChange(event.target.value)
            }}
            spellCheck
            placeholder={translate('auto.components.notes.contentPlaceholder', 'Write in Markdown…')}
            className="h-full w-full flex-1 resize-none bg-transparent px-6 py-4 font-mono text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50 scrollbar-editor"
          />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 px-4 py-1.5 text-[11px] text-muted-foreground/60">
        {saveState === 'saving' ? (
          <Loader2 className="size-3 animate-spin" />
        ) : saveState === 'error' ? (
          <AlertTriangle className="size-3 text-destructive" />
        ) : (
          <Check className="size-3" />
        )}
        <span
          className={cn(saveState === 'error' && 'text-destructive')}
        >
          {saveState === 'saving'
            ? translate('auto.components.notes.autosave.saving', 'Saving…')
            : saveState === 'error'
              ? translate('auto.components.notes.autosave.failedStatus', 'Not saved')
              : translate('auto.components.notes.autosave', 'Autosaved')}
        </span>
      </div>
    </div>
  )
}

function EditModeButton({
  active,
  onClick,
  label,
  icon
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded px-2 py-1 text-[12px] font-medium transition-colors',
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function SyncFooter({
  linked,
  syncing,
  status,
  onSyncNow
}: {
  linked: boolean
  syncing: boolean
  status: NotesSyncStatus | null
  onSyncNow: () => void
}): React.JSX.Element {
  const lastRun = status?.lastRun
  return (
    <div className="mt-auto flex flex-col gap-1.5 border-t border-border px-3 py-2">
      <div className="flex items-center gap-2">
        {linked ? (
          <Cloud className="size-3.5 text-emerald-500" />
        ) : (
          <CloudOff className="size-3.5 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {linked
            ? translate('auto.components.notes.sync.linked', 'Turso synced')
            : translate('auto.components.notes.sync.unlinked', 'Turso not linked')}
        </span>
        {linked ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onSyncNow}
                disabled={syncing}
                aria-label={translate('auto.components.notes.sync.now', 'Sync now')}
              >
                <RefreshCw className={cn('size-3.5', syncing && 'animate-spin')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {translate('auto.components.notes.sync.now', 'Sync now')}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {linked && lastRun ? (
        <p className="truncate text-[10px] text-muted-foreground/60">
          {lastRun.status === 'syncing'
            ? translate('auto.components.notes.sync.doing', 'Syncing…')
            : lastRun.status === 'error'
              ? translate('auto.components.notes.sync.error', 'Last sync failed')
              : translate('auto.components.notes.sync.lastSync', 'Synced just now')}
        </p>
      ) : null}
    </div>
  )
}

function NewTagDialog({
  open,
  onOpenChange,
  onSubmit
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string) => void
}): React.JSX.Element {
  const [name, setName] = useState('')

  // Why: clear the field when the dialog opens again so stale names don't linger.
  useEffect(() => {
    if (open) {
      setName('')
    }
  }, [open])

  const handleSubmit = (): void => {
    if (name.trim()) {
      onSubmit(name)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.notes.tag.newTagTitle', 'New tag')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.notes.tag.newTagPrompt',
              'Give the tag a name. It will appear in the Tags list and can be assigned to notes.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="new-tag-name">
            {translate('auto.components.notes.tag.newTagName', 'Tag name')}
          </Label>
          <Input
            id="new-tag-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleSubmit()
              }
            }}
            placeholder={translate(
              'auto.components.notes.tag.newTagPlaceholder',
              'e.g. work, ideas, journal'
            )}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {translate('auto.components.notes.tag.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            {translate('auto.components.notes.tag.create', 'Create tag')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NoteTagAssignMenu({
  tags,
  noteTagIds,
  onAssignTag
}: {
  tags: NoteTag[]
  noteTagIds: string[]
  onAssignTag: (tagId: string) => void
}): React.JSX.Element {
  const noneSelected = noteTagIds.length === 0
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate('auto.components.notes.assignTag', 'Assign tags')}
          className={cn(
            'relative',
            noneSelected && 'text-muted-foreground/60'
          )}
        >
          <Tag className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4}>
        {tags.length === 0 ? (
          <DropdownMenuItem disabled>
            {translate('auto.components.notes.tagsEmpty', 'No tags yet')}
          </DropdownMenuItem>
        ) : (
          tags.map((tag) => {
            const selected = noteTagIds.includes(tag.id)
            return (
              <DropdownMenuItem key={tag.id} onSelect={() => onAssignTag(tag.id)}>
                <span
                  className="mr-2 size-2 rounded-full"
                  style={{ backgroundColor: tag.color ?? '#94a3b8' }}
                />
                <span className="flex-1">{tag.name}</span>
                {selected ? <Check className="size-3.5" /> : null}
              </DropdownMenuItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EmptyNotesState({
  onNewNote,
  hasActiveFilter
}: {
  onNewNote: () => void
  hasActiveFilter: boolean
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <NotebookPen className="size-8 text-muted-foreground/25" />
      <p className="text-[13px] text-muted-foreground">
        {hasActiveFilter
          ? translate('auto.components.notes.emptyFiltered', 'No notes match this filter')
          : translate('auto.components.notes.emptyAll', 'No notes yet')}
      </p>
      {!hasActiveFilter ? (
        <Button variant="secondary" size="sm" onClick={onNewNote}>
          <Plus className="size-3.5" />
          {translate('auto.components.notes.newNote', 'New note')}
        </Button>
      ) : null}
    </div>
  )
}

export default NotesPage

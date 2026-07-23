import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckSquare2, Square, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useActiveRepo, useActiveWorktree } from '@/store/selectors'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { ProjectTodoItem, ProjectTodoList } from '../../../../shared/project-todo-types'

function emptyList(projectKey: string): ProjectTodoList {
  return { projectKey, items: [], updatedAt: Date.now() }
}

export default function ProjectTodoPanel({ isVisible }: { isVisible: boolean }): React.JSX.Element {
  const activeWorktree = useActiveWorktree()
  const activeRepo = useActiveRepo()
  const projectKey = activeRepo?.id ?? activeWorktree?.repoId ?? ''
  const projectLabel = activeRepo?.displayName || activeRepo?.path || projectKey || 'Project'

  const [list, setList] = useState<ProjectTodoList>(() => emptyList(projectKey))
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async (key: string): Promise<void> => {
    if (!key) {
      setList(emptyList(''))
      return
    }
    setLoading(true)
    try {
      const next = await window.api.projectTodo.list({ projectKey: key })
      setList(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isVisible) {
      return
    }
    void refresh(projectKey)
  }, [isVisible, projectKey, refresh])

  const openCount = useMemo(() => list.items.filter((item) => !item.done).length, [list.items])
  const doneCount = list.items.length - openCount

  const addItem = useCallback(async (): Promise<void> => {
    const text = draft.trim()
    if (!projectKey || !text) {
      return
    }
    setDraft('')
    try {
      const next = await window.api.projectTodo.add({ projectKey, text })
      setList(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setDraft(text)
    }
  }, [draft, projectKey])

  const toggleItem = useCallback(
    async (item: ProjectTodoItem): Promise<void> => {
      if (!projectKey) {
        return
      }
      setBusyId(item.id)
      // Optimistic flip for snappy checkbox feel.
      setList((prev) => ({
        ...prev,
        items: prev.items.map((row) =>
          row.id === item.id ? { ...row, done: !row.done, updatedAt: Date.now() } : row
        )
      }))
      try {
        const next = await window.api.projectTodo.toggle({
          projectKey,
          id: item.id,
          done: !item.done
        })
        setList(next)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
        void refresh(projectKey)
      } finally {
        setBusyId(null)
      }
    },
    [projectKey, refresh]
  )

  const deleteItem = useCallback(
    async (id: string): Promise<void> => {
      if (!projectKey) {
        return
      }
      setBusyId(id)
      try {
        const next = await window.api.projectTodo.delete({ projectKey, id })
        setList(next)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
      } finally {
        setBusyId(null)
      }
    },
    [projectKey]
  )

  const clearDone = useCallback(async (): Promise<void> => {
    if (!projectKey || doneCount === 0) {
      return
    }
    try {
      const next = await window.api.projectTodo.clearDone({ projectKey })
      setList(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }, [doneCount, projectKey])

  if (!projectKey) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {translate(
          'auto.components.right.sidebar.ProjectTodoPanel.noProject',
          'Open a project to use its to-do list.'
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="border-b border-sidebar-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {translate('auto.components.right.sidebar.ProjectTodoPanel.title', 'To-Do')}
            </p>
            <p className="truncate text-xs text-foreground">{projectLabel}</p>
          </div>
          <p className="shrink-0 text-[11px] text-muted-foreground">
            {openCount}
            {doneCount > 0 ? ` · ${doneCount} done` : ''}
          </p>
        </div>
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            void addItem()
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={translate(
              'auto.components.right.sidebar.ProjectTodoPanel.placeholder',
              'Add a to-do…'
            )}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-ring"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground disabled:opacity-50"
          >
            {translate('auto.components.right.sidebar.ProjectTodoPanel.add', 'Add')}
          </button>
        </form>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading && list.items.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            {translate('auto.components.right.sidebar.ProjectTodoPanel.loading', 'Loading…')}
          </p>
        ) : null}
        {!loading && list.items.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            {translate(
              'auto.components.right.sidebar.ProjectTodoPanel.empty',
              'No to-dos yet. Add one above.'
            )}
          </p>
        ) : null}
        <ul className="space-y-0.5">
          {list.items.map((item) => (
            <li
              key={item.id}
              className={cn(
                'group flex items-start gap-1.5 rounded-md px-1.5 py-1.5 hover:bg-muted/40',
                busyId === item.id && 'opacity-70'
              )}
            >
              <button
                type="button"
                className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => void toggleItem(item)}
                aria-label={
                  item.done
                    ? translate(
                        'auto.components.right.sidebar.ProjectTodoPanel.markOpen',
                        'Mark open'
                      )
                    : translate(
                        'auto.components.right.sidebar.ProjectTodoPanel.markDone',
                        'Mark done'
                      )
                }
              >
                {item.done ? (
                  <CheckSquare2 size={15} className="text-foreground" />
                ) : (
                  <Square size={15} />
                )}
              </button>
              <button
                type="button"
                className={cn(
                  'min-w-0 flex-1 text-left text-xs leading-snug',
                  item.done ? 'text-muted-foreground line-through' : 'text-foreground'
                )}
                onClick={() => void toggleItem(item)}
              >
                {item.text}
              </button>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                onClick={() => void deleteItem(item.id)}
                aria-label={translate(
                  'auto.components.right.sidebar.ProjectTodoPanel.delete',
                  'Delete'
                )}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {doneCount > 0 ? (
        <div className="border-t border-sidebar-border px-3 py-2">
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => void clearDone()}
          >
            {translate(
              'auto.components.right.sidebar.ProjectTodoPanel.clearDone',
              'Clear completed ({{count}})',
              { count: doneCount }
            )}
          </button>
        </div>
      ) : null}
    </div>
  )
}

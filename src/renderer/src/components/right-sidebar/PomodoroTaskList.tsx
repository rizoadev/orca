import { useState } from 'react'
import { CheckSquare2, Play, Square, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { usePomodoroStore } from './pomodoro-timer-store'
import { taskSessionsDone, taskSessionsEstimate, usePomodoroTaskStore } from './pomodoro-task-store'

function sessionsLabel(total: number, done: number): string {
  if (total <= 0) {
    return ''
  }
  if (done >= total) {
    return translate(
      'auto.components.right.sidebar.PomodoroTaskList.doneSessions',
      '{{count}} sessions',
      { count: total }
    )
  }
  return translate(
    'auto.components.right.sidebar.PomodoroTaskList.sessionsProgress',
    '{{done}}/{{total}} sessions',
    { done, total }
  )
}

export function PomodoroTaskList(): React.JSX.Element {
  const tasks = usePomodoroTaskStore((s) => s.tasks)
  const activeTaskIds = usePomodoroTaskStore((s) => s.activeTaskIds)
  const addTask = usePomodoroTaskStore((s) => s.addTask)
  const removeTask = usePomodoroTaskStore((s) => s.removeTask)
  const toggleTaskDone = usePomodoroTaskStore((s) => s.toggleTaskDone)
  const toggleActiveTask = usePomodoroTaskStore((s) => s.toggleActiveTask)
  const focusMinutes = usePomodoroStore((s) => s.durationsMin.focus)
  const startTimer = usePomodoroStore((s) => s.start)

  const [draft, setDraft] = useState('')
  const [estimateDraft, setEstimateDraft] = useState('')
  const [showEstimate, setShowEstimate] = useState(false)

  const openTasks = tasks.filter((task) => !task.done)
  const doneTasks = tasks.filter((task) => task.done)
  const orderedTasks = [...openTasks, ...doneTasks]

  const submitTask = (): void => {
    const text = draft.trim()
    if (!text) {
      return
    }
    const parsedEstimate = Number.parseInt(estimateDraft, 10)
    const estimate = Number.isFinite(parsedEstimate) && parsedEstimate > 0 ? parsedEstimate : 0
    addTask(text, estimate)
    setDraft('')
    setEstimateDraft('')
    setShowEstimate(false)
  }

  const doTask = (id: string): void => {
    toggleActiveTask(id)
    startTimer()
  }

  const stopTask = (id: string): void => {
    toggleActiveTask(id)
  }

  return (
    <div className="mt-6 border-t border-border pt-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {translate('auto.components.right.sidebar.PomodoroTaskList.title', 'Tasks')}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {openTasks.length > 0 ? openTasks.length : ''}
          {openTasks.length > 0 && doneTasks.length > 0 ? ' · ' : ''}
          {doneTasks.length > 0 ? `${doneTasks.length} done` : ''}
        </div>
      </div>

      {/* Add task form */}
      <div className="flex flex-col gap-1.5">
        <form
          className="flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            submitTask()
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={translate(
              'auto.components.right.sidebar.PomodoroTaskList.addPlaceholder',
              'Add a task…'
            )}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-ring"
          />
          <Button type="submit" size="sm" disabled={!draft.trim()} className="shrink-0">
            {translate('auto.components.right.sidebar.PomodoroTaskList.add', 'Add')}
          </Button>
        </form>
        {showEstimate ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              submitTask()
            }}
          >
            <input
              value={estimateDraft}
              onChange={(event) => setEstimateDraft(event.target.value)}
              type="number"
              min={1}
              placeholder={translate(
                'auto.components.right.sidebar.PomodoroTaskList.estimatePlaceholder',
                'Estimated minutes'
              )}
              className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-ring"
              autoFocus
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    submitTask()
                  }}
                  aria-label={translate(
                    'auto.components.right.sidebar.PomodoroTaskList.confirmEstimate',
                    'Confirm task'
                  )}
                >
                  <CheckSquare2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {translate(
                  'auto.components.right.sidebar.PomodoroTaskList.confirmEstimate',
                  'Confirm task'
                )}
              </TooltipContent>
            </Tooltip>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowEstimate(true)}
            className="self-start text-[11px] text-muted-foreground hover:text-foreground"
          >
            {translate(
              'auto.components.right.sidebar.PomodoroTaskList.addEstimate',
              '+ Add estimate'
            )}
          </button>
        )}
      </div>

      {/* Task list */}
      {orderedTasks.length === 0 ? (
        <p className="mt-2 px-1 py-1 text-xs text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.PomodoroTaskList.empty',
            'No tasks yet. Add one above and start a focus session on it.'
          )}
        </p>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {orderedTasks.map((task) => {
            const total = taskSessionsEstimate(task, focusMinutes)
            const done = taskSessionsDone(task, focusMinutes)
            const isActive = activeTaskIds.includes(task.id)
            return (
              <li
                key={task.id}
                className={cn(
                  'group flex items-start gap-1.5 rounded-md px-1.5 py-1.5 hover:bg-muted/40',
                  isActive && 'bg-primary/10'
                )}
              >
                <button
                  type="button"
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => toggleTaskDone(task.id)}
                  aria-label={
                    task.done
                      ? translate(
                          'auto.components.right.sidebar.PomodoroTaskList.markOpen',
                          'Mark open'
                        )
                      : translate(
                          'auto.components.right.sidebar.PomodoroTaskList.markDone',
                          'Mark done'
                        )
                  }
                >
                  {task.done ? (
                    <CheckSquare2 size={15} className="text-foreground" />
                  ) : (
                    <Square size={15} />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className={cn(
                      'block min-w-0 text-left text-xs leading-snug',
                      task.done ? 'text-muted-foreground line-through' : 'text-foreground'
                    )}
                    onClick={() => toggleTaskDone(task.id)}
                  >
                    {task.text}
                  </button>
                  {isActive && (
                    <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-primary">
                      {translate(
                        'auto.components.right.sidebar.PomodoroTaskList.current',
                        '● Current task'
                      )}
                    </span>
                  )}
                  {total > 0 && (
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {sessionsLabel(total, done)}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {!task.done && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => doTask(task.id)}
                          aria-label={translate(
                            'auto.components.right.sidebar.PomodoroTaskList.doThis',
                            'Do this task'
                          )}
                        >
                          <Play />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={4}>
                        {translate(
                          'auto.components.right.sidebar.PomodoroTaskList.doThis',
                          'Do this task'
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {isActive && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => stopTask(task.id)}
                          aria-label={translate(
                            'auto.components.right.sidebar.PomodoroTaskList.stopTask',
                            'Stop task'
                          )}
                        >
                          <X />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={4}>
                        {translate(
                          'auto.components.right.sidebar.PomodoroTaskList.stopTask',
                          'Stop task'
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => removeTask(task.id)}
                        aria-label={translate(
                          'auto.components.right.sidebar.PomodoroTaskList.delete',
                          'Delete task'
                        )}
                      >
                        <Trash2 />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={4}>
                      {translate(
                        'auto.components.right.sidebar.PomodoroTaskList.delete',
                        'Delete task'
                      )}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {doneTasks.length > 0 && (
        <button
          type="button"
          onClick={() => usePomodoroTaskStore.getState().clearDone()}
          className="mt-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {translate(
            'auto.components.right.sidebar.PomodoroTaskList.clearDone',
            'Clear completed ({{count}})',
            { count: doneTasks.length }
          )}
        </button>
      )}
    </div>
  )
}

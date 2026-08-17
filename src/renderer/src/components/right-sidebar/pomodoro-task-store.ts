import { create } from 'zustand'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { usePomodoroStore } from './pomodoro-timer-store'

// Why: personal task list lives next to the pomodoro timer in the right
// sidebar. It is intentionally independent of the per-repo ProjectTodoPanel
// (project-todos.json) — these tasks are about the user's day, not a repo.

export type PomodoroTask = {
  id: string
  text: string
  done: boolean
  createdAt: number
  /** Estimated minutes the user plans to spend on this task. */
  estimateMin: number
  /** Minutes of focus already logged against this task. */
  focusedMin: number
}

type PomodoroTaskStore = {
  tasks: PomodoroTask[]
  /** ids of tasks currently being worked on — several can run in parallel. */
  activeTaskIds: string[]
  addTask: (text: string, estimateMin?: number) => void
  removeTask: (id: string) => void
  toggleTaskDone: (id: string) => void
  /** Toggle a task in/out of the active set (parallel sessions). */
  toggleActiveTask: (id: string) => void
  /** Log focus minutes to every active task when a focus phase completes. */
  logFocusMinutes: (minutes: number) => void
  clearDone: () => void
}

const STORAGE_KEY = 'orca:pomodoro-tasks:v1'

function clampEstimate(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(600, Math.max(0, Math.round(value)))
}

function loadTasks(): PomodoroTask[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter(
        (entry): entry is Partial<PomodoroTask> => Boolean(entry) && typeof entry === 'object'
      )
      .map((entry) => ({
        id: typeof entry.id === 'string' ? entry.id : createBrowserUuid(),
        text: typeof entry.text === 'string' ? entry.text : '',
        done: entry.done === true,
        createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
        estimateMin: clampEstimate(typeof entry.estimateMin === 'number' ? entry.estimateMin : 0),
        focusedMin: clampEstimate(typeof entry.focusedMin === 'number' ? entry.focusedMin : 0)
      }))
      .filter((task) => task.text.length > 0)
  } catch {
    return []
  }
}

function persistTasks(tasks: PomodoroTask[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  } catch {
    // Why: storage can be full or blocked in embedded webviews; the in-memory
    // list still works for the session.
  }
}

export const usePomodoroTaskStore = create<PomodoroTaskStore>()((set, get) => ({
  tasks: loadTasks(),
  activeTaskIds: [],
  addTask: (text, estimateMin = 0) => {
    const cleaned = text.trim()
    if (!cleaned) {
      return
    }
    const task: PomodoroTask = {
      id: createBrowserUuid(),
      text: cleaned,
      done: false,
      createdAt: Date.now(),
      estimateMin: clampEstimate(estimateMin),
      focusedMin: 0
    }
    const tasks = [task, ...get().tasks]
    set({ tasks })
    persistTasks(tasks)
  },
  removeTask: (id) => {
    const tasks = get().tasks.filter((task) => task.id !== id)
    set({
      tasks,
      // Why: dropping a task being worked on must not leave a dangling pointer.
      activeTaskIds: get().activeTaskIds.filter((activeId) => activeId !== id)
    })
    persistTasks(tasks)
  },
  toggleTaskDone: (id) => {
    const tasks = get().tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task))
    set({ tasks })
    persistTasks(tasks)
  },
  toggleActiveTask: (id) => {
    if (!get().tasks.some((task) => task.id === id)) {
      return
    }
    const activeTaskIds = get().activeTaskIds.includes(id)
      ? get().activeTaskIds.filter((activeId) => activeId !== id)
      : [...get().activeTaskIds, id]
    set({ activeTaskIds })
  },
  logFocusMinutes: (minutes) => {
    const activeTaskIds = get().activeTaskIds
    if (activeTaskIds.length === 0 || minutes <= 0) {
      return
    }
    // Why: parallel sessions share the focus time — every active task gets the
    // same logged minutes, so each one's session progress advances together.
    const tasks = get().tasks.map((task) =>
      activeTaskIds.includes(task.id) ? { ...task, focusedMin: task.focusedMin + minutes } : task
    )
    set({ tasks })
    persistTasks(tasks)
  },
  clearDone: () => {
    const tasks = get().tasks.filter((task) => !task.done)
    const activeTaskIds = get().activeTaskIds.filter((id) => tasks.some((task) => task.id === id))
    set({ tasks, activeTaskIds })
    persistTasks(tasks)
  }
}))

export function taskSessionsEstimate(task: PomodoroTask, focusMinutes: number): number {
  if (task.estimateMin <= 0 || focusMinutes <= 0) {
    return 0
  }
  return Math.max(1, Math.ceil(task.estimateMin / focusMinutes))
}

export function taskSessionsDone(task: PomodoroTask, focusMinutes: number): number {
  const total = taskSessionsEstimate(task, focusMinutes)
  if (total <= 0) {
    return 0
  }
  return Math.min(total, Math.floor(task.focusedMin / focusMinutes))
}

export function taskSessionsRemaining(task: PomodoroTask, focusMinutes: number): number {
  const total = taskSessionsEstimate(task, focusMinutes)
  return total <= 0 ? 0 : Math.max(0, total - taskSessionsDone(task, focusMinutes))
}

// Why: wire the task store to the timer store without touching the timer's
// own logic — whenever a focus session completes naturally (completedFocusSessions
// increments), log the focus length against the active task. Skipped phases keep
// the counter unchanged, so only real focus sessions are counted.
usePomodoroStore.subscribe((state, previous) => {
  if (state.completedFocusSessions === previous.completedFocusSessions) {
    return
  }
  // Why: the counter resets 4→0 after a long break; that drop is not a session.
  if (state.completedFocusSessions <= previous.completedFocusSessions) {
    return
  }
  const minutes = state.durationsMin.focus
  if (minutes > 0) {
    usePomodoroTaskStore.getState().logFocusMinutes(minutes)
  }
})

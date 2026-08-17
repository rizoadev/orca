import { describe, expect, it, beforeEach } from 'vitest'
import {
  taskSessionsDone,
  taskSessionsEstimate,
  taskSessionsRemaining,
  usePomodoroTaskStore,
  type PomodoroTask
} from './pomodoro-task-store'

function makeTask(overrides: Partial<PomodoroTask> = {}): PomodoroTask {
  return {
    id: 'task-1',
    text: 'Write docs',
    done: false,
    createdAt: 1000,
    estimateMin: 50,
    focusedMin: 0,
    ...overrides
  }
}

describe('pomodoro task store', () => {
  beforeEach(() => {
    usePomodoroTaskStore.setState({
      tasks: [],
      activeTaskIds: []
    })
  })

  it('adds a task at the top with a clamped estimate', () => {
    const store = usePomodoroTaskStore.getState()
    store.addTask('  Design review  ', 25)
    let tasks = usePomodoroTaskStore.getState().tasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0].text).toBe('Design review')
    expect(tasks[0].estimateMin).toBe(25)

    store.addTask('Very long task', 9999)
    tasks = usePomodoroTaskStore.getState().tasks
    expect(tasks[0].estimateMin).toBe(600)
  })

  it('ignores blank tasks', () => {
    usePomodoroTaskStore.getState().addTask('   ')
    expect(usePomodoroTaskStore.getState().tasks).toHaveLength(0)
  })

  it('toggles done and removes tasks, clearing a dangling active id', () => {
    const store = usePomodoroTaskStore.getState()
    store.addTask('Task A')
    const id = usePomodoroTaskStore.getState().tasks[0].id
    store.toggleActiveTask(id)

    store.toggleTaskDone(id)
    expect(usePomodoroTaskStore.getState().tasks[0].done).toBe(true)

    store.removeTask(id)
    const s = usePomodoroTaskStore.getState()
    expect(s.tasks).toHaveLength(0)
    expect(s.activeTaskIds).toHaveLength(0)
  })

  it('rejects toggling an active id that does not exist', () => {
    usePomodoroTaskStore.getState().toggleActiveTask('nope')
    expect(usePomodoroTaskStore.getState().activeTaskIds).toHaveLength(0)
  })

  it('toggles tasks in and out of the parallel active set', () => {
    const store = usePomodoroTaskStore.getState()
    store.addTask('Task A')
    store.addTask('Task B')
    const tasks = usePomodoroTaskStore.getState().tasks
    const a = tasks.find((t) => t.text === 'Task A')!
    const b = tasks.find((t) => t.text === 'Task B')!

    store.toggleActiveTask(a.id)
    store.toggleActiveTask(b.id)
    expect(usePomodoroTaskStore.getState().activeTaskIds.sort()).toEqual([a.id, b.id].sort())

    store.toggleActiveTask(a.id)
    expect(usePomodoroTaskStore.getState().activeTaskIds).toEqual([b.id])
  })

  it('logs focus minutes to every active task (parallel)', () => {
    const store = usePomodoroTaskStore.getState()
    store.addTask('Task A')
    store.addTask('Task B')
    const tasks = usePomodoroTaskStore.getState().tasks
    const a = tasks.find((t) => t.text === 'Task A')!
    const b = tasks.find((t) => t.text === 'Task B')!
    store.toggleActiveTask(a.id)
    store.toggleActiveTask(b.id)

    store.logFocusMinutes(25)
    const after = usePomodoroTaskStore.getState().tasks
    expect(after.find((t) => t.id === a.id)?.focusedMin).toBe(25)
    expect(after.find((t) => t.id === b.id)?.focusedMin).toBe(25)

    store.toggleActiveTask(a.id)
    store.logFocusMinutes(5)
    const final = usePomodoroTaskStore.getState().tasks
    expect(final.find((t) => t.id === a.id)?.focusedMin).toBe(25)
    expect(final.find((t) => t.id === b.id)?.focusedMin).toBe(30)
  })

  it('clearDone removes only completed tasks and keeps the active ones', () => {
    const store = usePomodoroTaskStore.getState()
    store.addTask('Done task')
    store.addTask('Open task')
    const tasks = usePomodoroTaskStore.getState().tasks
    const doneTask = tasks.find((t) => t.text === 'Done task')!
    const openTask = tasks.find((t) => t.text === 'Open task')!
    store.toggleTaskDone(doneTask.id)
    store.toggleActiveTask(openTask.id)

    store.clearDone()
    const remaining = usePomodoroTaskStore.getState().tasks
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(openTask.id)
    expect(usePomodoroTaskStore.getState().activeTaskIds).toEqual([openTask.id])
  })

  it('session helpers estimate sessions from minutes and track progress', () => {
    const task = makeTask({ estimateMin: 50, focusedMin: 0 })
    expect(taskSessionsEstimate(task, 25)).toBe(2)
    expect(taskSessionsDone(task, 25)).toBe(0)
    expect(taskSessionsRemaining(task, 25)).toBe(2)

    const halfway = makeTask({ estimateMin: 50, focusedMin: 25 })
    expect(taskSessionsDone(halfway, 25)).toBe(1)
    expect(taskSessionsRemaining(halfway, 25)).toBe(1)

    const complete = makeTask({ estimateMin: 50, focusedMin: 60 })
    expect(taskSessionsDone(complete, 25)).toBe(2)
    expect(taskSessionsRemaining(complete, 25)).toBe(0)
  })

  it('session helpers are safe with zero estimates', () => {
    const task = makeTask({ estimateMin: 0 })
    expect(taskSessionsEstimate(task, 25)).toBe(0)
    expect(taskSessionsDone(task, 25)).toBe(0)
    expect(taskSessionsRemaining(task, 25)).toBe(0)
  })
})

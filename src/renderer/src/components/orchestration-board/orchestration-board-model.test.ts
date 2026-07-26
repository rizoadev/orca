import { describe, expect, it } from 'vitest'
import {
  columnForTaskStatus,
  groupTasksByColumn,
  shortWorktreeLabel,
  taskBoardLabel,
  type OrchestrationBoardTask
} from './orchestration-board-model'

function task(
  partial: Partial<OrchestrationBoardTask> & Pick<OrchestrationBoardTask, 'id' | 'status'>
): OrchestrationBoardTask {
  return {
    spec: partial.spec ?? 'spec',
    ...partial
  }
}

describe('orchestration board model', () => {
  it('prefers display_name then task_title then spec', () => {
    expect(taskBoardLabel(task({ id: '1', status: 'ready', display_name: 'A', task_title: 'B' }))).toBe(
      'A'
    )
    expect(taskBoardLabel(task({ id: '1', status: 'ready', task_title: 'B', spec: 'C' }))).toBe('B')
    expect(taskBoardLabel(task({ id: '1', status: 'ready', spec: '  multi\nline  ' }))).toBe(
      'multi line'
    )
  })

  it('does not throw when title and spec are missing', () => {
    expect(
      taskBoardLabel({
        id: 'task-empty',
        status: 'failed',
        // Why: simulate a sparse RPC row after stop/retry.
        spec: undefined as unknown as string,
        display_name: null,
        task_title: null
      })
    ).toBe('task-empty')
  })

  it('maps statuses into board columns', () => {
    expect(columnForTaskStatus('pending')).toBe('ready')
    expect(columnForTaskStatus('ready')).toBe('ready')
    expect(columnForTaskStatus('dispatched')).toBe('dispatched')
    expect(columnForTaskStatus('blocked')).toBe('blocked')
    expect(columnForTaskStatus('completed')).toBe('completed')
    expect(columnForTaskStatus('failed')).toBe('failed')
  })

  it('groups tasks by column', () => {
    const groups = groupTasksByColumn([
      task({ id: 'a', status: 'pending' }),
      task({ id: 'b', status: 'dispatched' }),
      task({ id: 'c', status: 'completed' })
    ])
    expect(groups.ready.map((t) => t.id)).toEqual(['a'])
    expect(groups.dispatched.map((t) => t.id)).toEqual(['b'])
    expect(groups.completed.map((t) => t.id)).toEqual(['c'])
    expect(groups.blocked).toEqual([])
  })

  it('shortens worktree paths for card chrome', () => {
    expect(shortWorktreeLabel('repo::/Users/me/proj/feature-x')).toBe('feature-x')
    expect(shortWorktreeLabel(null)).toBeNull()
  })
})

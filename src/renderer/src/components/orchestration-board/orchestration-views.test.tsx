// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { OrchestrationBoardTask } from './orchestration-board-model'
import { OrchestrationTableView } from './OrchestrationTableView'
import { OrchestrationGanttView } from './OrchestrationGanttView'

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock }
}))

function makeTask(overrides: Partial<OrchestrationBoardTask> = {}): OrchestrationBoardTask {
  return {
    id: 'task-1',
    spec: 'spec',
    status: 'ready',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

describe('OrchestrationTableView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  it('renders root task rows', () => {
    render(
      <OrchestrationTableView
        tasks={[makeTask({ id: 'root', display_name: 'Root task' })]}
        onSelectTask={() => {}}
      />
    )
    expect(screen.getByText('Root task')).toBeTruthy()
  })

  it('renders an empty state when there are no tasks', () => {
    render(<OrchestrationTableView tasks={[]} onSelectTask={() => {}} />)
    expect(screen.getByText(/No orchestration tasks/i)).toBeTruthy()
  })

  it('expands to reveal subtask rows', () => {
    render(
      <OrchestrationTableView
        tasks={[
          makeTask({ id: 'root', display_name: 'Root task' }),
          makeTask({ id: 'child', parent_id: 'root', display_name: 'Child task' })
        ]}
        onSelectTask={() => {}}
      />
    )
    // Root expanded by default → child visible.
    expect(screen.getByText('Child task')).toBeTruthy()
  })

  it('calls onSelectTask when a row is clicked', () => {
    const onSelect = vi.fn()
    render(
      <OrchestrationTableView
        tasks={[makeTask({ id: 'root', display_name: 'Root task' })]}
        onSelectTask={onSelect}
      />
    )
    fireEvent.click(screen.getByText('Root task'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'root' }))
  })
})

describe('OrchestrationGanttView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  it('renders pipeline stage headers', () => {
    render(<OrchestrationGanttView tasks={[]} onSelectTask={() => {}} />)
    expect(screen.getByText('research')).toBeTruthy()
    expect(screen.getByText('implement')).toBeTruthy()
    expect(screen.getByText('review')).toBeTruthy()
  })

  it('renders a pipeline row with a stage block', () => {
    render(
      <OrchestrationGanttView
        tasks={[
          makeTask({
            id: 'root',
            pipeline_id: 'root',
            pipeline_stage: 'implement',
            status: 'dispatched'
          })
        ]}
        onSelectTask={() => {}}
      />
    )
    // The stage block shows the status.
    expect(screen.getAllByText('dispatched').length).toBeGreaterThan(0)
  })

  it('renders empty state', () => {
    render(<OrchestrationGanttView tasks={[]} onSelectTask={() => {}} />)
    expect(screen.getByText(/No pipelines to show yet/i)).toBeTruthy()
  })
})

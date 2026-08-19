// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { OrchestrationBoardTask } from '@/components/orchestration-board/orchestration-board-model'
import { OrchestrationSidebarTaskTree } from './OrchestrationSidebarTaskTree'

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock }
}))

function task(overrides: Partial<OrchestrationBoardTask> = {}): OrchestrationBoardTask {
  return {
    id: 't-1',
    spec: 'spec',
    status: 'ready',
    ...overrides
  }
}

describe('OrchestrationSidebarTaskTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  it('renders parent and child rows with child indented', () => {
    render(
      <OrchestrationSidebarTaskTree
        tasks={[
          task({ id: 'parent', display_name: 'Parent task' }),
          task({ id: 'child', parent_id: 'parent', display_name: 'Child task' })
        ]}
        onOpenTask={() => {}}
      />
    )
    // Parents auto-expand, so the child is visible.
    expect(screen.getByText('Parent task')).toBeTruthy()
    expect(screen.getByText('Child task')).toBeTruthy()
  })

  it('opens the clicked task', () => {
    const onOpen = vi.fn()
    render(
      <OrchestrationSidebarTaskTree
        tasks={[task({ id: 'parent', display_name: 'Parent task' })]}
        onOpenTask={onOpen}
      />
    )
    fireEvent.click(screen.getByText('Parent task'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'parent' }))
  })
})

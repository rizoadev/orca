// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { OrchestrationPlanChecklist } from './OrchestrationPlanChecklist'
import type { SubTaskBreakdownItem } from '../../../../shared/subtask-breakdown'

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock }
}))

const item: SubTaskBreakdownItem = { title: 'Add auth', role: 'implement', description: 'wire JWT' }

describe('OrchestrationPlanChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  it('renders an item with its role', () => {
    render(
      <OrchestrationPlanChecklist
        items={[item]}
        checked={new Set([0])}
        onToggle={() => {}}
        onAdd={() => {}}
        onDelete={() => {}}
        onUpdate={() => {}}
      />
    )
    expect(screen.getByText('Add auth')).toBeTruthy()
    expect(screen.getByText('implement')).toBeTruthy()
  })

  it('edits an item inline and saves the update', () => {
    const onUpdate = vi.fn()
    render(
      <OrchestrationPlanChecklist
        items={[item]}
        checked={new Set([0])}
        onToggle={() => {}}
        onAdd={() => {}}
        onDelete={() => {}}
        onUpdate={onUpdate}
      />
    )
    fireEvent.click(screen.getByTitle('Edit'))
    const titleInput = screen.getByPlaceholderText('Subtask title')
    fireEvent.change(titleInput, { target: { value: 'Add JWT auth' } })
    fireEvent.click(screen.getByText('Save'))
    expect(onUpdate).toHaveBeenCalledWith(0, {
      title: 'Add JWT auth',
      role: 'implement',
      description: 'wire JWT'
    })
  })
})

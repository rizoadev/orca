import { describe, expect, it } from 'vitest'
import { OrchestrationDb } from './db'

describe('OrchestrationDb parent-dependency auto-execution', () => {
  function createDb(): OrchestrationDb {
    return new OrchestrationDb(':memory:')
  }

  it('child depending on an unfinished parent stays pending, then becomes ready when the parent completes', () => {
    const d = createDb()
    const parent = d.createTask({ spec: 'parent' })
    const child = d.createTask({ spec: 'child', parentId: parent.id, deps: [parent.id] })
    expect(child.status).toBe('pending')
    d.updateTaskStatus(parent.id, 'completed')
    expect(d.getTask(child.id)?.status).toBe('ready')
  })

  it('child depending on an already-completed parent starts ready', () => {
    const d = createDb()
    const parent = d.createTask({ spec: 'parent' })
    d.updateTaskStatus(parent.id, 'completed')
    const child = d.createTask({ spec: 'child', parentId: parent.id, deps: [parent.id] })
    expect(child.status).toBe('ready')
  })

  it('child with no deps stays independent and ready', () => {
    const d = createDb()
    const parent = d.createTask({ spec: 'parent' })
    const child = d.createTask({ spec: 'child', parentId: parent.id })
    expect(child.status).toBe('ready')
    expect(child.parent_id).toBe(parent.id)
  })
})

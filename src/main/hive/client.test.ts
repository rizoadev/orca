import { describe, expect, it } from 'vitest'
import { flattenHiveProjectPayload } from './client-mappers'

describe('flattenHiveProjectPayload', () => {
  it('keeps a flat project array', () => {
    const rows = [{ id: '1', name: 'a' }]
    expect(flattenHiveProjectPayload(rows)).toEqual(rows)
  })

  it('flattens hive-v3 group map into project rows', () => {
    const payload = {
      Acme: [
        { id: 'p1', name: 'one', path_with_namespace: 'acme/one' },
        { id: 'p2', name: 'two', path_with_namespace: 'acme/two' }
      ],
      _ungrouped: [{ id: 'p3', name: 'solo', path_with_namespace: null }]
    }
    expect(flattenHiveProjectPayload(payload)).toEqual([
      { id: 'p1', name: 'one', path_with_namespace: 'acme/one' },
      { id: 'p2', name: 'two', path_with_namespace: 'acme/two' },
      { id: 'p3', name: 'solo', path_with_namespace: null }
    ])
  })

  it('unwraps { projects: [] } / { items: [] }', () => {
    expect(flattenHiveProjectPayload({ projects: [{ id: 'x', name: 'X' }] })).toEqual([
      { id: 'x', name: 'X' }
    ])
    expect(flattenHiveProjectPayload({ items: [{ id: 'y', name: 'Y' }] })).toEqual([
      { id: 'y', name: 'Y' }
    ])
  })
})

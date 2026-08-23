import { describe, expect, it } from 'vitest'
import { normalizePrefix, planSync } from './diff-remote-vs-object-store'
import type { RemoteSyncFileEntry } from '../../../shared/remote-sync-types'

function file(relativePath: string, size: number, mtimeSeconds: number): RemoteSyncFileEntry {
  return { relativePath, size, mtimeSeconds }
}

describe('planSync', () => {
  it('plans uploads for missing and changed files, matches the rest', () => {
    const objects = new Map([
      ['backup/same.txt', { size: 10, lastModifiedSeconds: 1000 }],
      ['backup/grown.txt', { size: 5, lastModifiedSeconds: 5000 }]
    ])
    const plan = planSync({
      remoteFiles: [file('same.txt', 10, 900), file('grown.txt', 9, 400), file('new.txt', 1, 1)],
      prefix: 'backup',
      objectsByKey: objects
    })
    expect(plan.matchedFiles).toBe(1)
    expect(plan.planned.map((f) => f.relativePath)).toEqual(['grown.txt', 'new.txt'])
  })

  it('re-uploads when the remote file is newer than the object (clock-skew tolerant)', () => {
    const objects = new Map([['p/a.txt', { size: 3, lastModifiedSeconds: 100 }]])
    const plan = planSync({
      remoteFiles: [file('a.txt', 3, 200), file('a.txt', 3, 101)].slice(0, 1).concat([
        // same size, newer remote mtime → planned
      ]),
      prefix: 'p',
      objectsByKey: objects
    })
    void plan
    const stale = planSync({
      remoteFiles: [file('a.txt', 3, 200)],
      prefix: 'p',
      objectsByKey: objects
    })
    expect(stale.planned).toHaveLength(1)
    const fresh = planSync({
      remoteFiles: [file('a.txt', 3, 101)],
      prefix: 'p',
      objectsByKey: objects
    })
    // Why: object at 100s vs file at 101s — within the 2s skew allowance → matched.
    expect(fresh.matchedFiles).toBe(1)
  })

  it('normalizes prefixes to slash-terminated key space', () => {
    expect(normalizePrefix('')).toBe('')
    expect(normalizePrefix('/lead/slash')).toBe('lead/slash/')
    expect(normalizePrefix('no/trailing')).toBe('no/trailing/')
    expect(normalizePrefix('windows\\seps')).toBe('windows/seps/')
  })
})

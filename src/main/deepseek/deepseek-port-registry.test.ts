import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DeepSeekPortRegistry } from './deepseek-port-registry'

const tmpDirs: string[] = []

function freshRegistry(): { registry: DeepSeekPortRegistry; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'orca-ds-ports-'))
  tmpDirs.push(dir)
  const file = join(dir, 'ports.json')
  return { registry: new DeepSeekPortRegistry(file), file }
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('DeepSeekPortRegistry', () => {
  it('allocates the lowest free port and never duplicates across projects', () => {
    const { registry } = freshRegistry()
    const a = registry.portFor('/work/orca')
    const b = registry.portFor('/work/deepseek')
    const c = registry.portFor('/work/orca')
    expect(a).toBe(3580)
    expect(b).toBe(3581)
    expect(c).toBe(a)
    expect(new Set([a, b]).size).toBe(2)
  })

  it('persists allocations across instances (restart keeps the same port)', () => {
    const { file } = freshRegistry()
    const first = new DeepSeekPortRegistry(file)
    const port = first.portFor('/work/orca')
    const second = new DeepSeekPortRegistry(file)
    expect(second.portFor('/work/orca')).toBe(port)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ '/work/orca': port })
  })

  it('reuses a port after drop and honors reassign', () => {
    const { registry } = freshRegistry()
    const a = registry.portFor('/work/orca')
    const b = registry.portFor('/work/other')
    registry.drop('/work/orca')
    expect(registry.portFor('/work/orca')).toBe(a)
    registry.reassign('/work/orca', 3700)
    expect(registry.portFor('/work/orca')).toBe(3700)
    expect(registry.portFor('/work/other')).toBe(b)
  })

  it('tolerates a missing or corrupt registry file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'orca-ds-ports-'))
    tmpDirs.push(dir)
    const file = join(dir, 'ports.json')
    const registry = new DeepSeekPortRegistry(file)
    expect(registry.portFor('/work/orca')).toBe(3580)
  })
})

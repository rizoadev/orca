import { describe, expect, it } from 'vitest'
import {
  buildBsdTreeStatCommand,
  buildGnuTreeStatCommand,
  escapeRemoteShellPath,
  parseTreeStatOutput
} from './remote-tree-stat-command'

describe('remote-tree-stat-command', () => {
  it('escapes hostile paths', () => {
    expect(escapeRemoteShellPath('~')).toBe('"$HOME"')
    expect(escapeRemoteShellPath('~/my dir')).toBe('"$HOME"/' + `'my dir'`)
    expect(escapeRemoteShellPath("/tmp/it's")).toBe(`'/tmp/it'\\''s'`)
    expect(escapeRemoteShellPath('$(rm -rf /)')).toBe(`'$(rm -rf /)'`)
  })

  it('builds GNU and BSD command variants rooted at the target dir', () => {
    const gnu = buildGnuTreeStatCommand('/srv/data')
    expect(gnu).toContain(`cd '/srv/data' && command find . -type f`)
    expect(gnu).toContain(`stat -c`)
    const bsd = buildBsdTreeStatCommand('/srv/data')
    expect(bsd).toContain(`stat -f`)
  })

  it('parses well-formed stat lines into relative entries', () => {
    const out = ['4096\t1735689600\t./docs/a b.txt', '12\t1700000000\t./x.bin', ''].join('\n')
    expect(parseTreeStatOutput(out)).toEqual([
      { relativePath: 'docs/a b.txt', size: 4096, mtimeSeconds: 1735689600 },
      { relativePath: 'x.bin', size: 12, mtimeSeconds: 1700000000 }
    ])
  })

  it('skips malformed lines and unsafe relative paths', () => {
    const out = [
      'garbage line',
      '10\t100\t',
      '10\t100\t../escape.txt',
      'NaN\t100\tbad.txt',
      '7\t200\tok.txt'
    ].join('\n')
    const entries = parseTreeStatOutput(out)
    expect(entries).toEqual([{ relativePath: 'ok.txt', size: 7, mtimeSeconds: 200 }])
  })
})

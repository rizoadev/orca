import { describe, expect, it } from 'vitest'
import { flattenHiveProjectPayload, mapEnvFile } from './client-mappers'

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

describe('mapEnvFile', () => {
  it('maps content from alternate payload keys', () => {
    expect(mapEnvFile({ path: '.env', body: 'FOO=1' })).toEqual({
      path: '.env',
      content: 'FOO=1',
      gitlabSnippetId: null,
      gitlabSnippetWebUrl: null
    })
    expect(mapEnvFile({ name: 'app.env', value: 'BAR=2' })).toEqual({
      path: 'app.env',
      content: 'BAR=2',
      gitlabSnippetId: null,
      gitlabSnippetWebUrl: null
    })
  })

  it('prefers Hive path over GitLab-mangled file_name', () => {
    expect(
      mapEnvFile({
        path: 'app/readyou',
        file_name: 'app__readyou',
        content: 'X=1'
      })
    ).toMatchObject({ path: 'app/readyou', content: 'X=1' })
  })

  it('demangles GitLab snippet file_name when path is missing', () => {
    expect(mapEnvFile({ file_name: 'app__readyou', content: 'X=1' })).toMatchObject({
      path: 'app/readyou',
      content: 'X=1'
    })
  })
})

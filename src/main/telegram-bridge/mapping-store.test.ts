import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDirs: string[] = []

vi.mock('../persistence', () => ({
  getCanonicalUserDataPath: () => tempDirs.at(-1)
}))

describe('TelegramBridgeMappingStore', () => {
  beforeEach(() => {
    tempDirs.push(mkdtempSync(join(tmpdir(), 'orca-tg-bridge-')))
  })

  afterEach(() => {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('upserts one mapping per repo and resolves by topic', async () => {
    const { TelegramBridgeMappingStore } = await import('./mapping-store')
    const store = new TelegramBridgeMappingStore()
    const first = store.upsertMapping({
      repoId: 'repo-a',
      telegramChatId: -1001,
      messageThreadId: 12,
      label: 'Orca AI'
    })
    const second = store.upsertMapping({
      repoId: 'repo-a',
      telegramChatId: -1001,
      messageThreadId: 99
    })
    expect(second.id).toBe(first.id)
    expect(store.getMappings()).toHaveLength(1)
    expect(store.findByTopic(-1001, 99)?.repoId).toBe('repo-a')
    expect(store.findByRepoId('repo-a')?.messageThreadId).toBe(99)
  })

  it('persists allowlist, group id, and enabled flag', async () => {
    const { TelegramBridgeMappingStore } = await import('./mapping-store')
    const store = new TelegramBridgeMappingStore()
    store.setConfig({
      enabled: true,
      allowedTelegramUserIds: [42, 42, 7],
      telegramGroupId: -100123
    })
    expect(store.getEnabled()).toBe(true)
    expect(store.getAllowedTelegramUserIds()).toEqual([42, 7])
    expect(store.getTelegramGroupId()).toBe(-100123)

    const reloaded = new TelegramBridgeMappingStore()
    expect(reloaded.getEnabled()).toBe(true)
    expect(reloaded.getAllowedTelegramUserIds()).toEqual([42, 7])
    expect(reloaded.getTelegramGroupId()).toBe(-100123)
  })

  it('migrates legacy defaultTelegramChatId into telegramGroupId', async () => {
    const { writeFileSync } = await import('node:fs')
    const dir = tempDirs.at(-1)!
    writeFileSync(
      join(dir, 'telegram-bridge-state.json'),
      JSON.stringify({
        version: 1,
        enabled: true,
        allowedTelegramUserIds: [1],
        defaultTelegramChatId: -100999,
        autoCreateTopics: true,
        mappings: [],
        updateOffset: 0
      }),
      'utf8'
    )
    const { TelegramBridgeMappingStore } = await import('./mapping-store')
    const store = new TelegramBridgeMappingStore()
    expect(store.getTelegramGroupId()).toBe(-100999)
  })
})

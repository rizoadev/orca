import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getCanonicalUserDataPath } from '../persistence'
import type { ProjectTodoItem, ProjectTodoList } from '../../shared/project-todo-types'

const STATE_FILE = 'project-todos.json'
const STATE_VERSION = 1
const MAX_ITEMS_PER_PROJECT = 200
const MAX_TEXT_LENGTH = 500

type PersistedState = {
  version: number
  listsByProjectKey: Record<string, ProjectTodoList>
}

const DEFAULT_STATE: PersistedState = {
  version: STATE_VERSION,
  listsByProjectKey: {}
}

function getStatePath(): string {
  return join(getCanonicalUserDataPath(), STATE_FILE)
}

function sanitizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const text = value.trim().slice(0, MAX_TEXT_LENGTH)
  return text.length > 0 ? text : null
}

function sanitizeItem(value: unknown): ProjectTodoItem | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const row = value as Partial<ProjectTodoItem>
  const text = sanitizeText(row.text)
  if (typeof row.id !== 'string' || !row.id || !text) {
    return null
  }
  const now = Date.now()
  return {
    id: row.id,
    text,
    done: row.done === true,
    createdAt:
      typeof row.createdAt === 'number' && Number.isFinite(row.createdAt) ? row.createdAt : now,
    updatedAt:
      typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt : now
  }
}

function sanitizeList(projectKey: string, value: unknown): ProjectTodoList {
  const now = Date.now()
  if (!value || typeof value !== 'object') {
    return { projectKey, items: [], updatedAt: now }
  }
  const row = value as Partial<ProjectTodoList>
  const items = Array.isArray(row.items)
    ? row.items.map(sanitizeItem).filter((item): item is ProjectTodoItem => item !== null)
    : []
  return {
    projectKey,
    items: items.slice(0, MAX_ITEMS_PER_PROJECT),
    updatedAt:
      typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt : now
  }
}

function loadState(): PersistedState {
  try {
    const raw = readFileSync(getStatePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    const listsByProjectKey: Record<string, ProjectTodoList> = {}
    if (parsed.listsByProjectKey && typeof parsed.listsByProjectKey === 'object') {
      for (const [key, list] of Object.entries(parsed.listsByProjectKey)) {
        const projectKey = key.trim()
        if (!projectKey) {
          continue
        }
        listsByProjectKey[projectKey] = sanitizeList(projectKey, list)
      }
    }
    return { version: STATE_VERSION, listsByProjectKey }
  } catch {
    return { ...DEFAULT_STATE, listsByProjectKey: {} }
  }
}

function saveState(state: PersistedState): void {
  const dir = getCanonicalUserDataPath()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const path = getStatePath()
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 })
  renameSync(tmp, path)
}

export class ProjectTodoStore {
  private state = loadState()

  getList(projectKey: string): ProjectTodoList {
    const key = projectKey.trim()
    if (!key) {
      return { projectKey: '', items: [], updatedAt: Date.now() }
    }
    return (
      this.state.listsByProjectKey[key] ?? { projectKey: key, items: [], updatedAt: Date.now() }
    )
  }

  addItem(projectKey: string, text: string): ProjectTodoList {
    const key = projectKey.trim()
    const cleaned = sanitizeText(text)
    if (!key || !cleaned) {
      return this.getList(key)
    }
    const now = Date.now()
    const current = this.getList(key)
    const item: ProjectTodoItem = {
      id: randomUUID(),
      text: cleaned,
      done: false,
      createdAt: now,
      updatedAt: now
    }
    // Why: newest open items at top so quick-add feels like a stack, not a log.
    const items = [item, ...current.items].slice(0, MAX_ITEMS_PER_PROJECT)
    const next: ProjectTodoList = { projectKey: key, items, updatedAt: now }
    this.state.listsByProjectKey[key] = next
    saveState(this.state)
    return next
  }

  toggleItem(projectKey: string, id: string, done?: boolean): ProjectTodoList {
    const key = projectKey.trim()
    if (!key || !id) {
      return this.getList(key)
    }
    const current = this.getList(key)
    const now = Date.now()
    let changed = false
    const items = current.items.map((item) => {
      if (item.id !== id) {
        return item
      }
      changed = true
      return {
        ...item,
        done: typeof done === 'boolean' ? done : !item.done,
        updatedAt: now
      }
    })
    if (!changed) {
      return current
    }
    // Why: open items stay above completed ones for a simple checklist scan.
    items.sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt)
    const next: ProjectTodoList = { projectKey: key, items, updatedAt: now }
    this.state.listsByProjectKey[key] = next
    saveState(this.state)
    return next
  }

  deleteItem(projectKey: string, id: string): ProjectTodoList {
    const key = projectKey.trim()
    if (!key || !id) {
      return this.getList(key)
    }
    const current = this.getList(key)
    const items = current.items.filter((item) => item.id !== id)
    if (items.length === current.items.length) {
      return current
    }
    const next: ProjectTodoList = { projectKey: key, items, updatedAt: Date.now() }
    this.state.listsByProjectKey[key] = next
    saveState(this.state)
    return next
  }

  clearDone(projectKey: string): ProjectTodoList {
    const key = projectKey.trim()
    if (!key) {
      return this.getList(key)
    }
    const current = this.getList(key)
    const items = current.items.filter((item) => !item.done)
    if (items.length === current.items.length) {
      return current
    }
    const next: ProjectTodoList = { projectKey: key, items, updatedAt: Date.now() }
    this.state.listsByProjectKey[key] = next
    saveState(this.state)
    return next
  }
}

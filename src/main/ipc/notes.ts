import { ipcMain, webContents } from 'electron'
import { TursoNotesService } from './notes-service'
import type {
  NoteCreateInput,
  NoteSearchQuery,
  NoteTagCreateInput,
  NoteTagUpdateInput,
  NoteUpdateInput
} from '../../shared/notes-types'
import type { NotesSyncUserConfig } from '../../shared/notes-sync-types'
import { notesSyncUserConfig, setNotesSyncUserConfig } from '../notes/sync-turso/sync-config'

// Why: thin IPC register file. The Turso-backed service lives in notes-service.ts
// so this file stays small; the window.api.notes.* surface is unchanged.

const service = new TursoNotesService()

export function registerNotesHandlers(): TursoNotesService {
  ipcMain.handle('notes:list', (_event, query?: NoteSearchQuery) => service.list(query))
  ipcMain.handle('notes:get', (_event, id: string) => service.get(id))
  ipcMain.handle('notes:createNote', (_event, input?: NoteCreateInput) => service.createNote(input))
  ipcMain.handle('notes:updateNote', (_event, id: string, input?: NoteUpdateInput) =>
    service.updateNote(id, input)
  )
  ipcMain.handle('notes:deleteNote', (_event, id: string) => service.deleteNote(id))
  ipcMain.handle('notes:createTag', (_event, input?: NoteTagCreateInput) =>
    service.createTag(input)
  )
  ipcMain.handle('notes:updateTag', (_event, id: string, input?: NoteTagUpdateInput) =>
    service.updateTag(id, input)
  )
  ipcMain.handle('notes:deleteTag', (_event, id: string) => service.deleteTag(id))

  // Sync/connection surface.
  ipcMain.handle('notes:syncStatus', () => service.getStatus())
  ipcMain.handle('notes:syncNow', () => service.syncNow())
  ipcMain.handle('notes:testConnection', () => service.testConnection())
  ipcMain.handle('notes:syncConfig', () => notesSyncUserConfig())
  ipcMain.handle('notes:setSyncConfig', (_event, updates: Partial<NotesSyncUserConfig>) => {
    const next = setNotesSyncUserConfig(updates)
    service.resetConfig()
    return next
  })

  // Export / backup / import.
  ipcMain.handle('notes:exportNotes', () => service.exportNotes())
  ipcMain.handle('notes:backupNotes', () => service.backupNotes())
  ipcMain.handle('notes:importNotes', () => service.importNotes())

  const forwardStatus = (): void => {
    const status = service.getStatus()
    for (const window of webContents.getAllWebContents()) {
      window.send('notes:syncStatusChanged', status)
    }
  }
  service.on('status-changed', forwardStatus)

  // Why: start the automatic pull timer once handlers are registered so notes
  // stay current across devices without the user pressing "Sync now".
  service.start()

  return service
}

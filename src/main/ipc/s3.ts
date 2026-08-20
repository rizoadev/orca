/**
 * Electron IPC handlers for S3-compatible object storage (explorer uploads).
 */
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  connect,
  disconnect,
  getConfig,
  getStatus,
  testConnection,
  uploadFile,
  listObjects,
  deleteObject,
  downloadObject
} from '../s3/client'
import type { S3ConnectArgs, S3UploadArgs } from '../../shared/s3-types'

const PROGRESS_EMIT_INTERVAL_MS = 200

export function registerS3Handlers(): void {
  ipcMain.removeHandler('s3:getStatus')
  ipcMain.removeHandler('s3:connect')
  ipcMain.removeHandler('s3:disconnect')
  ipcMain.removeHandler('s3:testConnection')
  ipcMain.removeHandler('s3:uploadFile')
  ipcMain.removeHandler('s3:listObjects')
  ipcMain.removeHandler('s3:deleteObject')
  ipcMain.removeHandler('s3:downloadObject')

  ipcMain.handle('s3:getStatus', async () => {
    return getStatus()
  })

  ipcMain.handle('s3:connect', async (_event, args: S3ConnectArgs) => {
    if (!args?.endpoint?.trim() || !args?.bucket?.trim()) {
      throw new Error('Endpoint and bucket are required.')
    }
    return connect(args)
  })

  ipcMain.handle('s3:disconnect', async () => {
    return disconnect()
  })

  ipcMain.handle('s3:testConnection', async (_event, args?: S3ConnectArgs) => {
    if (!args) {
      const current = getConfig()
      if (!current) {
        return { ok: false, error: 'S3 is not configured.' }
      }
      return testConnection(current)
    }
    return testConnection({
      endpoint: args.endpoint.trim().replace(/\/+$/, ''),
      region: args.region.trim() || 'us-east-1',
      bucket: args.bucket.trim(),
      accessKeyId: args.accessKeyId.trim(),
      secretAccessKey: args.secretAccessKey.trim(),
      forcePathStyle: args.forcePathStyle
    })
  })

  ipcMain.handle('s3:uploadFile', async (event: IpcMainInvokeEvent, args: S3UploadArgs) => {
    if (!args?.filePath || !args?.objectKey) {
      throw new Error('filePath and objectKey are required.')
    }
    let lastEmitAt = 0
    return uploadFile(args, (progress) => {
      // Why: throttle so multi-GB transfers don't flood the renderer with
      // per-chunk IPC messages; the terminal 100% event always passes.
      const now = Date.now()
      const terminal = progress.bytesUploaded >= progress.totalBytes
      if (!terminal && now - lastEmitAt < PROGRESS_EMIT_INTERVAL_MS) {
        return
      }
      lastEmitAt = now
      if (!event.sender.isDestroyed()) {
        event.sender.send('s3:uploadProgress', progress)
      }
    })
  })

  ipcMain.handle('s3:listObjects', async (_event, args: { prefix: string }) => {
    if (!args?.prefix) {
      throw new Error('prefix is required.')
    }
    return listObjects({ prefix: args.prefix })
  })

  ipcMain.handle('s3:deleteObject', async (_event, args: { key: string }) => {
    if (!args?.key) {
      throw new Error('key is required.')
    }
    return deleteObject({ key: args.key })
  })

  ipcMain.handle('s3:downloadObject', async (_event, args: { key: string; targetPath: string }) => {
    if (!args?.key || !args?.targetPath) {
      throw new Error('key and targetPath are required.')
    }
    return downloadObject({ key: args.key, targetPath: args.targetPath })
  })
}

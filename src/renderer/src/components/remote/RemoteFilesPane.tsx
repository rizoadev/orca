import React, { useCallback, useEffect, useState } from 'react'
import {
  ArrowUp,
  Download,
  FolderUp,
  LoaderCircle,
  RefreshCw,
  SquareTerminal,
  Upload
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { RemoteFileEntries } from './RemoteFileEntries'
import type { DirEntry } from './dir-entry'
import { translate } from '@/i18n/i18n'

type ConnGate = 'checking' | 'need-connect' | 'connecting' | 'ready'

type RemoteFilesPaneProps = {
  targetId: string
  /** Opens the integrated terminal split and cds it to the given directory. */
  onOpenTerminalHere?: (dirPath: string) => void
  /** Opens a file in the right-split remote editor. */
  onOpenFile?: (filePath: string) => void
}

/** SFTP-style browser over `ssh:browseDir` with transfers reusing the existing
 *  fs:* download and import IPC so system-SSH targets behave like ssh2 ones. */
export function RemoteFilesPane({
  targetId,
  onOpenTerminalHere,
  onOpenFile
}: RemoteFilesPaneProps): React.JSX.Element {
  const [dirPath, setDirPath] = useState('~')
  const [resolvedPath, setResolvedPath] = useState('')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [connGate, setConnGate] = useState<ConnGate>('checking')

  const listDir = useCallback(
    async (path: string) => {
      setLoading(true)
      setError(null)
      try {
        const result = await window.api.ssh.browseDir({ targetId, dirPath: path })
        setEntries(result.entries)
        setResolvedPath(result.resolvedPath)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [targetId]
  )

  // Why: fs/browse IPC require a live connection; the Files tab must not assume the Terminal tab already connected.
  const ensureConnected = useCallback(async (): Promise<boolean> => {
    try {
      const state = await window.api.ssh.getState({ targetId })
      if (state?.status === 'connected') {
        setConnGate('ready')
        return true
      }
      setConnGate(
        state?.status === 'connecting' || state?.status === 'reconnecting'
          ? 'connecting'
          : 'need-connect'
      )
      return false
    } catch {
      setConnGate('need-connect')
      return false
    }
  }, [targetId])

  const connectAndList = useCallback(async () => {
    setConnGate('connecting')
    try {
      await window.api.ssh.connect({ targetId })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
    const ok = await ensureConnected()
    if (ok) {
      await listDir('~')
    }
  }, [targetId, ensureConnected, listDir])

  useEffect(() => {
    void (async () => {
      const ok = await ensureConnected()
      if (ok) {
        await listDir('~')
      }
    })()
  }, [ensureConnected, listDir])

  const selectedEntry = entries.find((e) => e.name === selectedName) ?? null

  const enter = useCallback(
    (entry: DirEntry) => {
      if (!entry.isDirectory) {
        setSelectedName(entry.name)
        return
      }
      setSelectedName(null)
      const next = joinRemotePath(resolvedPath || dirPath, entry.name)
      setDirPath(next)
      void listDir(next)
    },
    [resolvedPath, dirPath, listDir]
  )

  const goUp = useCallback(() => {
    setSelectedName(null)
    const next = parentRemotePath(resolvedPath || dirPath)
    setDirPath(next)
    void listDir(next)
  }, [resolvedPath, dirPath, listDir])

  // Why: fs:* mutation IPC reject calls whose captured connection generation is missing/stale,
  // so every transfer must carry a fresh expectation from ssh:getState.
  const captureExpectation = useCallback(async () => {
    const state = await window.api.ssh.getState({ targetId })
    const generation = state?.connectionGeneration
    if (generation === undefined) {
      throw new Error(
        translate(
          'auto.components.remote.RemoteFilesPane.notConnectedMutation',
          'Server is not connected — press Connect and try again.'
        )
      )
    }
    return {
      expectedExecutionHostId: `ssh:${targetId}` as const,
      expectedSshTargetId: targetId,
      expectedSshConnectionGeneration: generation
    }
  }, [targetId])

  const downloadEntry = useCallback(
    async (entry: DirEntry) => {
      const target = joinRemotePath(resolvedPath, entry.name)
      setBusyAction('download')
      try {
        const expectation = await captureExpectation()
        const result = entry.isDirectory
          ? await window.api.fs.downloadFolder({
              dirPath: target,
              connectionId: targetId,
              ...expectation
            })
          : await window.api.fs.downloadFile({
              filePath: target,
              connectionId: targetId,
              ...expectation
            })
        if (!result.canceled) {
          toast.success(
            translate(
              'auto.components.remote.RemoteFilesPane.downloaded',
              'Downloaded to {{path}}',
              {
                path: result.destinationPath
              }
            )
          )
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setBusyAction(null)
      }
    },
    [resolvedPath, targetId, captureExpectation]
  )

  const downloadSelected = useCallback(async () => {
    if (!selectedEntry) {
      return
    }
    await downloadEntry(selectedEntry)
  }, [selectedEntry, downloadEntry])

  const uploadPicked = useCallback(
    async (mode: 'file' | 'directory') => {
      const picked = await window.api.remoteFiles.pickLocalPaths({ mode })
      if (!picked || picked.length === 0) {
        return
      }
      setBusyAction(`upload-${mode}`)
      try {
        const expectation = await captureExpectation()
        const result = await window.api.fs.importExternalPaths({
          sourcePaths: picked,
          destDir: resolvedPath || dirPath,
          connectionId: targetId,
          ...expectation
        })
        const imported = result.results.filter((r) => r.status === 'imported').length
        const failed = result.results.filter((r) => r.status === 'failed')
        if (failed.length > 0) {
          toast.error(
            translate(
              'auto.components.remote.RemoteFilesPane.uploadPartial',
              '{{done}} uploaded, {{failed}} failed',
              { done: imported, failed: failed.length }
            )
          )
        } else {
          toast.success(
            translate(
              'auto.components.remote.RemoteFilesPane.uploaded',
              'Uploaded {{count}} item{{plural}}',
              { count: imported, plural: imported === 1 ? '' : 's' }
            )
          )
        }
        await listDir(resolvedPath || dirPath)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setBusyAction(null)
      }
    },
    [resolvedPath, dirPath, targetId, listDir, captureExpectation]
  )

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Path bar */}
      <div className="flex items-center gap-1 border-b border-border/50 px-3 py-2">
        <Button variant="ghost" size="icon" onClick={goUp} disabled={loading} title="parent">
          <FolderUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setDirPath('~')
            void listDir('~')
          }}
          disabled={loading}
          title="home"
        >
          <ArrowUp className="size-4 rotate-180" />
        </Button>
        <input
          value={dirPath}
          onChange={(e) => setDirPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void listDir(dirPath)
            }
          }}
          spellCheck={false}
          className="h-8 min-w-0 flex-1 rounded-md border border-border/60 bg-transparent px-2 font-mono text-xs"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void listDir(dirPath)}
          disabled={loading}
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void downloadSelected()}
          disabled={!selectedEntry || busyAction !== null}
        >
          <Download className="size-3.5" />
          {translate('auto.components.remote.RemoteFilesPane.download', 'Download')}
        </Button>
        <div className="flex-1" />
        {onOpenTerminalHere ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenTerminalHere(resolvedPath || dirPath)}
            disabled={connGate !== 'ready'}
          >
            <SquareTerminal className="size-3.5" />
            {translate('auto.components.remote.RemoteFilesPane.terminalHere', 'Terminal here')}
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void uploadPicked('file')}
          disabled={busyAction !== null}
        >
          <Upload className="size-3.5" />
          {translate('auto.components.remote.RemoteFilesPane.uploadFiles', 'Upload files…')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void uploadPicked('directory')}
          disabled={busyAction !== null}
        >
          <Upload className="size-3.5" />
          {translate('auto.components.remote.RemoteFilesPane.uploadFolder', 'Upload folder…')}
        </Button>
      </div>

      {/* Listing */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {connGate !== 'ready' ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
            {connGate === 'connecting' || connGate === 'checking' ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <>
                <p className="max-w-xs text-sm">
                  {translate(
                    'auto.components.remote.RemoteFilesPane.notConnected',
                    'This server is not connected yet. Connect to browse its files.'
                  )}
                </p>
                <Button variant="outline" size="sm" onClick={() => void connectAndList()}>
                  {translate('auto.components.remote.RemoteFilesPane.connect', 'Connect')}
                </Button>
              </>
            )}
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : error !== null ? (
          <div className="p-4 text-sm text-destructive">{error}</div>
        ) : entries.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {translate('auto.components.remote.RemoteFilesPane.empty', 'Empty directory')}
          </div>
        ) : (
          <ul className="space-y-0.5">
            <RemoteFileEntries
              entries={entries}
              parentPath={resolvedPath || dirPath}
              selectedName={selectedName}
              onSelect={enter}
              onDownload={(entry) => void downloadEntry(entry)}
              onOpenFile={onOpenFile}
            />
          </ul>
        )}
      </div>

      {/* Status bar */}
      <div className="border-t border-border/50 px-3 py-1.5 text-xs text-muted-foreground">
        {resolvedPath || dirPath}
        {busyAction !== null ? (
          <span className="ml-2 inline-flex items-center gap-1">
            <LoaderCircle className="size-3 animate-spin" />
            {translate('auto.components.remote.RemoteFilesPane.working', 'Working…')}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function joinRemotePath(base: string, name: string): string {
  if (base.endsWith('/')) {
    return `${base}${name}`
  }
  return `${base}/${name}`
}

function parentRemotePath(path: string): string {
  if (path === '~' || path === '/' || path === '') {
    return '~'
  }
  const stripped = path.replace(/\/+$/, '')
  const idx = stripped.lastIndexOf('/')
  if (idx <= 0) {
    return idx === 0 ? '/' : '~'
  }
  return stripped.slice(0, idx)
}

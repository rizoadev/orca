import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import '@xterm/xterm/css/xterm.css'
import type { SshTarget } from '../../../../shared/ssh-types'
import { buildFontFamily } from '../terminal-pane/layout-serialization'
import { resolveEffectiveTerminalAppearance } from '@/lib/terminal-theme'

type RemoteShellPaneProps = {
  target: SshTarget
  /** When the nonce changes, runs `cd` into the live shell (used by the integrated files terminal). */
  cdRequest?: { path: string; nonce: number } | null
}

/** Single-quote against remote shell interpretation; safe for spaces, $, globs. */
function shellQuotePosixPath(path: string): string {
  return `'${path.replace(/'/g, "'\\''")}'`
}

/** Interactive SSH shell for one server. Owns exactly one remoteShell session;
 *  respawn (Connect button) replaces it. */
export function RemoteShellPane({ target, cdRequest }: RemoteShellPaneProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sessionRef = useRef<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'open' | 'exited'>('idle')

  const writeChunk = useCallback((chunkBase64: string): void => {
    // Why: guard after dispose — in-flight IPC data can arrive post-unmount.
    terminalRef.current?.write(decodeBase64(chunkBase64))
  }, [])

  const spawnSession = useCallback(() => {
    if (sessionRef.current) {
      void window.api.remoteShell.kill({ shellSessionId: sessionRef.current })
      sessionRef.current = null
    }
    setStatus('connecting')
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }
    terminal.reset()
    void window.api.remoteShell
      .spawn({
        targetId: target.id,
        cols: terminal.cols,
        rows: terminal.rows
      })
      .then((result) => {
        if (!result.ok) {
          terminal.write(`\r\n\x1b[31m${result.error}\x1b[0m\r\n`)
          setStatus('exited')
          return
        }
        sessionRef.current = result.shellSessionId
        setStatus('open')
      })
      .catch((error: unknown) => {
        terminal.write(
          `\r\n\x1b[31m${error instanceof Error ? error.message : String(error)}\x1b[0m\r\n`
        )
        setStatus('exited')
      })
  }, [target.id])

  // Why: mount-once effect — xterm instances are expensive and the pane is keyed by target upstream.
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const settings = useAppStore.getState().settings
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const appearance = settings
      ? resolveEffectiveTerminalAppearance(settings, systemPrefersDark)
      : null
    const terminal = new Terminal({
      fontSize: settings?.terminalFontSize ?? 13,
      fontFamily: buildFontFamily(settings?.terminalFontFamily ?? 'monospace'),
      cursorBlink: true,
      theme: appearance?.theme ?? undefined,
      scrollback: 5000
    })
    terminalRef.current = terminal
    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)
    terminal.open(container)
    try {
      fitAddon.fit()
    } catch {
      // Container may be zero-sized during layout; the resize observer refits.
    }

    const offData = window.api.remoteShell.onData((data) => {
      if (data.shellSessionId === sessionRef.current) {
        writeChunk(data.chunkBase64)
      }
    })
    const offExit = window.api.remoteShell.onExit((exitEvent) => {
      if (exitEvent.shellSessionId !== sessionRef.current) {
        return
      }
      sessionRef.current = null
      setStatus('exited')
      terminal.write(
        `\r\n\x1b[2m${translate(
          'auto.components.remote.RemoteShellPane.closed',
          'Session closed.'
        )}\x1b[0m\r\n`
      )
    })

    const inputDisposable = terminal.onData((data) => {
      if (sessionRef.current) {
        void window.api.remoteShell.input({ shellSessionId: sessionRef.current, data })
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
      } catch {
        return
      }
      if (sessionRef.current) {
        void window.api.remoteShell.resize({
          shellSessionId: sessionRef.current,
          cols: terminal.cols,
          rows: terminal.rows
        })
      }
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      inputDisposable.dispose()
      offData()
      offExit()
      if (sessionRef.current) {
        void window.api.remoteShell.kill({ shellSessionId: sessionRef.current })
        sessionRef.current = null
      }
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [target.id])

  // Auto-connect on first show for the selected server.
  const autoConnectedRef = useRef(false)
  useEffect(() => {
    if (autoConnectedRef.current) {
      return
    }
    autoConnectedRef.current = true
    spawnSession()
  }, [spawnSession])

  // Why: only fire per explicit request — comparing nonces keeps re-renders from re-sending the cd.
  const lastCdNonceRef = useRef(0)
  useEffect(() => {
    if (!cdRequest || cdRequest.nonce === lastCdNonceRef.current) {
      return
    }
    lastCdNonceRef.current = cdRequest.nonce
    const sessionId = sessionRef.current
    if (!sessionId) {
      return
    }
    void window.api.remoteShell.input({
      shellSessionId: sessionId,
      data: `cd -- ${shellQuotePosixPath(cdRequest.path)}\n`
    })
  }, [cdRequest])

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{target.label}</span>
          <span className="text-xs text-muted-foreground">
            {status === 'open'
              ? translate('auto.components.remote.RemoteShellPane.connected', 'connected')
              : status === 'connecting'
                ? translate('auto.components.remote.RemoteShellPane.connecting', 'connecting…')
                : status === 'exited'
                  ? translate('auto.components.remote.RemoteShellPane.exited', 'disconnected')
                  : ''}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={spawnSession}>
          {status === 'open'
            ? translate('auto.components.remote.RemoteShellPane.reconnect', 'Reconnect')
            : translate('auto.components.remote.RemoteShellPane.connect', 'Connect')}
        </Button>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden p-2" tabIndex={0} />
    </div>
  )
}

function decodeBase64(base64: string): string {
  // Why: xterm writes UTF-16 strings; PTY chunks arrive base64-encoded to survive IPC intact.
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

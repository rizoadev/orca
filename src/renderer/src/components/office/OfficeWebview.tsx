import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ORCA_BROWSER_PARTITION } from '../../../../shared/constants'
import { getOrcaProfileBrowserDefaultPartition } from '../../../../shared/orca-profiles'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

const OFFICE_URL = 'https://pi-office.hanirizo.workers.dev/'
const OFFLINE_RETRY_MS = 5000

// Minimal screen office: just embed the Cloudflare Worker URL directly.
// No bridge, no config resolution, no health probes.
export function OfficeWebview(): React.JSX.Element {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'offline'>('loading')
  const [loadKey, setLoadKey] = useState(0)
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  // Why: will-attach-webview is fail-closed against the browser-session registry, whose
  // default partition is per Orca profile — a hardcoded 'persist:orca-browser' is denied
  // for any non-default profile and leaves the office blank.
  const activeOrcaProfileId = useAppStore((s) => s.activeOrcaProfileId)
  const guestPartition = activeOrcaProfileId
    ? getOrcaProfileBrowserDefaultPartition(activeOrcaProfileId)
    : ORCA_BROWSER_PARTITION

  useEffect(() => {
    setPhase('ready')
  }, [])

  useEffect(() => {
    if (phase !== 'offline') {
      return
    }
    const timer = setInterval(() => {
      setPhase('ready')
      setLoadKey((value) => value + 1)
    }, OFFLINE_RETRY_MS)
    return () => clearInterval(timer)
  }, [phase])

  const handleRef = useCallback((node: Electron.WebviewTag | null): void => {
    webviewRef.current = node
    if (!node) {
      return
    }
    // Why: unlike partition, allowpopups is a live observed attribute React won't apply
    // for a boolean prop on a custom element, so it is set here after the guest exists.
    node.setAttribute('allowpopups', '')
    node.addEventListener('did-fail-load', (event) => {
      const detail = event as unknown as {
        errorCode?: number
        validatedURL?: string
        isMainFrame?: boolean
      }
      if (detail.isMainFrame === false || detail.errorCode === -3) {
        return
      }
      if (detail.validatedURL?.startsWith('http')) {
        setPhase('offline')
      }
    })
  }, [])

  const retryNow = useCallback((): void => {
    setPhase('ready')
    setLoadKey((value) => value + 1)
  }, [])

  if (phase === 'offline') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">
          {translate('auto.components.office.offline.title', 'Office hub is not reachable.')}
        </p>
        <p className="max-w-md">
          {translate(
            'auto.components.office.offline.cloudHint',
            'The office at {url} is not reachable. Check your network or the Cloudflare deployment — this view retries automatically.',
            { url: OFFICE_URL }
          )}
        </p>
        <Button variant="secondary" size="sm" onClick={retryNow}>
          {translate('auto.components.office.retry', 'Retry now')}
        </Button>
      </div>
    )
  }

  // Why: Electron freezes a <webview>'s partition when the guest is created, i.e. on DOM
  // insertion — setting it from a ref callback arrives after will-attach-webview already
  // read an empty partition, the fail-closed policy denies the guest, and the office shows
  // a blank panel. It must therefore be a JSX attribute, applied while React still holds the
  // element detached; the key remounts on profile switch because a live guest can't change
  // partition.
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
      <webview
        key={`${loadKey}|${guestPartition}`}
        ref={handleRef}
        src={OFFICE_URL}
        partition={guestPartition}
        style={{ flex: 1, width: '100%', height: '100%', border: 'none', display: 'flex' }}
      />
    </div>
  )
}

export default OfficeWebview

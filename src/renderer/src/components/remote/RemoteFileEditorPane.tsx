import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, LoaderCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

type RemoteFileEditorPaneProps = {
  targetId: string
  filePath: string
  onClose: () => void
}

const isMac = navigator.userAgent.includes('Mac')

/** Right-split editor for one remote file over the SSH filesystem provider. */
export function RemoteFileEditorPane({
  targetId,
  filePath,
  onClose
}: RemoteFileEditorPaneProps): React.JSX.Element {
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadNonceRef = useRef(0)

  const dirty = content !== savedContent

  const load = useCallback(async () => {
    const nonce = ++loadNonceRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.remoteFiles.readFile({ targetId, filePath })
      if (nonce !== loadNonceRef.current) {
        return
      }
      if (result.isBinary) {
        setError(
          translate(
            'auto.components.remote.RemoteFileEditorPane.binary',
            'Binary file — cannot be edited as text.'
          )
        )
      }
      setContent(result.content)
      setSavedContent(result.content)
    } catch (err) {
      if (nonce === loadNonceRef.current) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      if (nonce === loadNonceRef.current) {
        setLoading(false)
      }
    }
  }, [targetId, filePath])

  useEffect(() => {
    void load()
  }, [load])

  const save = useCallback(async () => {
    if (saving || loading || error !== null) {
      return
    }
    setSaving(true)
    try {
      await window.api.remoteFiles.writeFile({ targetId, filePath, content })
      setSavedContent(content)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [targetId, filePath, content, saving, loading, error])

  // Why: platform-aware save shortcut (CmdOrCtrl+S), matching AGENTS cross-platform rules.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const modifier = isMac ? event.metaKey : event.ctrlKey
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save])

  const bytes = new TextEncoder().encode(content).length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{filePath}</span>
        {dirty ? (
          <span className="shrink-0 text-xs text-amber-500">
            {translate('auto.components.remote.RemoteFileEditorPane.unsaved', 'unsaved')}
          </span>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          {translate('auto.components.remote.RemoteFileEditorPane.save', 'Save')}
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose} title="close">
          <X className="size-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" />
        </div>
      ) : error !== null ? (
        <div className="flex-1 overflow-y-auto p-4 text-sm text-destructive">
          {error}
          {!error.includes('Binary') && !error.includes('too large') ? (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              {translate('auto.components.remote.RemoteFileEditorPane.retry', 'Retry')}
            </Button>
          ) : null}
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-[13px] leading-relaxed outline-none"
        />
      )}

      <div className="flex items-center gap-3 border-t border-border/50 px-3 py-1 text-xs text-muted-foreground">
        <span>{bytes.toLocaleString()} B</span>
        <span>UTF-8</span>
        <span className="ml-auto">{isMac ? '⌘S' : 'Ctrl+S'}</span>
      </div>
    </div>
  )
}

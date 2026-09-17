import React from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { KeyRound } from 'lucide-react'
import type { VoiceCallProvider } from '../../../../shared/voice-call-types'

export function VoiceCallApiKeySetup({
  keyStatus,
  currentKeyOk,
  provider,
  keyEntryTarget,
  keyInput,
  onKeyInput,
  onKeyEntryTarget,
  onSaveKey,
  onProviderChange
}: {
  keyStatus: { gemini: boolean; openai: boolean } | null
  currentKeyOk: boolean
  provider: VoiceCallProvider
  keyEntryTarget: VoiceCallProvider
  keyInput: string
  onKeyInput: (val: string) => void
  onKeyEntryTarget: (target: VoiceCallProvider) => void
  onSaveKey: () => void
  onProviderChange: (p: VoiceCallProvider) => void
}): React.JSX.Element | null {
  if (keyStatus && !keyStatus.gemini && !keyStatus.openai) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <KeyRound className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Masukkan API key untuk mengaktifkan Voice Call. Pilih provider:
        </p>
        <div className="flex gap-2">
          {(['gemini', 'openai'] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={keyEntryTarget === p ? 'default' : 'outline'}
              onClick={() => {
                onKeyEntryTarget(p)
                onKeyInput('')
              }}
            >
              {p === 'gemini' ? 'Gemini' : 'OpenAI'}
            </Button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {keyEntryTarget === 'gemini'
            ? 'Dari Google AI Studio (AIza…). Key disimpan terenkripsi di ~/.orca/.'
            : 'Dari platform.openai.com (sk-…). Key disimpan terenkripsi di ~/.orca/.'}
        </p>
        <div className="flex w-full max-w-sm items-center gap-2">
          <Input
            type="password"
            value={keyInput}
            onChange={(e) => onKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                onSaveKey()
              }
            }}
            placeholder={keyEntryTarget === 'gemini' ? 'AIza…' : 'sk-…'}
            className="h-8 text-xs"
          />
          <Button size="sm" onClick={onSaveKey} disabled={!keyInput.trim()}>
            Simpan
          </Button>
        </div>
      </div>
    )
  }

  if (keyStatus && !currentKeyOk) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <KeyRound className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {provider === 'openai' ? 'OpenAI' : 'Gemini'} API key belum dikonfigurasi.
        </p>
        <div className="flex w-full max-w-sm items-center gap-2">
          <Input
            type="password"
            value={keyInput}
            onChange={(e) => onKeyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                onSaveKey()
              }
            }}
            placeholder={provider === 'openai' ? 'sk-…' : 'AIza…'}
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            onClick={() => {
              onKeyEntryTarget(provider)
              onSaveKey()
            }}
            disabled={!keyInput.trim()}
          >
            Simpan
          </Button>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="mt-1 text-[11px]"
          onClick={() => {
            onProviderChange(provider === 'gemini' ? 'openai' : 'gemini')
          }}
        >
          Gunakan {provider === 'gemini' ? 'OpenAI' : 'Gemini'} yang sudah ada →
        </Button>
      </div>
    )
  }

  return null
}

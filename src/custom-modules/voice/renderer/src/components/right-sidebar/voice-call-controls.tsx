import React from 'react'
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Terminal,
  Key,
  Trash2,
  Sparkles,
  Volume2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { VoiceCallStatus } from '../../../../../../shared/voice-call-types'

type ControlsProps = {
  status: VoiceCallStatus
  isConnected: boolean
  micListening: boolean
  micLevel: number
  apiKeyConfigured: boolean | null
  maskedKey: string
  apiKeyInput: string
  showKeySetup: boolean
  autoSendToTerminal: boolean
  autoSpeakPiResponse: boolean
  activePtyId?: string
  hasTranscript: boolean
  errorMessage?: string | null
  onToggleKeySetup: () => void
  onApiKeyInputChange: (val: string) => void
  onSaveKey: () => void
  onToggleCall: () => void
  onClearTranscript: () => void
  onToggleAutoSend: (val: boolean) => void
  onToggleAutoSpeak: (val: boolean) => void
}

export function VoiceCallControls({
  status,
  isConnected,
  micListening,
  micLevel,
  apiKeyConfigured,
  maskedKey,
  apiKeyInput,
  showKeySetup,
  autoSendToTerminal,
  autoSpeakPiResponse,
  activePtyId,
  hasTranscript,
  errorMessage,
  onToggleKeySetup,
  onApiKeyInputChange,
  onSaveKey,
  onToggleCall,
  onClearTranscript,
  onToggleAutoSend,
  onToggleAutoSpeak
}: ControlsProps): React.JSX.Element {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span className="text-sm font-medium">Google Voice (Pi Standby)</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title={maskedKey ? `API Key: ${maskedKey}` : 'Setup API Key'}
            onClick={onToggleKeySetup}
          >
            <Key className={`size-3.5 ${apiKeyConfigured ? 'text-primary' : 'text-amber-500'}`} />
          </Button>
          {hasTranscript && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="Bersihkan riwayat"
              onClick={onClearTranscript}
            >
              <Trash2 className="size-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      {/* Error Alert Banner */}
      {errorMessage && (
        <div className="border-b border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive space-y-1">
          <p className="font-semibold text-destructive">Koneksi Gagal</p>
          <p className="text-[11px] leading-relaxed opacity-90">{errorMessage}</p>
        </div>
      )}

      {/* API Key Form */}
      {(showKeySetup || apiKeyConfigured === false) && (
        <div className="border-b border-border bg-card/60 p-3 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-medium text-foreground">Google Gemini API Key</p>
            {maskedKey && (
              <span className="font-mono text-[11px] text-muted-foreground">{maskedKey}</span>
            )}
          </div>
          <p className="text-muted-foreground">
            Disimpan permanen via safeStorage (~/.orca). Berlaku untuk semua sesi Orca.
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder={maskedKey ? 'Masukkan key baru untuk mengganti…' : 'AIzaSy...'}
              value={apiKeyInput}
              onChange={(e) => onApiKeyInputChange(e.target.value)}
              className="h-8 text-xs"
            />
            <Button size="sm" className="h-8 text-xs" onClick={onSaveKey}>
              Simpan
            </Button>
          </div>
        </div>
      )}

      {/* Standby Buttons & VU */}
      <div className="border-b border-border p-3 space-y-3 bg-muted/20">
        <Button
          variant={isConnected ? 'destructive' : 'default'}
          className="w-full gap-2 font-medium"
          disabled={status === 'connecting'}
          onClick={onToggleCall}
        >
          {isConnected ? (
            <>
              <PhoneOff className="size-4" /> Matikan Standby
            </>
          ) : status === 'connecting' ? (
            'Menghubungkan…'
          ) : (
            <>
              <Phone className="size-4" /> Mulai Standby Voice
            </>
          )}
        </Button>

        {/* Status indicator */}
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <div className="flex items-center gap-2">
            <span
              className={`size-2 rounded-full ${
                isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40'
              }`}
            />
            <span>
              {status === 'listening'
                ? 'Standby mendengarkan…'
                : status === 'connecting'
                  ? 'Menghubungkan ke Gemini Live…'
                  : status === 'thinking'
                    ? 'Memproses ucapan…'
                    : status === 'speaking'
                      ? 'Gemini berbicara…'
                      : 'Standby mati'}
            </span>
          </div>

          {isConnected && (
            <div className="flex items-center gap-1.5">
              {micListening ? (
                <Mic className="size-3.5 text-emerald-500" />
              ) : (
                <MicOff className="size-3.5 text-muted-foreground" />
              )}
              <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-75"
                  style={{ width: `${Math.min(100, Math.round(micLevel * 100))}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Settings checkboxes */}
        <div className="rounded-md border border-border bg-card p-2.5 text-xs space-y-2">
          <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
            <input
              type="checkbox"
              checked={autoSendToTerminal}
              onChange={(e) => onToggleAutoSend(e.target.checked)}
              className="rounded border-border accent-primary"
            />
            <span>Auto-send ke Pi CLI di Main Window</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
            <input
              type="checkbox"
              checked={autoSpeakPiResponse}
              onChange={(e) => onToggleAutoSpeak(e.target.checked)}
              className="rounded border-border accent-primary"
            />
            <span className="flex items-center gap-1">
              <Volume2 className="size-3 text-primary" /> Auto-bacakan ringkasan respon Pi
            </span>
          </label>

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-0.5 border-t border-border/50">
            <Terminal className="size-3" />
            <span>
              Target:{' '}
              <strong className="text-foreground">
                {activePtyId ? `PTY (${activePtyId.slice(0, 8)})` : 'Tidak ada terminal aktif'}
              </strong>
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

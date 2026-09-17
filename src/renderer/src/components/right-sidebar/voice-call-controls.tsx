import { TerminalSquare, Volume2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import type { PiModelOption } from '../../../../shared/pi-issue-chat-types'
import type { VoiceCallProvider } from '../../../../shared/voice-call-types'

// Gemini Live prebuilt voices
const GEMINI_VOICES = [
  'Leda',
  'Aoede',
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Orus',
  'Enceladus',
  'Iapetus',
  'Umbriel'
]

// OpenAI Realtime prebuilt voices
const OPENAI_VOICES = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer'
]

function voiceOptions(provider: VoiceCallProvider): string[] {
  return provider === 'openai' ? OPENAI_VOICES : GEMINI_VOICES
}

/**
 * Header control cluster for the voice-call panel: provider switcher, voice,
 * Pi coding model, coding-mode toggle, and playback rate.
 */
export function VoiceCallControls({
  provider,
  onProvider,
  voice,
  onVoice,
  piModel,
  onPiModel,
  piModels,
  codingMode,
  onCodingMode,
  rate,
  onRate
}: {
  provider: VoiceCallProvider
  onProvider: (p: VoiceCallProvider) => void
  voice: string
  onVoice: (value: string) => void
  piModel: string
  onPiModel: (value: string) => void
  piModels: PiModelOption[]
  codingMode: boolean
  onCodingMode: () => void
  rate: number
  onRate: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      {/* Provider toggle */}
      <div className="flex overflow-hidden rounded border border-border">
        <button
          className={`px-1.5 py-0.5 text-[10px] transition-colors ${
            provider === 'gemini'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent'
          }`}
          onClick={() => onProvider('gemini')}
        >
          Gemini
        </button>
        <button
          className={`px-1.5 py-0.5 text-[10px] transition-colors ${
            provider === 'openai'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent'
          }`}
          onClick={() => onProvider('openai')}
        >
          OpenAI
        </button>
      </div>
      {/* Voice selector */}
      <select
        value={voice}
        onChange={(e) => onVoice(e.target.value)}
        aria-label={`${provider === 'openai' ? 'OpenAI' : 'Gemini'} voice`}
        className="h-6 rounded border border-border bg-transparent px-1 text-[10px] text-muted-foreground focus:outline-none"
      >
        {voiceOptions(provider).map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      <select
        value={piModel}
        onChange={(e) => onPiModel(e.target.value)}
        aria-label="Pi SDK model"
        title="Model Pi SDK untuk coding task"
        className="h-6 max-w-[8rem] truncate rounded border border-border bg-transparent px-1 text-[10px] text-muted-foreground focus:outline-none"
      >
        <option value="">Pi: default</option>
        {piModels.map((m) => (
          <option key={m.ref} value={m.ref}>
            {m.name}
          </option>
        ))}
      </select>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant={codingMode ? 'default' : 'ghost'}
            className="h-6 w-6"
            onClick={onCodingMode}
          >
            <TerminalSquare className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {codingMode ? 'Coding mode: ON (Pi SDK)' : 'Coding mode: OFF (chat saja)'}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onRate}>
            <Volume2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Kecepatan bicara: {rate.toFixed(1)}×</TooltipContent>
      </Tooltip>
    </div>
  )
}

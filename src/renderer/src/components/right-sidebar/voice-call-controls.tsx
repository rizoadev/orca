import { TerminalSquare, Volume2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import type { PiModelOption } from '../../../../shared/pi-issue-chat-types'

// Gemini Live prebuilt voices; Leda is the house default (matches the harness).
const VOICE_OPTIONS = [
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

/**
 * Header control cluster for the voice-call panel: Gemini voice, Pi coding
 * model, coding-mode toggle, and playback rate. Extracted so the panel keeps
 * its budget and the controls stay a single cohesive unit.
 */
export function VoiceCallControls({
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
      <select
        value={voice}
        onChange={(e) => onVoice(e.target.value)}
        aria-label="Gemini voice"
        className="h-6 rounded border border-border bg-transparent px-1 text-[10px] text-muted-foreground focus:outline-none"
      >
        {VOICE_OPTIONS.map((v) => (
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

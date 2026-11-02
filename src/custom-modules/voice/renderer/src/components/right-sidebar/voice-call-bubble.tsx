import React from 'react'
import { CheckCircle2, Terminal, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type TranscriptEntry = {
  id: string
  role: 'user' | 'gemini' | 'pi'
  text: string
  sentToPty?: boolean
  timestamp: string
}

type Props = {
  item: TranscriptEntry
  onResendToPty?: (text: string) => void
  onSpeakText?: (text: string) => void
}

export function VoiceCallBubble({
  item,
  onResendToPty,
  onSpeakText
}: Props): React.JSX.Element {
  if (item.role === 'user') {
    return (
      <div className="ml-4 rounded-xl bg-primary/15 p-2.5 text-foreground space-y-1">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
          <span>Anda</span>
          <span>{item.timestamp}</span>
        </div>
        <p className="text-xs leading-normal whitespace-pre-wrap">{item.text}</p>
        <div className="pt-1 flex items-center justify-between text-[10px]">
          {item.sentToPty ? (
            <span className="flex items-center gap-1 text-emerald-500 font-medium">
              <CheckCircle2 className="size-3" /> Dikirim ke Pi CLI
            </span>
          ) : (
            <span className="text-muted-foreground">Prompt suara</span>
          )}
          {onResendToPty && (
            <button
              type="button"
              className="text-primary hover:underline font-medium"
              onClick={() => onResendToPty(item.text)}
            >
              Kirim ulang
            </button>
          )}
        </div>
      </div>
    )
  }

  if (item.role === 'pi') {
    return (
      <div className="mr-3 rounded-xl bg-emerald-500/10 p-2.5 text-foreground space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
          <span className="flex items-center gap-1">
            <Terminal className="size-3" /> Respon Pi CLI
          </span>
          <span className="text-muted-foreground font-normal">{item.timestamp}</span>
        </div>
        <p className="text-xs leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto font-mono text-[11px] bg-background/50 rounded-lg p-2">
          {item.text}
        </p>
        {onSpeakText && (
          <div className="flex justify-end pt-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] gap-1 text-primary hover:bg-primary/10"
              onClick={() => onSpeakText(item.text)}
            >
              <Volume2 className="size-3" />
              Bacakan Ringkasan
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mr-4 rounded-xl bg-muted/70 p-2.5 text-foreground space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
        <span className="flex items-center gap-1">
          <Volume2 className="size-3 text-primary" /> Gemini
        </span>
        <span>{item.timestamp}</span>
      </div>
      <p className="text-xs leading-normal whitespace-pre-wrap">{item.text}</p>
    </div>
  )
}

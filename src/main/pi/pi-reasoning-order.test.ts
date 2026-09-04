import { describe, expect, it } from 'vitest'
import {
  applyAssistantTextStream,
  applyThinkingDelta,
  type AssistantTextStreamState
} from './pi-reasoning-stream'
import { upsertPiMessage } from '../../renderer/src/components/right-sidebar/pi-chat-reduce'
import type { PiIssueChatEvent, PiIssueChatMessage } from '../../shared/pi-issue-chat-types'

function turnState(): AssistantTextStreamState {
  return {
    currentReasoningId: null,
    currentReasoningContent: '',
    currentReasoningEmitted: false,
    currentAssistantId: 'A1',
    currentAssistantContent: '',
    currentAssistantRaw: '',
    currentAssistantEmitted: false
  }
}

function roles(list: PiIssueChatMessage[]): string[] {
  return list.map((m) => m.role)
}

describe('reasoning/assistant ordering through the panel reducer', () => {
  it('keeps reasoning above the assistant when the model emits answer text before thinking', () => {
    const state = turnState()
    const backend: PiIssueChatMessage[] = []
    const events: PiIssueChatEvent[] = []
    const emit = (e: PiIssueChatEvent) => events.push(e)

    // Model streams a short answer first (creates assistant A1)...
    applyAssistantTextStream(state, backend, 'Let me check the code.', 's1', emit)
    // ...then emits native thinking for the next step (creates reasoning R1).
    applyThinkingDelta(state, backend, 'plan: read file', 's1', emit, state.currentAssistantId)

    // Backend array must keep reasoning above the assistant.
    expect(roles(backend)).toEqual(['reasoning', 'assistant'])

    // Replay the emitted events through the panel reducer (append-on-new).
    let panel: PiIssueChatMessage[] = []
    for (const ev of events) {
      if (ev.type === 'message') {
        panel = upsertPiMessage(panel, ev.message)
      }
    }
    // The panel must render in the SAME order as the backend, not emit order.
    expect(roles(panel)).toEqual(['reasoning', 'assistant'])
  })
})

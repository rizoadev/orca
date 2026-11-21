export type PiIssueChatStatus = 'idle' | 'running' | 'error'

export type PiIssueChatMessage = {
  id?: string
  role: 'user' | 'assistant' | 'system' | 'tool' | 'reasoning'
  content: string
  toolName?: string
}

export type PiModelOption = {
  ref: string
  provider: string
  modelId: string
  name: string
  contextWindow: number
}

export type PiSessionInfo = {
  path: string
  isActive: boolean
  firstMessage: string | null
  createdAt: number
}

export type PiIssueChatSessionSnapshot = {
  sessionId: string
  messages: PiIssueChatMessage[]
  status: PiIssueChatStatus
  error?: string | null
  provider?: string
  modelId?: string
}

export type PiIssueChatEvent =
  | { type: 'snapshot'; session: PiIssueChatSessionSnapshot }
  | { type: 'message'; sessionId: string; message: PiIssueChatMessage }
  | { type: 'assistantDelta'; sessionId: string; messageId: string; delta: string }
  | { type: 'reasoningDelta'; sessionId: string; messageId: string; delta: string }
  | { type: 'status'; sessionId: string; status: PiIssueChatStatus; error?: string | null }

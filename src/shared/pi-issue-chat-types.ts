/** Wire types for the issue-modal pi chat (in-process AgentSession, not terminal native-chat). */

export type PiIssueChatRole = 'user' | 'assistant' | 'tool' | 'system'

export type PiIssueChatMessage = {
  id: string
  role: PiIssueChatRole
  content: string
  createdAt: number
  /** Tool name when role is 'tool'. */
  toolName?: string
}

export type PiIssueChatStatus = 'idle' | 'running' | 'error'

export type PiIssueChatSessionSnapshot = {
  sessionId: string
  status: PiIssueChatStatus
  messages: PiIssueChatMessage[]
  error?: string
  modelId?: string
  provider?: string
  cwd?: string
}

export type PiIssueChatStartArgs = {
  sessionId: string
  cwd: string
  /** Injected once as system context (issue title/body). */
  issueContext: string
  /** Optional explicit model ref matching a key in ~/.pi/agent/models.json,
   *  e.g. "localhost/cb/kimi-k3". Falls back to pi's own model selection. */
  modelRef?: string
}

export type PiIssueChatSendArgs = {
  sessionId: string
  text: string
}

export type PiIssueChatEvent =
  | { type: 'snapshot'; session: PiIssueChatSessionSnapshot }
  | { type: 'message'; sessionId: string; message: PiIssueChatMessage }
  | { type: 'assistantDelta'; sessionId: string; messageId: string; delta: string }
  | { type: 'status'; sessionId: string; status: PiIssueChatStatus; error?: string }
  | { type: 'tool'; sessionId: string; toolName: string; messageId: string }

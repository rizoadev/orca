/** Wire types for the issue-modal pi chat (in-process AgentSession, not terminal native-chat). */

export type PiIssueChatRole = 'user' | 'assistant' | 'tool' | 'system' | 'reasoning'

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
  /** Optional explicit model ref e.g. "localhost/cb/kimi-k3". */
  modelRef?: string
  /** Session mode: continue latest (default), start new, or open specific file. */
  sessionMode?: 'continue' | 'new' | { type: 'open'; path: string }
}

export type PiIssueChatSendArgs = {
  sessionId: string
  text: string
}

export type PiIssueChatSetModelArgs = {
  sessionId: string
  modelRef: string
}

/** A model entry from ~/.pi/agent/models.json */
export type PiModelOption = {
  /** Full reference: "providerName/modelId" */
  ref: string
  provider: string
  modelId: string
  name: string
  contextWindow: number
  maxTokens: number
}

/** A persisted session file entry for an issue. */
export type PiSessionInfo = {
  path: string
  id: string
  firstMessage: string
  /** Epoch ms from file mtime */
  createdAt: number
  /** Whether this is the currently active session */
  isActive: boolean
}

export type PiIssueChatEvent =
  | { type: 'snapshot'; session: PiIssueChatSessionSnapshot }
  | { type: 'message'; sessionId: string; message: PiIssueChatMessage }
  | { type: 'assistantDelta'; sessionId: string; messageId: string; delta: string }
  | { type: 'reasoningDelta'; sessionId: string; messageId: string; delta: string }
  | { type: 'status'; sessionId: string; status: PiIssueChatStatus; error?: string }
  | { type: 'tool'; sessionId: string; toolName: string; messageId: string }

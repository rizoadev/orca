/**
 * Wire types for workspace-scoped Pi chat (Paseo-like, worktree-bound).
 * Shares the same Pi SDK backend as the issue chat but targets a worktree
 * cwd, supports multi-client streaming, and is routed via runtime RPC.
 */

export type PiChatRole = 'user' | 'assistant' | 'tool' | 'system'

export type PiChatMessage = {
  id: string
  role: PiChatRole
  content: string
  createdAt: number
  /** Tool name when role is 'tool'. */
  toolName?: string
}

export type PiChatStatus = 'idle' | 'running' | 'error'

export type PiChatSessionSnapshot = {
  sessionId: string
  worktreeId: string
  status: PiChatStatus
  messages: PiChatMessage[]
  error?: string
  modelId?: string
  provider?: string
  cwd?: string
}

export type PiChatSessionMode = 'continue' | 'new' | { type: 'open'; path: string }

export type PiChatStartArgs = {
  worktreeId: string
  sessionId: string
  /** Optional system prompt override. Defaults to a generic coding assistant
   *  prompt scoped to the worktree. */
  systemPrompt?: string
  /** Optional explicit model ref e.g. "localhost/cb/kimi-k3". */
  modelRef?: string
  /** Session mode: continue latest (default), start new, or open specific file. */
  sessionMode?: PiChatSessionMode
}

export type PiChatSendArgs = {
  sessionId: string
  worktreeId: string
  text: string
}

export type PiChatSetModelArgs = {
  worktreeId: string
  sessionId: string
  modelRef: string
}

// Why: workspace chat reuses the issue-chat model/session listing payloads
// verbatim; re-export from the existing single source instead of duplicating.
export type { PiModelOption, PiSessionInfo } from './pi-issue-chat-types'

export type PiChatEvent =
  | { type: 'snapshot'; session: PiChatSessionSnapshot }
  | { type: 'message'; sessionId: string; message: PiChatMessage }
  | { type: 'assistantDelta'; sessionId: string; messageId: string; delta: string }
  | { type: 'status'; sessionId: string; status: PiChatStatus; error?: string }
  | { type: 'tool'; sessionId: string; toolName: string; messageId: string }

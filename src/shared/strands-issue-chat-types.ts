/** Wire types for the issue-modal Strands chat (in-process agent, not terminal native-chat). */

export type StrandsIssueChatRole = 'user' | 'assistant' | 'system' | 'tool'

export type StrandsIssueChatMessage = {
  id: string
  role: StrandsIssueChatRole
  content: string
  createdAt: number
  /** Tool name when role is tool or an assistant tool-call notice. */
  toolName?: string
}

export type StrandsIssueChatStatus = 'idle' | 'running' | 'error'

export type StrandsIssueChatSessionSnapshot = {
  sessionId: string
  status: StrandsIssueChatStatus
  messages: StrandsIssueChatMessage[]
  error?: string
  provider?: string
  modelId?: string
  cwd?: string
}

export type StrandsIssueChatStartArgs = {
  sessionId: string
  cwd: string
  /** Injected once as system context (issue title/body). */
  issueContext: string
  provider?: 'anthropic' | 'openai' | 'bedrock'
  modelId?: string
  /** Env vars from agentDefaultEnv.strands, forwarded by the renderer so
   *  in-process sessions honour the same model config as terminal launches. */
  strandsEnv?: Record<string, string>
}

export type StrandsIssueChatSendArgs = {
  sessionId: string
  text: string
}

export type StrandsIssueChatEvent =
  | { type: 'snapshot'; session: StrandsIssueChatSessionSnapshot }
  | { type: 'message'; sessionId: string; message: StrandsIssueChatMessage }
  | {
      type: 'assistantDelta'
      sessionId: string
      messageId: string
      delta: string
    }
  | {
      type: 'status'
      sessionId: string
      status: StrandsIssueChatStatus
      error?: string
    }
  | { type: 'tool'; sessionId: string; toolName: string; messageId: string }

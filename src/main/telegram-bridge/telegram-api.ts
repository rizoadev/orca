import { net } from 'electron'

const TELEGRAM_API_BASE = 'https://api.telegram.org'

export type TelegramUser = {
  id: number
  is_bot?: boolean
  username?: string
  first_name?: string
}

export type TelegramChat = {
  id: number
  type: string
  title?: string
}

export type TelegramMessage = {
  message_id: number
  date: number
  text?: string
  caption?: string
  from?: TelegramUser
  chat: TelegramChat
  message_thread_id?: number
  is_topic_message?: boolean
}

export type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  channel_post?: TelegramMessage
}

type TelegramApiResponse<T> = {
  ok: boolean
  description?: string
  result?: T
}

async function callTelegramApi<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
  timeoutMs = 35_000
): Promise<T> {
  const url = `${TELEGRAM_API_BASE}/bot${token}/${method}`
  const response = await net.fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs)
  })
  const json = (await response.json()) as TelegramApiResponse<T>
  if (!response.ok || !json.ok || json.result === undefined) {
    throw new Error(json.description || `Telegram API ${method} failed (${response.status})`)
  }
  return json.result
}

export async function getTelegramMe(token: string): Promise<TelegramUser> {
  return callTelegramApi<TelegramUser>(token, 'getMe', undefined, 15_000)
}

export async function getTelegramUpdates(
  token: string,
  offset: number,
  timeoutSec = 25
): Promise<TelegramUpdate[]> {
  return callTelegramApi<TelegramUpdate[]>(
    token,
    'getUpdates',
    {
      offset,
      timeout: timeoutSec,
      allowed_updates: ['message']
    },
    (timeoutSec + 10) * 1000
  )
}

export async function sendTelegramMessage(params: {
  token: string
  chatId: number
  text: string
  messageThreadId?: number
}): Promise<TelegramMessage> {
  const body: Record<string, unknown> = {
    chat_id: params.chatId,
    text: params.text,
    disable_web_page_preview: true
  }
  if (typeof params.messageThreadId === 'number') {
    body.message_thread_id = params.messageThreadId
  }
  return callTelegramApi<TelegramMessage>(params.token, 'sendMessage', body, 15_000)
}

export type TelegramForumTopic = {
  message_thread_id: number
  name: string
  icon_color?: number
  icon_custom_emoji_id?: string
}

/** Requires the bot to be an admin with can_manage_topics in a forum supergroup. */
export async function createTelegramForumTopic(params: {
  token: string
  chatId: number
  name: string
}): Promise<TelegramForumTopic> {
  const name = params.name.trim().slice(0, 128)
  if (!name) {
    throw new Error('Topic name is required')
  }
  return callTelegramApi<TelegramForumTopic>(
    params.token,
    'createForumTopic',
    {
      chat_id: params.chatId,
      name
    },
    15_000
  )
}

export type TelegramChatAction =
  | 'typing'
  | 'upload_photo'
  | 'record_video'
  | 'upload_video'
  | 'record_voice'
  | 'upload_voice'
  | 'upload_document'
  | 'choose_sticker'
  | 'find_location'
  | 'record_video_note'
  | 'upload_video_note'

export async function sendTelegramChatAction(params: {
  token: string
  chatId: number
  action: TelegramChatAction
  messageThreadId?: number
}): Promise<boolean> {
  const body: Record<string, unknown> = {
    chat_id: params.chatId,
    action: params.action
  }
  if (typeof params.messageThreadId === 'number') {
    body.message_thread_id = params.messageThreadId
  }
  return callTelegramApi<boolean>(params.token, 'sendChatAction', body, 10_000)
}

export function extractInboundText(message: TelegramMessage): string | null {
  const text = (message.text ?? message.caption ?? '').trim()
  return text || null
}

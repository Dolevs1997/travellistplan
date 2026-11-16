import type Anthropic from '@anthropic-ai/sdk'

export type ChatMessage = Anthropic.Beta.BetaMessageParam
export type AssistantBlock = Anthropic.Beta.BetaContentBlock

export type ChatEvent =
  | { t: 'text'; v: string }
  | { t: 'status'; v: 'search' }
  | { t: 'final'; content: AssistantBlock[]; stop_reason: string | null }
  | { t: 'error'; v: string }

/** Thrown for answers the screen handles specially (no key configured, access code needed) */
export class ChatHttpError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

const CODE_KEY = 'trip-planner:chat-code'
export const getAccessCode = () => {
  try {
    return localStorage.getItem(CODE_KEY) ?? ''
  } catch {
    return ''
  }
}
export const setAccessCode = (code: string) => {
  try {
    localStorage.setItem(CODE_KEY, code)
  } catch {
    /* ignore */
  }
}

/** POST /api/chat and hand each streamed NDJSON event to `onEvent` */
export async function streamChat(
  messages: ChatMessage[],
  context: string,
  onEvent: (e: ChatEvent) => void,
  signal?: AbortSignal,
) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-chat-code': getAccessCode() },
    body: JSON.stringify({ messages, context }),
    signal,
  })
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ChatHttpError(data.error ?? `http_${res.status}`)
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    let nl: number
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) onEvent(JSON.parse(line) as ChatEvent)
    }
  }
}

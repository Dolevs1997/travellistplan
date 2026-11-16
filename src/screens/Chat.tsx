import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Check, Globe, LocateFixed, RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { IconButton, cx } from '../components/ui'
import { useTrip } from '../state/TripStore'
import { describeOp, parseProposal, parseQuestions, tripContext, type Proposal, type Question } from '../data/aiPlan'
import { ChatHttpError, setAccessCode, streamChat, type AssistantBlock, type ChatMessage } from '../data/chatClient'
import { href } from '../router'

/**
 * The trip assistant. Answers questions with web search (restaurants near you, lodging with prices and
 * reviews) and proposes changes to the trip, which are applied only after the user approves them here.
 */

const STORE_KEY = 'trip-planner:chat'
type Decision = 'approved' | 'rejected'
type Answers = Record<string, string>
interface Saved {
  messages: ChatMessage[]
  decisions: Record<string, Decision>
  /** Answers to the assistant's clarifying questions, by tool_use id */
  answers: Record<string, Answers>
}

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const s = JSON.parse(raw) as Saved
      if (Array.isArray(s.messages)) return { messages: s.messages, decisions: s.decisions ?? {}, answers: s.answers ?? {} }
    }
  } catch {
    /* ignore */
  }
  return { messages: [], decisions: {}, answers: {} }
}

const SUGGESTIONS = [
  'בנה לי טיול של 4 ימים ברומא עם המקומות הכי מומלצים',
  'מסעדות מומלצות קרוב אליי עכשיו',
  'מלון מומלץ לזוג, חדר אחד, במיקום מרכזי – עם מחירים וביקורות',
  'תסדר מחדש את יום 2 כך שיהיה פחות הליכה',
]

const ERRORS: Record<string, string> = {
  not_configured: 'העוזר עוד לא מחובר: צריך להוסיף מפתח Claude API בהגדרות האתר ב-Netlify (ANTHROPIC_API_KEY).',
  bad_key: 'מפתח ה-API שהוגדר לא תקין או חסום. בדקו אותו בהגדרות האתר ב-Netlify.',
  rate_limit: 'יותר מדי בקשות כרגע. נסו שוב בעוד דקה.',
  timeout: 'התשובה לקחה יותר מדי זמן. נסו לשאול שאלה ממוקדת יותר.',
  bad_request: 'משהו בשיחה לא תקין. נסו להתחיל שיחה חדשה.',
}
const isLocal = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
const errorText = (code: string) =>
  code === 'not_configured' && isLocal()
    ? 'העוזר עוד לא מחובר במחשב הזה: צריך ליצור קובץ ⁦.env.local⁩ בתיקיית הפרויקט עם השורה ⁦ANTHROPIC_API_KEY=…⁩ (המפתח שלכם מ-⁦platform.claude.com⁩) ולהפעיל מחדש את שרת הפיתוח.'
    : (ERRORS[code] ?? 'לא הצלחנו לקבל תשובה. נסו שוב.')

type ToolUse = Extract<AssistantBlock, { type: 'tool_use' }>
const isToolUse = (name: string) => (b: unknown): b is ToolUse =>
  !!b && (b as AssistantBlock).type === 'tool_use' && (b as { name?: string }).name === name
const isProposeUse = isToolUse('propose_trip_changes')
const isAskUse = isToolUse('ask_user_questions')

/** "question: answer" lines, sent to Claude as the tool result */
function answersText(input: unknown, answers: Answers) {
  const lines = parseQuestions(input).map((q) => `${q.question} ${answers[q.id]?.trim() || '(no answer)'}`)
  return `The user's answers:\n${lines.join('\n')}`
}

/** Tool results for the tool calls in the last assistant message: Claude must get one before the next message */
function pendingResults(messages: ChatMessage[], saved: Pick<Saved, 'decisions' | 'answers'>): Extract<ChatMessage['content'], unknown[]> {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant' || !Array.isArray(last.content)) return []
  return (last.content as AssistantBlock[])
    .filter((b): b is ToolUse => isProposeUse(b) || isAskUse(b))
    .map((b) => ({
      type: 'tool_result' as const,
      tool_use_id: b.id,
      content: b.name === 'ask_user_questions'
        ? saved.answers[b.id]
          ? answersText(b.input, saved.answers[b.id])
          : 'The user skipped these questions and wrote a message instead.'
        : saved.decisions[b.id] === 'approved'
          ? 'The user approved the proposal; the changes were applied to the trip.'
          : 'The user did not approve the proposal; nothing was changed.',
    }))
}

export default function Chat() {
  const { state, dispatch } = useTrip()
  const trip = state.hasActiveTrip ? state.trip : null
  const [saved, setSaved] = useState<Saved>(loadSaved)
  const [draft, setDraft] = useState('')
  const [live, setLive] = useState<{ text: string; searching: boolean } | null>(null)
  const [error, setError] = useState('')
  const [needCode, setNeedCode] = useState(false)
  const [code, setCode] = useState('')
  const [shareLocation, setShareLocation] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    try {
      // Keep the last 60 messages: enough context, and localStorage stays small
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...saved, messages: trimHistory(saved.messages) }))
    } catch {
      /* ignore */
    }
  }, [saved])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [saved.messages.length, live?.text, error])

  useEffect(() => () => abortRef.current?.abort(), [])

  const busy = !!live

  const getLocation = () =>
    new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      )
    })

  /** Send the conversation and stream the answer; resumes a paused (long web search) turn up to 3 times */
  const run = async (messages: ChatMessage[]) => {
    setError('')
    setLive({ text: '', searching: false })
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const location = shareLocation ? await getLocation() : null
    let history = messages
    try {
      for (let round = 0; round < 4; round++) {
        let stop: string | null = null
        await streamChat(
          history,
          tripContext(trip, location),
          (e) => {
            if (e.t === 'text') setLive((l) => ({ text: (l?.text ?? '') + e.v, searching: false }))
            else if (e.t === 'status') setLive((l) => ({ text: l?.text ?? '', searching: true }))
            else if (e.t === 'final') {
              history = [...history, { role: 'assistant', content: e.content } as unknown as ChatMessage]
              stop = e.stop_reason
              setSaved((s) => ({ ...s, messages: history }))
              setLive({ text: '', searching: false })
            } else if (e.t === 'error') throw new ChatHttpError(e.v)
          },
          ctrl.signal,
        )
        if (stop !== 'pause_turn') break
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const c = err instanceof ChatHttpError ? err.code : 'network'
      if (c === 'bad_code') setNeedCode(true)
      else setError(errorText(c))
    } finally {
      setLive(null)
      abortRef.current = null
    }
  }

  const send = (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    const results = pendingResults(saved.messages, saved)
    const userMsg: ChatMessage = { role: 'user', content: results.length ? [...results, { type: 'text', text: t }] : t }
    const messages = [...saved.messages, userMsg]
    setSaved((s) => ({ ...s, messages }))
    setDraft('')
    void run(messages)
  }

  const retry = () => {
    const last = saved.messages[saved.messages.length - 1]
    if (last?.role === 'user') void run(saved.messages)
  }

  /** Answers to the assistant's questions go straight back, so it can continue planning */
  const answer = (id: string, a: Answers) => {
    if (busy) return
    const next = { ...saved, answers: { ...saved.answers, [id]: a } }
    const results = pendingResults(saved.messages, next)
    const messages: ChatMessage[] = [...saved.messages, { role: 'user', content: results }]
    setSaved({ ...next, messages })
    void run(messages)
  }

  const decide = (id: string, proposal: Proposal, d: Decision) => {
    if (d === 'approved') dispatch({ type: 'applyPlan', ops: proposal.operations, newTripId: `trip-${Date.now().toString(36)}` })
    setSaved((s) => ({ ...s, decisions: { ...s.decisions, [id]: d } }))
  }

  const reset = () => {
    abortRef.current?.abort()
    setSaved({ messages: [], decisions: {}, answers: {} })
    setError('')
  }

  const lastUserUnanswered = saved.messages[saved.messages.length - 1]?.role === 'user'

  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur">
        <IconButton label="חזרה" onClick={() => history.back()}>
          <ArrowRight size={20} aria-hidden="true" />
        </IconButton>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="flex items-center gap-1.5 text-xl font-bold">
            <Sparkles size={18} className="text-accent" aria-hidden="true" />
            עוזר הטיול
          </h1>
          <span className="truncate text-[13px] text-muted">{trip ? trip.name : 'אין טיול פתוח – אפשר לבקש לבנות אחד'}</span>
        </div>
        {saved.messages.length > 0 && (
          <IconButton label="שיחה חדשה" onClick={reset}>
            <RotateCcw size={18} aria-hidden="true" />
          </IconButton>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-3 px-4 pt-4 pb-4" aria-live="polite">
        {saved.messages.length === 0 && (
          <div className="flex flex-col gap-3 pt-2">
            <p className="text-[15px] text-muted">
              שאלו על הטיול, בקשו המלצות למסעדות ולינה (עם מחירים וביקורות מהאינטרנט), או בקשו לבנות ולשנות את התכנון. כל שינוי בטיול מוצג קודם לאישור שלכם.
            </p>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    if (s.includes('קרוב אליי')) setShareLocation(true)
                    setDraft(s)
                  }}
                  className="rounded-card border border-border bg-surface px-3.5 py-3 text-start text-[14px] hover:border-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {saved.messages.map((m, i) => (
          <MessageView
            key={i}
            message={m}
            trip={trip}
            decisions={saved.decisions}
            answers={saved.answers}
            isLast={i === saved.messages.length - 1}
            busy={busy}
            onDecide={decide}
            onAnswer={answer}
          />
        ))}

        {live && (
          <div className="flex flex-col gap-1.5">
            {live.text && <Bubble role="assistant">{renderMarkdown(live.text)}</Bubble>}
            <span className="flex items-center gap-1.5 text-[13px] text-muted">
              {live.searching ? <Globe size={14} className="animate-pulse" aria-hidden="true" /> : <Sparkles size={14} className="animate-pulse" aria-hidden="true" />}
              {live.searching ? 'מחפש באינטרנט…' : 'כותב…'}
            </span>
          </div>
        )}

        {error && (
          <div role="alert" className="flex flex-col gap-2 rounded-card border border-accent-2/40 bg-accent-2/6 p-3 text-[14px] text-accent-2">
            {error}
            {lastUserUnanswered && (
              <button type="button" onClick={retry} className="h-10 self-start rounded-tile border border-border-strong px-4 font-medium text-text">
                לנסות שוב
              </button>
            )}
          </div>
        )}

        {needCode && (
          <form
            className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3"
            onSubmit={(e) => {
              e.preventDefault()
              setAccessCode(code.trim())
              setNeedCode(false)
              setCode('')
              retry()
            }}
          >
            <label htmlFor="chat-code" className="text-[14px]">
              העוזר מוגן בקוד גישה. הזינו את הקוד שהגדרתם ב-Netlify (CHAT_ACCESS_CODE):
            </label>
            <div className="flex gap-2">
              <input
                id="chat-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                className="h-11 min-w-0 flex-1 rounded-tile border border-border bg-raised px-3 text-[15px] outline-none focus:border-accent"
              />
              <button type="submit" disabled={!code.trim()} className="h-11 rounded-tile bg-accent px-4 font-semibold text-on-accent disabled:opacity-40">
                שמירה
              </button>
            </div>
          </form>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-bg/95 px-4 pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
      >
        <button
          type="button"
          aria-pressed={shareLocation}
          onClick={() => setShareLocation((v) => !v)}
          className={cx(
            'flex h-8 items-center gap-1.5 self-start rounded-full border px-3 text-[13px] transition-colors duration-200 ease-out',
            shareLocation ? 'border-accent bg-accent/10 font-semibold text-accent' : 'border-border text-muted',
          )}
        >
          <LocateFixed size={14} aria-hidden="true" />
          {shareLocation ? 'המיקום שלי יצורף' : 'לצרף את המיקום שלי'}
        </button>
        <div className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">
            הודעה לעוזר
          </label>
          <textarea
            id="chat-input"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send(draft)
              }
            }}
            placeholder="כתבו לעוזר…"
            className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-2xl border border-border bg-raised px-3.5 py-2.5 text-[15px] text-text outline-none [field-sizing:content] placeholder:text-muted focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="שליחה"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-40"
          >
            <Send size={18} className="-scale-x-100" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  )
}

/** Keep the history short without starting on a tool result (it needs the assistant turn before it) */
function trimHistory(messages: ChatMessage[]) {
  if (messages.length <= 60) return messages
  let start = messages.length - 60
  while (start < messages.length) {
    const m = messages[start]
    if (m.role === 'user' && (typeof m.content === 'string' || !m.content.some((b) => b.type === 'tool_result'))) break
    start++
  }
  return messages.slice(start)
}

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: ReactNode }) {
  return (
    <div
      className={cx(
        'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed',
        role === 'user' ? 'self-start rounded-ss-md bg-accent text-on-accent' : 'self-end rounded-se-md border border-border bg-surface',
      )}
      dir="auto"
    >
      {children}
    </div>
  )
}

function MessageView({
  message,
  trip,
  decisions,
  answers,
  isLast,
  busy,
  onDecide,
  onAnswer,
}: {
  message: ChatMessage
  trip: ReturnType<typeof useTrip>['state']['trip'] | null
  decisions: Record<string, Decision>
  answers: Record<string, Answers>
  isLast: boolean
  busy: boolean
  onDecide: (id: string, p: Proposal, d: Decision) => void
  onAnswer: (id: string, a: Answers) => void
}) {
  if (message.role === 'user') {
    const text =
      typeof message.content === 'string'
        ? message.content
        : message.content
            .filter((b) => b.type === 'text')
            .map((b) => (b as { text: string }).text)
            .join('\n')
    return text ? <Bubble role="user">{text}</Bubble> : null
  }
  const blocks = (typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content) as AssistantBlock[]
  const text = blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
  return (
    <>
      {text.trim() && <Bubble role="assistant">{renderMarkdown(text)}</Bubble>}
      {blocks.filter(isAskUse).map((b) => (
        <QuestionsCard
          key={b.id}
          questions={parseQuestions(b.input)}
          answered={answers[b.id]}
          open={isLast && !answers[b.id]}
          busy={busy}
          onSubmit={(a) => onAnswer(b.id, a)}
        />
      ))}
      {blocks.filter(isProposeUse).map((b) => {
        const proposal = parseProposal(b.input)
        return (
          <ProposalCard
            key={b.id}
            proposal={proposal}
            trip={trip}
            decision={decisions[b.id] ?? (isLast ? undefined : 'rejected')}
            onDecide={(d) => proposal && onDecide(b.id, proposal, d)}
          />
        )
      })}
    </>
  )
}

function QuestionsCard({
  questions,
  answered,
  open,
  busy,
  onSubmit,
}: {
  questions: Question[]
  answered?: Answers
  open: boolean
  busy: boolean
  onSubmit: (a: Answers) => void
}) {
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [typed, setTyped] = useState<Record<string, string>>({})
  if (!questions.length) return null

  if (!open) {
    return (
      <section className="flex w-full flex-col gap-1.5 rounded-card border border-border bg-surface p-3.5 text-[14px]" aria-label="תשובות לשאלות העוזר">
        {questions.map((q) => (
          <p key={q.id}>
            <span className="text-muted">{q.question}</span> <strong>{answered?.[q.id] || 'דילגתם'}</strong>
          </p>
        ))}
      </section>
    )
  }

  const valueOf = (q: Question) => [...(picked[q.id] ?? []), typed[q.id]?.trim()].filter(Boolean).join(', ')
  const toggle = (q: Question, o: string) =>
    setPicked((p) => {
      const cur = p[q.id] ?? []
      const next = cur.includes(o) ? cur.filter((x) => x !== o) : q.multiple ? [...cur, o] : [o]
      return { ...p, [q.id]: next }
    })
  const answeredCount = questions.filter((q) => valueOf(q)).length

  return (
    <form
      className="flex w-full flex-col gap-4 rounded-card border-2 border-accent/40 bg-surface p-3.5"
      aria-label="שאלות של העוזר"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(Object.fromEntries(questions.map((q) => [q.id, valueOf(q)])))
      }}
    >
      {questions.map((q) => (
        <fieldset key={q.id} className="flex flex-col gap-2">
          <legend className="mb-1 text-[15px] font-semibold" dir="auto">
            {q.question}
            {q.multiple && <span className="ms-1.5 text-[12px] font-normal text-muted">(אפשר לבחור כמה)</span>}
          </legend>
          {q.options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {q.options.map((o) => {
                const on = (picked[q.id] ?? []).includes(o)
                return (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={on}
                    dir="auto"
                    onClick={() => toggle(q, o)}
                    className={cx(
                      'min-h-10 rounded-full border px-3.5 py-1.5 text-[14px] transition-colors duration-200 ease-out',
                      on ? 'border-accent bg-accent font-semibold text-on-accent' : 'border-border bg-raised hover:border-accent',
                    )}
                  >
                    {o}
                  </button>
                )
              })}
            </div>
          )}
          <input
            value={typed[q.id] ?? ''}
            onChange={(e) => setTyped((t) => ({ ...t, [q.id]: e.target.value }))}
            placeholder={q.options.length ? 'או כתבו תשובה משלכם' : 'התשובה שלכם'}
            aria-label={`${q.question} – תשובה חופשית`}
            className="h-10 rounded-tile border border-border bg-raised px-3 text-[14px] outline-none placeholder:text-muted focus:border-accent"
          />
        </fieldset>
      ))}
      <button
        type="submit"
        disabled={busy || answeredCount === 0}
        className="flex h-11 items-center justify-center gap-1.5 rounded-tile bg-accent text-[15px] font-semibold text-on-accent disabled:opacity-40"
      >
        <Send size={16} className="-scale-x-100" aria-hidden="true" />
        שליחת התשובות{answeredCount < questions.length ? ` (${answeredCount}/${questions.length})` : ''}
      </button>
    </form>
  )
}

function ProposalCard({
  proposal,
  trip,
  decision,
  onDecide,
}: {
  proposal: Proposal | null
  trip: ReturnType<typeof useTrip>['state']['trip'] | null
  decision?: Decision
  onDecide: (d: Decision) => void
}) {
  if (!proposal) {
    return <p className="self-end rounded-card border border-border bg-surface px-3 py-2 text-[13px] text-muted">העוזר שלח הצעה שלא הצלחנו לקרוא. בקשו ממנו לנסות שוב.</p>
  }
  const empty = { id: '', name: '', destination: null, days: [], budget: { currency: 'EUR' as const, categories: [] } }
  return (
    <section className="flex w-full flex-col gap-2.5 rounded-card border-2 border-accent/40 bg-surface p-3.5" aria-label="הצעה לשינוי הטיול">
      <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">
        <Sparkles size={16} className="text-accent" aria-hidden="true" />
        {proposal.summary || 'הצעה לשינוי הטיול'}
      </h2>
      <ol className="flex list-decimal flex-col gap-1 ps-5 text-[14px]">
        {proposal.operations.map((op, i) => (
          <Fragment key={i}>
            <li dir="auto">{describeOp(trip ?? empty, op)}</li>
          </Fragment>
        ))}
      </ol>
      {decision === 'approved' ? (
        <p className="flex items-center gap-1.5 text-[14px] font-semibold text-accent">
          <Check size={16} aria-hidden="true" />
          אושר ועודכן בטיול ·{' '}
          <a href={href('/trip/schedule')} className="underline">
            ללו״ז
          </a>
        </p>
      ) : decision === 'rejected' ? (
        <p className="flex items-center gap-1.5 text-[14px] text-muted">
          <X size={16} aria-hidden="true" />
          לא אושר – שום דבר לא השתנה
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onDecide('approved')} className="flex h-11 items-center justify-center gap-1.5 rounded-tile bg-accent text-[15px] font-semibold text-on-accent">
            <Check size={18} aria-hidden="true" />
            אישור ועדכון
          </button>
          <button type="button" onClick={() => onDecide('rejected')} className="h-11 rounded-tile border border-border-strong text-[15px] font-medium">
            לא עכשיו
          </button>
        </div>
      )}
    </section>
  )
}

/** Minimal, safe markdown: paragraphs, "-" lists, **bold** and https links (no HTML is injected) */
function renderMarkdown(text: string): ReactNode {
  const inline = (s: string, key: string): ReactNode[] => {
    const out: ReactNode[] = []
    const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g
    let last = 0
    let m: RegExpExecArray | null
    let n = 0
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index))
      if (m[1]) out.push(<strong key={`${key}-${n++}`}>{m[1]}</strong>)
      else
        out.push(
          <a key={`${key}-${n++}`} href={m[3]} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline">
            {m[2]}
          </a>,
        )
      last = re.lastIndex
    }
    if (last < s.length) out.push(s.slice(last))
    return out
  }
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (!list.length) return
    const items = list
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-1 flex list-disc flex-col gap-1 ps-5">
        {items.map((it, i) => (
          <li key={i}>{inline(it, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>,
    )
    list = []
  }
  lines.forEach((line, i) => {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    if (bullet) {
      list.push(bullet[1])
      return
    }
    flush()
    const clean = line.replace(/^#+\s*/, '')
    if (clean.trim()) blocks.push(<p key={`p-${i}`} className="my-0.5">{inline(clean, `p-${i}`)}</p>)
  })
  flush()
  return blocks
}

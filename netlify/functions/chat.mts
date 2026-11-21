import Anthropic from '@anthropic-ai/sdk'

/**
 * The trip assistant: a Netlify function between the app and the Claude API, so the API key stays on
 * the server. It streams the answer back as NDJSON lines:
 *   {t:"text", v}       a piece of the reply
 *   {t:"status", v}     "search" while Claude searches the web
 *   {t:"final", content, stop_reason}  the full assistant message, kept by the app for the next turn
 *   {t:"error", v}      what went wrong
 *
 * Environment (Netlify -> Site configuration -> Environment variables):
 *   ANTHROPIC_API_KEY  required
 *   CHAT_ACCESS_CODE   optional: the app must send this code, so strangers who find the site can't spend your credits
 * For `npm run dev`, put ANTHROPIC_API_KEY in a .env.local file (never committed).
 */
export const config = { path: '/api/chat' }

const MODEL = 'claude-opus-5-5'
/** Netlify ends a synchronous function after 60 s; stop earlier and let the app continue the turn */
const SOFT_LIMIT_MS = 40_000
const HARD_LIMIT_MS = 55_000

const SYSTEM = `You are the trip-planning assistant inside a Hebrew, mobile-first travel planner web app.

Language and style:
- Answer in Hebrew unless the user writes in another language. Be concise: the user reads on a phone.
- Use short paragraphs and "-" bullet lists. Allowed formatting: **bold**, bullet lists, and markdown links [text](https://...). No tables, no headings.
- Answer exactly what the user asked, tailored to their trip, dates, destinations and stated preferences. No generic filler.

What you know:
- A second system block describes the user's current trip (days, destinations, planned stops, lodging) and, when shared, their current location. Treat it as the current state; it is refreshed with every message. The conversation holds the user's earlier answers and preferences: use them and never ask again for something already answered.

Ask before you plan:
- Before building or substantially changing a trip, or recommending lodging, make sure you know what the answer depends on. Typical gaps: travel dates or number of days; number of travelers (adults, children and their ages); number of rooms; lodging budget per night; overall trip budget; interests (culture and history, museums, food, nature and hiking, beaches, nightlife, shopping, with kids...); pace (relaxed, balanced, packed); for several destinations, which places, how many days in each, and how they prefer to move between them (train, flight, rental car, bus).
- Ask only about what is missing and actually changes your answer, all at once, with the ask_user_questions tool (give suggested options for each question so the user can tap instead of typing). Then wait for the answers. Do not also send a long text answer in that turn: at most one short sentence before the questions.
- If the request is clear enough (for example "restaurants near me now"), just answer; do not interrogate.

Questionnaire briefs:
- A user message that starts with [WIZARD BRIEF] is the finished new-trip questionnaire (destinations and nights, dates, travelers, pace, interests, must-see places, transport, budget). It already answers everything you would ask: do not ask questions. Briefly summarize your plan in one or two sentences, then call propose_trip_changes once with the whole trip: setup_trip for the first destination, set_destination for each later destination (day ranges follow the nights: nights of the earlier destinations come first, the last destination also gets the departure day), then add_stop for every day. Fit the pace (relaxed 2-3 stops a day, balanced 4-5, packed 6+), the interests, the must-see places (put each on a sensible day) and the kosher request (food stops should be kosher or vegetarian options when asked). On the first day of a new destination plan less. Stay within the budget level. Mention travel between destinations in your text.

Recommendations (restaurants, sights, lodging, transport):
- Use web search for anything current: restaurants near a place or near the user's location, opening hours, prices, availability, reviews, transport between destinations.
- For each place give the name, area, why it suits this user, and a link to its page or a map/listing page.
- Lodging: give the price per night for the user's number of travelers and rooms, within their budget, the rating or review score with its source (Booking.com, Google, TripAdvisor, ...), location, and a link. Prices change by date and availability: say they are approximate and where they came from. Never invent prices, ratings or reviews; if you could not find them, say so.
- Moving between destinations: give the realistic options (train, flight, bus, car) with travel time, approximate price per person, where it leaves from, and a booking link, and recommend one for this user.

Changing the trip:
- You cannot change the trip directly. To add, remove or rearrange anything, or to build a whole trip, call the propose_trip_changes tool. The app shows your proposal to the user, who approves or rejects it; nothing changes before that.
- When you have what you need, send a short explanation in text (including how to get between destinations and lodging suggestions when relevant), then call propose_trip_changes once with every operation in order.
- Day numbers are 1-based, as in the trip description. Use real coordinates for every place (search if unsure). Add stops in visiting order with realistic visit lengths; consider opening hours, distances, the day's hours, the user's interests and pace. On a travel day between destinations, plan less.
- To build a trip for someone without dates, use setup_trip first (it creates the days), then set_destination for multi-destination trips, then add_stop and add_lodging. setup_trip on a trip that already has days replaces them: only use it when the user asks to start over.
- After a tool result tells you whether the user approved, reply in one short sentence.`

/** Mirrors PlanOp in src/data/aiPlan.ts */
const PROPOSE_TOOL: Anthropic.Beta.BetaTool = {
  name: 'propose_trip_changes',
  description:
    'Propose changes to the user\'s trip. The app shows them as a list the user approves or rejects; nothing is applied before approval. Send all operations of one request in a single call, in the order they should be applied.',
  // Not strict: strict tool schemas can't be combined with the citations web search adds.
  // The app validates every proposal itself (parseProposal in src/data/aiPlan.ts).
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'operations'],
    properties: {
      summary: { type: 'string', description: 'One Hebrew sentence describing the proposal, shown above the list.' },
      operations: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['op'],
          properties: {
            op: {
              type: 'string',
              enum: ['setup_trip', 'set_destination', 'add_stop', 'remove_stop', 'clear_day', 'set_day_hours', 'add_lodging', 'add_restaurant'],
              description:
                'setup_trip: start_date, end_date, name, country, lat, lng, is_country. set_destination: day, to_day, name, country, lat, lng, is_country. add_stop: day, name, kind, lat, lng, minutes, note. remove_stop: day, name. clear_day: day. set_day_hours: day, start, end. add_lodging: name, area, check_in, check_out. add_restaurant: name, cuisine, day.',
            },
            day: { type: 'integer', description: '1-based day number' },
            to_day: { type: 'integer', description: 'Last day (inclusive) for set_destination' },
            name: { type: 'string', description: 'Place, destination, hotel or restaurant name' },
            country: { type: 'string' },
            is_country: { type: 'boolean', description: 'The destination is a whole country' },
            lat: { type: 'number' },
            lng: { type: 'number' },
            kind: { type: 'string', enum: ['food', 'heritage', 'museum', 'view', 'nature', 'beach', 'market', 'shopping', 'street'] },
            minutes: { type: 'integer', description: 'Visit length' },
            note: { type: 'string', description: 'Short Hebrew description of the stop' },
            start: { type: 'string', description: 'HH:MM' },
            end: { type: 'string', description: 'HH:MM' },
            start_date: { type: 'string', description: 'YYYY-MM-DD' },
            end_date: { type: 'string', description: 'YYYY-MM-DD' },
            check_in: { type: 'string', description: 'YYYY-MM-DD' },
            check_out: { type: 'string', description: 'YYYY-MM-DD' },
            area: { type: 'string' },
            cuisine: { type: 'string' },
          },
        },
      },
    },
  },
}

/** Clarifying questions, shown in the app as a short form; the answers come back as the tool result. Mirrors parseQuestions in src/data/aiPlan.ts */
const ASK_TOOL: Anthropic.Beta.BetaTool = {
  name: 'ask_user_questions',
  description:
    'Ask the user the clarifying questions you need before planning or recommending (travelers, rooms, budgets, interests, pace, destinations and days, transport between destinations...). The app shows them as a form with tappable options; the answers come back as the tool result. Ask everything you need in one call.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        description: '1 to 8 short questions in Hebrew',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'question'],
          properties: {
            id: { type: 'string', description: 'Short English key, e.g. travelers, rooms, lodging_budget' },
            question: { type: 'string', description: 'The question in Hebrew' },
            options: { type: 'array', items: { type: 'string' }, description: 'Suggested answers in Hebrew (2 to 6). The user can also type their own answer.' },
            multiple: { type: 'boolean', description: 'The user may pick several options (e.g. interests)' },
          },
        },
      },
    },
  },
}

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }, ASK_TOOL, PROPOSE_TOOL]

interface ChatRequest {
  messages: Anthropic.Beta.BetaMessageParam[]
  context: string
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function validRequest(body: unknown): body is ChatRequest {
  const b = body as ChatRequest
  return (
    !!b &&
    Array.isArray(b.messages) &&
    b.messages.length > 0 &&
    b.messages.length <= 80 &&
    b.messages.every((m) => (m.role === 'user' || m.role === 'assistant') && (typeof m.content === 'string' || Array.isArray(m.content))) &&
    b.messages[0].role === 'user' &&
    typeof b.context === 'string' &&
    b.context.length <= 20_000
  )
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: 'not_configured' }, 503)
  const code = process.env.CHAT_ACCESS_CODE
  if (code && req.headers.get('x-chat-code') !== code) return json({ error: 'bad_code' }, 401)

  const raw = await req.text()
  if (raw.length > 1_500_000) return json({ error: 'too_long' }, 413)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!validRequest(body)) return json({ error: 'bad_request' }, 400)

  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'))
      try {
        await claudeTurn(new Anthropic({ apiKey }), body, send)
      } catch (err) {
        send({ t: 'error', v: errorCode(err) })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } })
}

function errorCode(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) return 'bad_key'
  if (err instanceof Anthropic.PermissionDeniedError) return 'bad_key'
  if (err instanceof Anthropic.RateLimitError) return 'rate_limit'
  if (err instanceof Anthropic.BadRequestError) return 'bad_request'
  if (err instanceof Anthropic.APIUserAbortError) return 'timeout'
  if (err instanceof Anthropic.APIError) return `api_${err.status ?? 'error'}`
  return 'unknown'
}

async function claudeTurn(client: Anthropic, body: ChatRequest, send: (o: unknown) => void) {
  const started = Date.now()
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), HARD_LIMIT_MS)
  let messages = body.messages
  try {
    for (;;) {
      const stream = client.beta.messages.stream(
        {
          model: MODEL,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          thinking: { type: 'adaptive' },
          // Chat answers should come quickly (the function has 60 s); planning still gets adaptive thinking
          output_config: { effort: 'low' },
          system: [
            { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: `Current trip state:\n${body.context}` },
          ],
          tools: TOOLS,
          messages,
        },
        { signal: abort.signal },
      )
      for await (const ev of stream) {
        if (ev.type === 'content_block_start' && ev.content_block.type === 'server_tool_use') send({ t: 'status', v: 'search' })
        else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') send({ t: 'text', v: ev.delta.text })
      }
      const msg = await stream.finalMessage()
      send({ t: 'final', content: msg.content, stop_reason: msg.stop_reason })
      // A long web-search turn can pause; resume it here while there is time, else the app sends a follow-up request
      if (msg.stop_reason !== 'pause_turn' || Date.now() - started > SOFT_LIMIT_MS) return
      messages = [...messages, { role: 'assistant', content: msg.content }]
    }
  } finally {
    clearTimeout(timer)
  }
}

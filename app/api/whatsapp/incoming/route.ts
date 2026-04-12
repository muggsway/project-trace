import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sql } from '@/lib/db'

/**
 * POST /api/whatsapp/incoming
 *
 * Twilio webhook — receives inbound WhatsApp messages, queries the DB for
 * health context, calls Claude, and replies via TwiML.
 *
 * Twilio setup: set "When a message comes in" webhook to:
 *   https://<your-ngrok-or-domain>/api/whatsapp/incoming
 */

const client = new Anthropic()

function twiml(message: string): NextResponse {
  const safe = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`
  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

async function getHealthContext(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)

  const [snapshots, workouts, journal, insights] = await Promise.all([
    sql`
      SELECT date, hrv_ms, sleep_hours, sleep_score, resting_hr, steps,
             avg_stress, body_battery_high, body_battery_low
      FROM tracker_snapshots
      ORDER BY date DESC LIMIT 14
    `,
    sql`
      SELECT workout_type, date, duration_mins, avg_hr, distance_km
      FROM workouts
      ORDER BY date DESC LIMIT 10
    `,
    sql`
      SELECT entry_type, description, quantity, logged_at
      FROM journal_entries
      WHERE logged_at >= NOW() - INTERVAL '24 hours'
        AND status = 'confirmed'
      ORDER BY logged_at DESC LIMIT 20
    `,
    sql`
      SELECT what_worked, what_was_average, warnings
      FROM insights_cache
      LIMIT 1
    `,
  ])

  const snapshotText = snapshots.map((s: Record<string, unknown>) =>
    `${s.date}: hrv=${s.hrv_ms}ms sleep=${s.sleep_hours}h(score=${s.sleep_score}) hr=${s.resting_hr} steps=${s.steps} stress=${s.avg_stress} battery=${s.body_battery_low}→${s.body_battery_high}`
  ).join('\n')

  const workoutText = workouts.map((w: Record<string, unknown>) =>
    `${w.date}: ${w.workout_type} ${w.duration_mins}min avg_hr=${w.avg_hr}${w.distance_km ? ` ${w.distance_km}km` : ''}`
  ).join('\n')

  const journalText = journal.map((e: Record<string, unknown>) => {
    const time = e.logged_at instanceof Date
      ? e.logged_at.toTimeString().slice(0, 5)
      : String(e.logged_at).slice(11, 16)
    return `${time} ${e.entry_type}: ${e.description}${e.quantity ? ` (${e.quantity})` : ''}`
  }).join('\n')

  const ins = insights[0]
  const insightText = ins
    ? `What's working: ${ins.what_worked}\nPattern: ${ins.what_was_average}\nWarnings: ${(ins.warnings as string[] ?? []).join(', ')}`
    : 'No insights generated yet.'

  return `Today: ${today}

TRACKER — last 14 days:
${snapshotText || 'No data'}

WORKOUTS:
${workoutText || 'No workouts'}

TODAY'S LOG:
${journalText || 'Nothing logged today'}

LATEST INSIGHTS:
${insightText}`
}

async function logEntry(
  entryType: string,
  description: string,
  quantity: string | null
): Promise<void> {
  const { v4: uuidv4 } = await import('uuid')
  const id = uuidv4()
  const now = new Date().toISOString()
  await sql`
    INSERT INTO journal_entries (id, entry_type, description, quantity, logged_at, created_at, status, source)
    VALUES (${id}, ${entryType}, ${description}, ${quantity}, ${now}, ${now}, 'confirmed', 'manual')
  `
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const params = new URLSearchParams(body)
  const message = params.get('Body')?.trim()

  if (!message) {
    return twiml('Hi! Ask me about your health data or log something — e.g. "How did I sleep?" or "Log iron supplement 400mg".')
  }

  try {
    const context = await getHealthContext()
    const today = new Date().toISOString().slice(0, 10)

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `You are Trace, a personal health assistant. You have access to the user's real health data from their Garmin watch and manual logs.

${context}

Rules:
- You are on WhatsApp — keep replies to 2-4 sentences max. Plain text only, no markdown.
- Be specific: reference actual values from the data above.
- If the user is logging something, start with LOG:<entry_type>|<what it is>|<amount or null>. entry_type must be lowercase, one of: food, drink, supplement, symptom, mood, energy, workout. Water/juice/coffee/tea = drink. description = the item name (e.g. "water", "iron supplement"). quantity = the amount (e.g. "500ml", "400mg"). Then on the next line write your reply.
- If you don't have enough data, say so briefly.
- Today is ${today}.

User message: ${message}

If this is a logging request, start your reply with exactly: LOG:<entry_type>|<description>|<quantity or null>
Then on the next line write your confirmation message to the user.
Otherwise just reply directly.`,
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Handle logging
    if (text.startsWith('LOG:')) {
      const [logLine, ...replyLines] = text.split('\n')
      const [, rawType, description, quantity] = logLine.split('|')

      const VALID_TYPES = new Set(['food', 'drink', 'supplement', 'symptom', 'mood', 'energy', 'workout'])
      const TYPE_MAP: Record<string, string> = { water: 'drink', juice: 'drink', coffee: 'drink', tea: 'drink', alcohol: 'drink' }
      const normalised = rawType?.trim().toLowerCase() ?? ''
      const entryType = VALID_TYPES.has(normalised) ? normalised : (TYPE_MAP[normalised] ?? 'food')

      console.log(`[whatsapp/incoming] logging: rawType="${rawType?.trim()}" → entryType="${entryType}" description="${description?.trim()}" quantity="${quantity?.trim()}"`)
      if (!VALID_TYPES.has(normalised) && !TYPE_MAP[normalised]) {
        console.log(`[whatsapp/incoming] unknown entry_type from Claude: "${rawType?.trim()}" — defaulted to "food"`)
      }

      if (description) {
        await logEntry(entryType, description.trim(), quantity?.trim() === 'null' ? null : quantity?.trim() ?? null)
      }
      return twiml(replyLines.join('\n').trim() || `Logged: ${description}`)
    }

    return twiml(text)
  } catch (err) {
    console.error('[whatsapp/incoming]', err)
    return twiml('Sorry, something went wrong. Please try again in a moment.')
  }
}

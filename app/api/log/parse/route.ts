import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sql } from '@/lib/db'

/**
 * POST /api/log/parse
 *
 * Multi-turn conversational health log parser.
 *
 * Request:
 *   {
 *     messages: Array<{ role: 'user' | 'assistant', content: string }>
 *   }
 *   The last message must be role: 'user'. Pass the full conversation history
 *   for follow-up turns.
 *
 * Response (needs more info):
 *   { follow_up_question: string, entries: [], water_ml: null }
 *
 * Response (complete):
 *   { follow_up_question: null, entries: JournalEntry[], water_ml: number | null }
 */
export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages array is required' }, { status: 400 })
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const now = new Date().toISOString()

    const systemPrompt = `You are Trace, a conversational health logging assistant. Your job is to extract structured health data from what the user says — but if key details are missing, ask ONE concise follow-up question before logging.

Current time: ${now}

You must always respond with JSON only (no markdown). Two possible response shapes:

1. If you need more information (e.g. missing quantity for food, missing sets/weight/duration for workout):
{ "follow_up_question": "How much ramen did you have?", "entries": [], "water_ml": null }

2. If you have everything you need:
{
  "follow_up_question": null,
  "water_ml": <number in ml, or null>,
  "entries": [
    { "entry_type": "food",       "description": "Ramen",    "quantity": "1 large bowl", "macros": { "calories": 450, "protein_g": 12, "carbs_g": 68, "fat_g": 10 }, "logged_at": "${now}" },
    { "entry_type": "supplement", "description": "Iron",     "quantity": "65mg",         "macros": null,                                                                  "logged_at": "${now}" },
    { "entry_type": "workout",    "description": "Deadlift", "quantity": "3 sets × 75 lbs", "macros": null,                                                              "logged_at": "${now}" },
    { "entry_type": "mood",       "description": "Anxious",  "quantity": null,           "macros": null,                                                                  "logged_at": "${now}" }
  ]
}

Rules:
- For food entries always include a "macros" object with calories, protein_g, carbs_g, fat_g — estimate based on description and quantity. For all other entry types set "macros" to null.
- Ask follow-up ONLY for missing critical details: food needs quantity, workout needs sets+weight or duration+speed.
- Supplements and mood do not need follow-ups — log them as-is.
- Ask only ONE question per turn, covering the most important missing detail.
- water_ml: 1 glass=250ml, 1L=1000ml. Do not create an entry for water — only set water_ml.
- Weights in lbs should stay in lbs.
- If multiple items are mentioned and only one is missing detail, still ask about it.`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    })

    const raw = (response.content[0].type === 'text' ? response.content[0].text.trim() : '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    const parsed = JSON.parse(raw)

    // If still needs info, return follow-up question immediately
    if (parsed.follow_up_question) {
      return NextResponse.json({
        follow_up_question: parsed.follow_up_question,
        entries: [],
        water_ml: null,
      })
    }

    // Build entries and save to DB
    const entries = (parsed.entries ?? []).map((e: Record<string, unknown>) => ({
      id: crypto.randomUUID(),
      entry_type: e.entry_type,
      description: e.description,
      quantity: (e.quantity as string) ?? null,
      macros: (e.macros as object) ?? null,
      logged_at: (e.logged_at as string) ?? now,
      created_at: now,
      status: 'confirmed',
      source: 'voice',
    }))

    for (const entry of entries) {
      try {
        const macrosJson = entry.macros ? JSON.stringify(entry.macros) : null
        await sql`
          INSERT INTO journal_entries (id, entry_type, description, quantity, macros, logged_at, created_at, status, source)
          VALUES (${entry.id}, ${entry.entry_type}, ${entry.description}, ${entry.quantity}, ${macrosJson}::jsonb, ${entry.logged_at}, ${entry.created_at}, ${entry.status}, ${entry.source})
        `
      } catch (dbErr) {
        console.error('[/api/log/parse] DB insert failed:', entry.entry_type, dbErr)
      }
    }

    return NextResponse.json({
      follow_up_question: null,
      entries,
      water_ml: parsed.water_ml ?? null,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('[/api/log/parse]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

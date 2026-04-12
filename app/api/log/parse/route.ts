import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sql } from '@/lib/db'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * POST /api/log/parse
 * Parses a voice transcript → structured journal entries → writes to DB.
 * For food entries, estimates macros via Claude.
 */
export async function POST(req: NextRequest) {
  const { transcript } = await req.json()

  if (!transcript || typeof transcript !== 'string') {
    return NextResponse.json({ error: 'transcript is required' }, { status: 400 })
  }

  // ── Step 1: Parse transcript into structured entries ──────────────────────
  const now = new Date().toISOString()

  const parseMsg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are a health logging assistant. Parse the following voice transcript into structured journal entries.

Return JSON only (no markdown), in this exact format:
{
  "entries": [
    {
      "entry_type": "food|drink|supplement|mood|energy|symptom|workout",
      "description": "concise name of the item",
      "quantity": "amount with unit if mentioned, else null",
      "logged_at": "ISO8601 timestamp, use now if not specified: ${now}"
    }
  ]
}

Rules:
- Split multiple items into separate entries
- For supplements: description = just the supplement name (e.g. "Vitamin D"), quantity = dose (e.g. "2000 IU")
- For food: description = food name, quantity = serving size if mentioned
- For drinks: only use entry_type "drink" for beverages (coffee, water, juice, shake etc.)
- logged_at should be now unless the user says "this morning", "at lunch" etc — infer reasonably

Transcript: "${transcript}"`,
      },
    ],
  })

  const parseRaw = (parseMsg.content[0] as { type: string; text: string }).text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  let parsed: { entries: { entry_type: string; description: string; quantity: string | null; logged_at: string }[] }
  try {
    parsed = JSON.parse(parseRaw)
  } catch {
    return NextResponse.json({ error: 'Failed to parse transcript', raw: parseRaw }, { status: 500 })
  }

  if (!parsed.entries?.length) {
    return NextResponse.json({ entries: [] })
  }

  // ── Step 2: Estimate macros for food entries ──────────────────────────────
  const savedEntries = []

  for (const entry of parsed.entries) {
    let calories: number | null = null
    let protein_g: number | null = null
    let carbs_g: number | null = null
    let fat_g: number | null = null
    let fibre_g: number | null = null

    if (entry.entry_type === 'food') {
      try {
        const macroMsg = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 256,
          messages: [
            {
              role: 'user',
              content: `Estimate macros for this food. Respond with JSON only (no markdown):
{"calories":<number>,"protein_g":<number>,"carbs_g":<number>,"fat_g":<number>,"fibre_g":<number>}

Food: ${entry.description}${entry.quantity ? `\nQuantity: ${entry.quantity}` : ''}`,
            },
          ],
        })

        const macroRaw = (macroMsg.content[0] as { type: string; text: string }).text
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, '')
          .trim()

        const macros = JSON.parse(macroRaw)
        calories  = macros.calories  ?? null
        protein_g = macros.protein_g ?? null
        carbs_g   = macros.carbs_g   ?? null
        fat_g     = macros.fat_g     ?? null
        fibre_g   = macros.fibre_g   ?? null
      } catch (e) {
        console.error('[/api/log/parse] macro estimation failed:', e)
      }
    }

    // ── Step 3: Write to DB ─────────────────────────────────────────────────
    const [row] = await sql`
      INSERT INTO journal_entries
        (entry_type, description, quantity, logged_at, status, source,
         calories, protein_g, carbs_g, fat_g, fibre_g)
      VALUES (
        ${entry.entry_type}, ${entry.description}, ${entry.quantity ?? null},
        ${entry.logged_at}, 'confirmed', 'voice',
        ${calories}, ${protein_g}, ${carbs_g}, ${fat_g}, ${fibre_g}
      )
      RETURNING id, entry_type, description, quantity, logged_at, status, source,
                calories, protein_g, carbs_g, fat_g, fibre_g
    `

    savedEntries.push({
      id: row.id,
      entry_type: row.entry_type,
      description: row.description,
      quantity: row.quantity ?? undefined,
      logged_at: row.logged_at,
      created_at: row.logged_at,
      status: row.status,
      source: row.source,
      macros: row.calories != null ? {
        calories: row.calories,
        protein_g: row.protein_g ?? 0,
        carbs_g: row.carbs_g ?? 0,
        fat_g: row.fat_g ?? 0,
        fibre_g: row.fibre_g ?? undefined,
      } : undefined,
    })
  }

  return NextResponse.json({ entries: savedEntries })
}

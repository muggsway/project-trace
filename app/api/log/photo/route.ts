import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sql } from '@/lib/db'

/**
 * POST /api/log/photo
 *
 * Receives an image from an Apple Shortcut automation, runs it through
 * Claude Vision to detect food and extract macros, and returns a journal entry.
 *
 * Request: multipart/form-data with field "image" (JPEG/PNG)
 *   OR application/json with field "image_base64" (base64 string) + "media_type"
 *
 * Response (food detected):
 *   { is_food: true, entry: JournalEntry, macros: { calories, protein_g, carbs_g, fat_g } }
 *
 * Response (not food):
 *   { is_food: false }
 */
export async function POST(req: NextRequest) {
  try {
  // Accept either multipart or JSON base64
  let imageBase64: string
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg'

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('image') as File | null
    if (!file) {
      return NextResponse.json({ error: 'image field required' }, { status: 400 })
    }
    const buffer = await file.arrayBuffer()
    imageBase64 = Buffer.from(buffer).toString('base64')
    mediaType = (file.type as typeof mediaType) || 'image/jpeg'
  } else {
    const body = await req.json()
    if (!body.image_base64) {
      return NextResponse.json({ error: 'image_base64 field required' }, { status: 400 })
    }
    imageBase64 = body.image_base64
    mediaType = body.media_type || 'image/jpeg'
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          {
            type: 'text',
            text: `You are a food recognition and macro estimation assistant.

Look at this image and determine if it contains food or a meal.

If it IS food, respond with JSON only (no markdown):
{
  "is_food": true,
  "description": "short food description e.g. 'scrambled eggs with toast'",
  "quantity": "estimated serving e.g. '2 eggs, 2 slices toast'",
  "macros": {
    "calories": <number>,
    "protein_g": <number>,
    "carbs_g": <number>,
    "fat_g": <number>
  }
}

If it is NOT food, respond with JSON only:
{ "is_food": false }

Be concise. Estimate macros based on typical serving sizes visible in the image.`,
          },
        ],
      },
    ],
  })

  const raw = (response.content[0].type === 'text' ? response.content[0].text.trim() : '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  let parsed: {
    is_food: boolean
    description?: string
    quantity?: string
    macros?: { calories: number; protein_g: number; carbs_g: number; fat_g: number }
  }

  try {
    parsed = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Failed to parse Claude response', raw }, { status: 500 })
  }

  if (!parsed.is_food) {
    return NextResponse.json({ is_food: false })
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const description = parsed.description ?? 'Food photo'
  const quantity = parsed.quantity ?? null

  await sql`
    INSERT INTO journal_entries (id, entry_type, description, quantity, logged_at, created_at, status, source)
    VALUES (${id}, 'food', ${description}, ${quantity}, ${now}, ${now}, 'confirmed', 'manual')
  `

  const entry = {
    id,
    entry_type: 'food' as const,
    description,
    quantity,
    logged_at: now,
    created_at: now,
    status: 'confirmed' as const,
    source: 'manual' as const,
  }

  return NextResponse.json({
    is_food: true,
    entry,
    macros: parsed.macros,
  })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('[/api/log/photo]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

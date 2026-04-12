import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

/**
 * POST /api/log/estimate-macros
 *
 * Re-estimates macros from a food description + quantity (text only, no image).
 * Called when the user edits a food entry's name or quantity.
 *
 * Request: { description: string, quantity?: string }
 * Response: { calories, protein_g, carbs_g, fat_g }
 */
export async function POST(req: NextRequest) {
  try {
    const { description, quantity } = await req.json()
    if (!description) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 })
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Estimate the macros for this food based on the quantity provided. Respond with JSON only (no markdown):
{
  "calories": <number>,
  "protein_g": <number>,
  "carbs_g": <number>,
  "fat_g": <number>
}

Rules:
- If quantity includes a unit (e.g. "1 bowl", "200g", "2 cups"), use that precisely.
- If quantity is a bare number with no unit (e.g. "1", "2"), treat it as number of standard servings of that food (e.g. "1" ramen = 1 standard bowl, "2" eggs = 2 eggs).
- Scale macros proportionally to the quantity — do not default to a fixed serving size if the quantity clearly indicates otherwise.

Food: ${description}${quantity ? `\nQuantity: ${quantity}` : ''}`,
        },
      ],
    })

    const raw = (response.content[0].type === 'text' ? response.content[0].text.trim() : '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    const macros = JSON.parse(raw)
    return NextResponse.json(macros)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    console.error('[/api/log/estimate-macros]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

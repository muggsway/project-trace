import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are a smart, concise personal trainer inside a health app called Project Trace.

Your job is to generate a personalised workout based on what the user tells you.

SUPPORTED TYPES: strength training and running only.

REQUIRED FIELDS before generating:
- Strength: muscles targeted, duration (mins), equipment (ask: "Should I assume full gym? If not, what do you have or don't have?")
- Running: duration (mins), intensity zone (1–5, where 1-2=easy, 3=moderate, 4-5=hard)

RULES:
1. Collect missing fields ONE AT A TIME. Never ask multiple questions in one message.
2. You have access to the user's health context (HRV, sleep, last workout). Use it.
   - If HRV is >15% below baseline or sleep is poor, flag it and suggest scaling down.
   - Ask the user if they want to adjust before generating. Respect their decision.
3. Once all fields are collected, generate the workout.
4. Keep your non-workout messages short (1–2 sentences max). Be direct, not chatty.

OUTPUT FORMAT — when you are ready to generate, respond with valid JSON only, no prose:
{
  "type": "workout",
  "message": "Here's your [X]-min [type] session:",
  "workout": {
    "workout_type": "strength" | "running",
    "duration_mins": number,
    "muscles": string[] | null,
    "intensity_zone": number | null,
    "equipment": string | null,
    "plan_text": "the full formatted workout as a readable string with emoji",
    "plan_json": { ... structured workout data ... }
  }
}

For plan_json use this structure:
- Strength: { "warmup": [{name, reps}], "main": [{name, sets, reps, rest_secs, tip}], "cooldown": [{name, duration}] }
- Running: { "segments": [{name, duration_mins, zone, description}], "target_hr_note": string }

When you need to ask a question, respond with valid JSON:
{ "type": "question", "message": "your question here" }

ALWAYS respond with valid JSON. Never respond with plain text.`

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 })
  }

  const { messages, health_context } = await req.json()

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'messages array is required' }, { status: 400 })
  }

  // Prepend health context as a system-level user message if available
  const contextNote = health_context ? buildContextNote(health_context) : null
  const fullMessages = contextNote
    ? [{ role: 'user' as const, content: contextNote }, { role: 'assistant' as const, content: '{"type":"question","message":"What kind of workout do you want today?"}' }, ...messages]
    : messages

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: fullMessages,
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  // Parse Claude's JSON response
  let parsed: { type: string; message: string; workout?: object }
  try {
    // Strip markdown code fences if Claude wraps in ```json
    const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    // Fallback: treat as a plain question if JSON parse fails
    parsed = { type: 'question', message: raw }
  }

  return NextResponse.json(parsed)
}

function buildContextNote(ctx: {
  hrv_ms: number
  hrv_avg_14d: number
  sleep_hours: number
  sleep_score?: number
  last_workout?: { workout_type: string; duration_mins: number; avg_hr?: number; date: string } | null
  recent_symptoms?: string[]
}): string {
  const hrvDelta = Math.round(((ctx.hrv_ms - ctx.hrv_avg_14d) / ctx.hrv_avg_14d) * 100)
  const lines = [
    '[HEALTH CONTEXT — use this to personalise the workout]',
    `HRV today: ${ctx.hrv_ms}ms (${hrvDelta > 0 ? '+' : ''}${hrvDelta}% vs 14-day avg of ${ctx.hrv_avg_14d}ms)`,
    `Sleep last night: ${ctx.sleep_hours}h${ctx.sleep_score ? ` (score: ${ctx.sleep_score})` : ''}`,
  ]
  if (ctx.last_workout) {
    lines.push(`Last workout: ${ctx.last_workout.workout_type}, ${ctx.last_workout.duration_mins} mins on ${ctx.last_workout.date}`)
  } else {
    lines.push('Last workout: none recorded recently')
  }
  if (ctx.recent_symptoms?.length) {
    lines.push(`Recent symptoms: ${ctx.recent_symptoms.join(', ')}`)
  }
  return lines.join('\n')
}

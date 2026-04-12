import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'
import { dummyJournalEntries } from '@/lib/dummy-data'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function GET() {
  try {
    // ── Fetch last 14 days of tracker snapshots ──
    const snapshots = await sql`
      SELECT
        date, hrv_ms, sleep_hours, sleep_score, resting_hr, steps,
        deep_sleep_secs, light_sleep_secs, rem_sleep_secs,
        body_battery_high, body_battery_low, avg_stress
      FROM tracker_snapshots
      ORDER BY date DESC
      LIMIT 14
    `

    // ── Fetch last 14 days of workouts ──
    const workouts = await sql`
      SELECT workout_type, started_at, duration_mins, distance_km,
             calories_active, avg_hr, max_hr, date
      FROM workouts
      ORDER BY date DESC
      LIMIT 20
    `

    // ── Fetch journal entries (real from DB, fallback to mock) ──
    let journalEntries
    try {
      journalEntries = await sql`
        SELECT entry_type, description, quantity, logged_at, status
        FROM journal_entries
        WHERE logged_at >= NOW() - INTERVAL '7 days'
          AND status = 'confirmed'
        ORDER BY logged_at DESC
        LIMIT 50
      `
      if (journalEntries.length === 0) journalEntries = dummyJournalEntries
    } catch {
      journalEntries = dummyJournalEntries
    }

    // ── Build Claude context ──
    const today = snapshots[0]
    const todayDate = new Date().toISOString().slice(0, 10)

    const snapshotText = snapshots.map(s => {
      const sleepStages = (s.deep_sleep_secs || s.light_sleep_secs || s.rem_sleep_secs)
        ? `deep=${Math.round((s.deep_sleep_secs || 0) / 60)}min light=${Math.round((s.light_sleep_secs || 0) / 60)}min rem=${Math.round((s.rem_sleep_secs || 0) / 60)}min`
        : ''
      const bb = (s.body_battery_low != null && s.body_battery_high != null)
        ? `body_battery=${s.body_battery_low}→${s.body_battery_high}`
        : ''
      return `${s.date}: hrv=${s.hrv_ms}ms sleep=${s.sleep_hours}h(score=${s.sleep_score}) resting_hr=${s.resting_hr} steps=${s.steps} ${bb} stress=${s.avg_stress} ${sleepStages}`.trim()
    }).join('\n')

    const workoutText = workouts.map(w =>
      `${w.date}: ${w.workout_type} ${w.duration_mins}min avg_hr=${w.avg_hr}${w.distance_km ? ` dist=${w.distance_km}km` : ''}${w.calories_active ? ` cal=${w.calories_active}` : ''}`
    ).join('\n')

    const journalText = (journalEntries as { entry_type: string; description: string; quantity?: string; logged_at: string }[]).map((e) => {
      const time = new Date(e.logged_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      return `${time} [${e.entry_type}] ${e.description}${e.quantity ? ` (${e.quantity})` : ''}`
    }).join('\n')

    const prompt = `You are an expert health analyst. Analyse the following data for a fitness enthusiast and generate specific, actionable insights.

Today's date: ${todayDate}

TRACKER DATA (last 14 days, newest first):
${snapshotText}

WORKOUT HISTORY (last 14 days):
${workoutText}

TODAY'S JOURNAL ENTRIES:
${journalText}

Generate insights in this exact JSON format:
{
  "what_worked": "1-2 sentences on genuine positives grounded in today's data",
  "what_was_average": "1-2 sentences on what was mediocre or could improve, grounded in data",
  "warnings": ["specific warning 1 with exact numbers", "specific warning 2 if warranted"],
  "key_correlations": ["correlation insight 1", "correlation insight 2"]
}

Rules:
- Every insight must reference specific numbers from the data
- Only include warnings if genuinely warranted — omit the array entry if nothing is wrong
- Correlate across data sources (e.g. supplement timing vs energy, workout intensity vs next-day HRV)
- No generic health advice. If you can't ground it in this user's actual data, don't say it.
- key_correlations should highlight non-obvious patterns across the 14-day window`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (message.content[0] as { type: string; text: string }).text
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    const insights = jsonMatch ? JSON.parse(jsonMatch[0]) : { what_worked: raw, what_was_average: '', warnings: [], key_correlations: [] }

    return NextResponse.json({
      insights,
      snapshots,
      workouts,
      journalEntries,
    })
  } catch (err) {
    console.error('[/api/analyse]', err)
    return NextResponse.json({ error: 'Failed to generate analysis' }, { status: 500 })
  }
}

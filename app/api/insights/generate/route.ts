import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'
import { dummyJournalEntries } from '@/lib/dummy-data'
import { buildInsightsPrompt } from '@/lib/insights-prompt'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * POST /api/insights/generate
 *
 * Fetches all context from DB, calls Claude, stores result in insights_cache.
 * Called in the background — response is not awaited by the caller.
 * Returns the freshly generated insights.
 */
export async function POST() {
  try {
    // ── Fetch context ──────────────────────────────────────────────────
    const snapshots = await sql`
      SELECT date, hrv_ms, sleep_hours, sleep_score, resting_hr, steps,
             deep_sleep_secs, light_sleep_secs, rem_sleep_secs,
             body_battery_high, body_battery_low, avg_stress
      FROM tracker_snapshots
      ORDER BY date DESC
      LIMIT 14
    `

    const workouts = await sql`
      SELECT workout_type, started_at, duration_mins, distance_km,
             calories_active, avg_hr, max_hr, date
      FROM workouts
      ORDER BY date DESC
      LIMIT 20
    `

    let journalEntries
    try {
      journalEntries = await sql`
        SELECT entry_type, description, quantity, logged_at
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

    // ── Build prompt ───────────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10)

    const snapshotText = snapshots.map(s => {
      const bb = s.body_battery_low != null ? ` body_battery=${s.body_battery_low}→${s.body_battery_high}` : ''
      const stages = s.deep_sleep_secs ? ` deep=${Math.round(s.deep_sleep_secs / 60)}min rem=${Math.round((s.rem_sleep_secs ?? 0) / 60)}min` : ''
      return `${s.date}: hrv=${s.hrv_ms}ms sleep=${s.sleep_hours}h(score=${s.sleep_score}) hr=${s.resting_hr} steps=${s.steps} stress=${s.avg_stress}${bb}${stages}`
    }).join('\n')

    const workoutText = workouts.map(w =>
      `${w.date}: ${w.workout_type} ${w.duration_mins}min avg_hr=${w.avg_hr}${w.distance_km ? ` ${w.distance_km}km` : ''}`
    ).join('\n')

    const journalText = (journalEntries as { entry_type: string; description: string; quantity?: string; logged_at: string }[])
      .map(e => {
        const time = new Date(e.logged_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        return `${time} [${e.entry_type}] ${e.description}${e.quantity ? ` (${e.quantity})` : ''}`
      }).join('\n')

    const prompt = buildInsightsPrompt(today, snapshotText, workoutText, journalText)

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (message.content[0] as { type: string; text: string }).text
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude returned non-JSON response')
    const insights = JSON.parse(jsonMatch[0])

    // ── Store in cache (keep only latest row) ─────────────────────────
    await sql`DELETE FROM insights_cache`
    await sql`
      INSERT INTO insights_cache (what_worked, what_was_average, warnings, key_correlations, raw_insights)
      VALUES (
        ${insights.working?.insight ?? null},
        ${insights.patterns?.insight ?? null},
        ${JSON.stringify([
          ...(insights.connections ?? []).map((c: { insight: string }) => c.insight),
          ...(insights.friction ?? []).map((f: { insight: string }) => f.insight),
        ])}::jsonb,
        ${JSON.stringify(insights.data_gaps ?? [])}::jsonb,
        ${JSON.stringify(insights)}::jsonb
      )
    `

    return NextResponse.json({ ok: true, insights })
  } catch (err) {
    console.error('[/api/insights/generate]', err)
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 })
  }
}

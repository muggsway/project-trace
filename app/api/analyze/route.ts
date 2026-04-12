import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { dummyJournalEntries } from '@/lib/dummy-data'

/**
 * GET /api/analyse
 * Returns raw stats data only (snapshots, workouts, journal entries).
 * Insights come from /api/insights/status — no Claude call here.
 */
export async function GET() {
  try {
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

    return NextResponse.json({ snapshots, workouts, journalEntries })
  } catch (err) {
    console.error('[/api/analyse]', err)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}

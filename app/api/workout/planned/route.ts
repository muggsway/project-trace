import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/**
 * GET /api/workout/planned
 *
 * Returns today's and tomorrow's planned workouts so the home screen
 * can show what's scheduled.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // Client sends its local today date to avoid UTC/local mismatch
  const clientToday = searchParams.get('today')

  let rows
  if (clientToday && /^\d{4}-\d{2}-\d{2}$/.test(clientToday)) {
    rows = await sql`
      SELECT id, workout_type, duration_mins, muscles, intensity_zone,
             equipment, plan_text, plan_json, status,
             to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date
      FROM planned_workouts
      WHERE scheduled_date IN (${clientToday}::date, ${clientToday}::date + INTERVAL '1 day')
        AND status = 'planned'
      ORDER BY scheduled_date ASC
    `
  } else {
    rows = await sql`
      SELECT id, workout_type, duration_mins, muscles, intensity_zone,
             equipment, plan_text, plan_json, status,
             to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled_date
      FROM planned_workouts
      WHERE scheduled_date IN (CURRENT_DATE, CURRENT_DATE + INTERVAL '1 day')
        AND status = 'planned'
      ORDER BY scheduled_date ASC
    `
  }
  return NextResponse.json(rows)
}

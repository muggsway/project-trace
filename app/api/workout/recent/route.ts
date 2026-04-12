import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/**
 * GET /api/workout/recent
 * Returns the last 2 completed workouts (from Garmin via garmin_sync.py)
 */
export async function GET() {
  try {
    const rows = await sql`
      SELECT id, workout_type, started_at, ended_at, duration_mins,
             distance_km, calories_active, avg_hr, max_hr, date
      FROM workouts
      ORDER BY started_at DESC
      LIMIT 2
    `

    const workouts = rows.map(r => ({
      id: r.id,
      workout_type: r.workout_type,
      started_at: r.started_at,
      ended_at: r.ended_at,
      duration_mins: r.duration_mins,
      distance_km: r.distance_km ?? undefined,
      calories_active: r.calories_active ?? undefined,
      avg_hr: r.avg_hr ?? undefined,
      max_hr: r.max_hr ?? undefined,
      date: r.date,
    }))

    return NextResponse.json(workouts)
  } catch (err) {
    console.error('[/api/workout/recent] DB error:', err)
    return NextResponse.json({ error: 'Failed to fetch workouts' }, { status: 500 })
  }
}

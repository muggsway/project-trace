import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/**
 * GET /api/workout/recent
 * Returns the last 2 completed workouts (from Garmin via garmin_sync.py)
 */
export async function GET() {
  try {
    const [garminRows, doneRows] = await Promise.all([
      sql`
        SELECT id, workout_type, started_at, ended_at, duration_mins,
               distance_km, calories_active, avg_hr, max_hr, date
        FROM workouts
        ORDER BY started_at DESC
        LIMIT 2
      `,
      sql`
        SELECT id, workout_type, duration_mins, scheduled_date, muscles, intensity_zone, plan_text, plan_json
        FROM planned_workouts
        WHERE status = 'completed'
        ORDER BY scheduled_date DESC
        LIMIT 3
      `,
    ])

    const garmin = garminRows.map(r => ({
      id: String(r.id),
      workout_type: r.workout_type,
      started_at: r.started_at,
      duration_mins: r.duration_mins,
      distance_km: r.distance_km ?? undefined,
      calories_active: r.calories_active ?? undefined,
      avg_hr: r.avg_hr ?? undefined,
      max_hr: r.max_hr ?? undefined,
      date: r.date,
    }))

    const done = doneRows.map(r => ({
      id: String(r.id),
      workout_type: r.workout_type,
      started_at: r.scheduled_date, // used for date label
      duration_mins: r.duration_mins,
      muscles: r.muscles ?? undefined,
      intensity_zone: r.intensity_zone ?? undefined,
      plan_text: r.plan_text ?? undefined,
      plan_json: r.plan_json ?? undefined,
      source: 'planned' as const,
    }))

    // Merge, deduplicate by id, sort newest first
    const seen = new Set<string>()
    const merged = [...garmin, ...done]
      .filter(w => { if (seen.has(w.id)) return false; seen.add(w.id); return true })
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
      .slice(0, 4)

    return NextResponse.json(merged)
  } catch (err) {
    console.error('[/api/workout/recent] DB error:', err)
    return NextResponse.json({ error: 'Failed to fetch workouts' }, { status: 500 })
  }
}

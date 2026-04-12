import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { TrackerSnapshot, Workout } from '@/lib/types'

export async function GET() {
  const today = new Date().toISOString().slice(0, 10)

  try {
    // Today's snapshot + 14d/30d averages in one query
    const [snapRow] = await sql`
      WITH avgs AS (
        SELECT
          ROUND(AVG(NULLIF(hrv_ms, 0))::numeric, 1)      AS hrv_avg_14d,
          ROUND(AVG(NULLIF(sleep_hours, 0))::numeric, 2)  AS sleep_avg_14d,
          ROUND(AVG(NULLIF(steps, 0))::numeric, 0)        AS steps_avg_14d,
          ROUND(AVG(NULLIF(resting_hr, 0))::numeric, 1)   AS resting_hr_avg_30d
        FROM tracker_snapshots
        WHERE date >= CURRENT_DATE - INTERVAL '30 days'
          AND date < CURRENT_DATE
      )
      SELECT
        s.date,
        s.hrv_ms,
        s.sleep_hours,
        s.sleep_score,
        s.resting_hr,
        s.steps,
        s.deep_sleep_pct,
        s.deep_sleep_secs,
        s.light_sleep_secs,
        s.rem_sleep_secs,
        s.body_battery_high,
        s.body_battery_low,
        s.avg_stress,
        a.hrv_avg_14d,
        a.sleep_avg_14d,
        a.steps_avg_14d,
        a.resting_hr_avg_30d
      FROM tracker_snapshots s, avgs a
      WHERE s.date = ${today}
      LIMIT 1
    `

    // Today's most recent workout
    const [workoutRow] = await sql`
      SELECT
        id,
        workout_type,
        started_at,
        ended_at,
        duration_mins,
        distance_km,
        calories_active,
        avg_hr,
        max_hr
      FROM workouts
      WHERE date = ${today}
      ORDER BY started_at DESC
      LIMIT 1
    `

    const snapshot: TrackerSnapshot | null = snapRow
      ? {
          date: snapRow.date,
          hrv_ms: snapRow.hrv_ms,
          hrv_avg_14d: snapRow.hrv_avg_14d ?? snapRow.hrv_ms,
          sleep_hours: snapRow.sleep_hours,
          sleep_avg_14d: snapRow.sleep_avg_14d ?? snapRow.sleep_hours,
          sleep_score: snapRow.sleep_score ?? undefined,
          resting_hr: snapRow.resting_hr,
          resting_hr_avg_30d: snapRow.resting_hr_avg_30d ?? snapRow.resting_hr,
          steps: snapRow.steps,
          steps_avg_14d: snapRow.steps_avg_14d ?? snapRow.steps,
          deep_sleep_pct: snapRow.deep_sleep_pct ?? undefined,
          deep_sleep_secs: snapRow.deep_sleep_secs ?? undefined,
          light_sleep_secs: snapRow.light_sleep_secs ?? undefined,
          rem_sleep_secs: snapRow.rem_sleep_secs ?? undefined,
          body_battery_high: snapRow.body_battery_high ?? undefined,
          body_battery_low: snapRow.body_battery_low ?? undefined,
          avg_stress: snapRow.avg_stress ?? undefined,
        }
      : null

    const workout: Workout | null = workoutRow
      ? {
          id: workoutRow.id,
          workout_type: workoutRow.workout_type,
          started_at: workoutRow.started_at,
          ended_at: workoutRow.ended_at,
          duration_mins: workoutRow.duration_mins,
          distance_km: workoutRow.distance_km ?? undefined,
          calories_active: workoutRow.calories_active ?? undefined,
          avg_hr: workoutRow.avg_hr ?? undefined,
          max_hr: workoutRow.max_hr ?? undefined,
        }
      : null

    return NextResponse.json({ snapshot, workout })
  } catch (err) {
    console.error('[/api/health] DB error:', err)
    return NextResponse.json({ error: 'Failed to fetch health data' }, { status: 500 })
  }
}

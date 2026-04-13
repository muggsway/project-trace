import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/**
 * POST /api/workout/complete
 * Body: { id: string }
 * Marks a planned workout as done.
 */
export async function POST(req: NextRequest) {
  const { id, completed_date } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await sql`
    UPDATE planned_workouts
    SET status = 'completed',
        scheduled_date = ${completed_date ?? null}::date,
        completed_at = NOW()
    WHERE id = ${id}
  `
  return NextResponse.json({ ok: true })
}

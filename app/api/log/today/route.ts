import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/**
 * GET /api/log/today
 * Returns all confirmed journal entries for today.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientDate = searchParams.get('date')
    // Use client's local date if provided, else fall back to UTC
    const today = (clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate))
      ? clientDate
      : new Date().toISOString().slice(0, 10)

    const rows = await sql`
      SELECT id, entry_type, description, quantity, macros, logged_at, created_at, status, source
      FROM journal_entries
      WHERE logged_at >= ${today}::date
        AND logged_at <  ${today}::date + INTERVAL '1 day'
        AND status = 'confirmed'
      ORDER BY logged_at DESC
    `
    return NextResponse.json(rows)
  } catch (e) {
    console.error('[/api/log/today]', e)
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/**
 * GET /api/log/today
 * Returns all confirmed journal entries for today.
 */
export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const rows = await sql`
      SELECT id, entry_type, description, quantity, macros, logged_at, created_at, status, source
      FROM journal_entries
      WHERE DATE(logged_at) = ${today}
        AND status = 'confirmed'
      ORDER BY logged_at DESC
    `
    return NextResponse.json(rows)
  } catch (e) {
    console.error('[/api/log/today]', e)
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
  }
}

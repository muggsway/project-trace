import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/**
 * GET /api/migrate
 * One-time migration — adds macros JSONB column to journal_entries.
 * Safe to run multiple times (IF NOT EXISTS).
 */
export async function GET() {
  try {
    await sql`
      ALTER TABLE journal_entries
      ADD COLUMN IF NOT EXISTS macros JSONB
    `
    return NextResponse.json({ ok: true, message: 'macros column added (or already existed)' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Migration failed'
    console.error('[/api/migrate]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

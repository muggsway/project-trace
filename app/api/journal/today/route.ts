import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/**
 * GET /api/journal/today
 * Returns today's journal entries (food, drink, supplement, mood, etc.)
 */
export async function GET() {
  try {
    const rows = await sql`
      SELECT id, entry_type, description, quantity, logged_at, status, source,
             calories, protein_g, carbs_g, fat_g, fibre_g
      FROM journal_entries
      WHERE DATE(logged_at) = CURRENT_DATE
      ORDER BY logged_at ASC
    `

    const entries = rows.map(r => ({
      id: r.id,
      entry_type: r.entry_type,
      description: r.description,
      quantity: r.quantity ?? undefined,
      logged_at: r.logged_at,
      created_at: r.logged_at,
      status: r.status,
      source: r.source,
      macros: r.calories != null ? {
        calories: r.calories,
        protein_g: r.protein_g ?? 0,
        carbs_g: r.carbs_g ?? 0,
        fat_g: r.fat_g ?? 0,
        fibre_g: r.fibre_g ?? undefined,
      } : undefined,
    }))

    return NextResponse.json(entries)
  } catch (err) {
    console.error('[/api/journal/today] DB error:', err)
    return NextResponse.json({ error: 'Failed to fetch journal entries' }, { status: 500 })
  }
}

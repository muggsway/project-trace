import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/**
 * GET /api/insights/status
 *
 * Fast DB-only read. Returns the latest cached insights and whether
 * they are stale (no Claude call — always instant).
 *
 * Stale if:
 *   - No cached insights exist, OR
 *   - Cache is older than 1 hour, OR
 *   - A new journal entry was created after the last generation
 */
export async function GET() {
  try {
    const [row] = await sql`
      SELECT generated_at, what_worked, what_was_average, warnings, key_correlations, raw_insights
      FROM insights_cache
      ORDER BY generated_at DESC
      LIMIT 1
    `

    if (!row) {
      return NextResponse.json({ cached: null })
    }

    return NextResponse.json({
      cached: {
        generated_at: row.generated_at,
        what_worked: row.what_worked,
        what_was_average: row.what_was_average,
        warnings: row.warnings,
        key_correlations: row.key_correlations,
        raw: row.raw_insights ?? null,
      },
    })
  } catch (err) {
    console.error('[/api/insights/status]', err)
    return NextResponse.json({ error: 'Failed to check insights status' }, { status: 500 })
  }
}

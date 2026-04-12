import { NextResponse } from 'next/server'
import { sql } from '@/lib/db'

/**
 * GET /api/migrate
 * Cumulative migrations — safe to run multiple times (IF NOT EXISTS).
 * Add new migrations here as the schema evolves.
 */
export async function GET() {
  try {
    // Migration 1: macros column on journal_entries
    await sql`
      ALTER TABLE journal_entries
      ADD COLUMN IF NOT EXISTS macros JSONB
    `

    // Migration 2: whatsapp_conversations table for the bidirectional WhatsApp agent
    await sql`
      CREATE TABLE IF NOT EXISTS whatsapp_conversations (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        phone      TEXT        NOT NULL,
        role       TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
        content    TEXT        NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
    await sql`
      CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_phone_created
        ON whatsapp_conversations (phone, created_at DESC)
    `

    return NextResponse.json({ ok: true, message: 'All migrations applied successfully' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Migration failed'
    console.error('[/api/migrate]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

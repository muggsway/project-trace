import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/notify/whatsapp
 *
 * Formats a DailySummary and sends it via Twilio WhatsApp sandbox.
 * Called from the summary page and by the ara cron agent at 9 PM ET.
 * Body: { summary: DailySummary }
 */

const TWILIO_FROM = 'whatsapp:+14155238886'

export async function POST(req: NextRequest) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const to         = process.env.TWILIO_WHATSAPP_TO

  if (!accountSid || !authToken || !to) {
    return NextResponse.json({ error: 'Twilio credentials not configured' }, { status: 500 })
  }

  const { summary } = await req.json()
  if (!summary) {
    return NextResponse.json({ error: 'summary is required' }, { status: 400 })
  }

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  const lines: string[] = [
    `📊 *Project Trace — ${dateLabel}*`,
    '',
    '✅ *What worked well*',
    summary.what_worked,
    '',
    '📈 *What was average*',
    summary.what_was_average,
  ]

  if (summary.warnings?.length > 0) {
    lines.push('', '⚠️ *Watch out*')
    for (const w of summary.warnings) lines.push(`• ${w}`)
  }

  lines.push('', '_Powered by Project Trace_')

  const body = lines.join('\n')

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const params = new URLSearchParams({ From: TWILIO_FROM, To: `whatsapp:${to}`, Body: body })

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    },
  )

  if (!res.ok) {
    const detail = await res.text()
    console.error('Twilio error:', detail)
    return NextResponse.json({ error: 'WhatsApp send failed', detail }, { status: 502 })
  }

  const result = await res.json()
  return NextResponse.json({ ok: true, sid: result.sid })
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Zap, AlertTriangle, CheckCircle, ChevronDown, Send } from 'lucide-react'

interface Snapshot {
  date: string
  hrv_ms: number | null
  sleep_hours: number | null
  sleep_score: number | null
  resting_hr: number | null
  steps: number | null
  deep_sleep_secs: number | null
  light_sleep_secs: number | null
  rem_sleep_secs: number | null
  body_battery_high: number | null
  body_battery_low: number | null
  avg_stress: number | null
}

interface Workout {
  date: string
  workout_type: string
  duration_mins: number | null
  avg_hr: number | null
  distance_km: number | null
}

interface InsightItem {
  title?: string
  insight: string
  recommendation?: string
  evidence: string[]
}

interface RawInsights {
  friction: InsightItem[]
  working?: InsightItem | null
  patterns?: InsightItem | null
}

interface CachedInsights {
  generated_at: string
  what_worked: string | null
  what_was_average: string | null
  warnings: string[]
  key_correlations: string[]
  raw: RawInsights | null
}

interface AnalyzeData {
  insights: CachedInsights | null
  snapshots: Snapshot[]
  workouts: Workout[]
}

export default function AnalyzePage() {
  const [data, setData] = useState<AnalyzeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function sendWhatsApp() {
    const insights = data?.insights
    if (!insights) return
    setSending(true)
    try {
      const res = await fetch('/api/notify/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: {
            what_worked: insights.what_worked ?? '',
            what_was_average: insights.what_was_average ?? '',
            warnings: insights.warnings ?? [],
          },
        }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Unknown error' }))
        alert(`Failed to send: ${error}`)
        return
      }
      setSent(true)
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/analyze').then(r => r.json()),
      fetch('/api/insights/status').then(r => r.json()),
    ])
      .then(([analyzeData, statusData]) => {
        if (analyzeData.error) throw new Error(analyzeData.error)
        setData({ ...analyzeData, insights: statusData.cached ?? null })
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const today = data?.snapshots?.[0]
  const raw = data?.insights?.raw ?? null
  const legacy = data?.insights

  const hasSleepStages = today && (today.deep_sleep_secs || today.light_sleep_secs || today.rem_sleep_secs)
// Use rich shape when available, fall back to legacy columns
const friction = raw?.friction ?? []
  const working = raw?.working ?? null
  const patterns = raw?.patterns ?? null
  // Legacy fallbacks when raw is absent
  const legacyNotices = (!raw && legacy?.warnings?.length) ? legacy.warnings : []

  return (
    <div className="flex flex-col min-h-screen pb-[calc(8rem+env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="px-5 pt-8 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-3">
            <LogoMark />
            <div>
              <p className="text-base font-bold text-gray-900 tracking-widest uppercase leading-none">Trace</p>
              <p className="text-[10px] text-gray-400 tracking-wider uppercase leading-none mt-1">Health Companion</p>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-5">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
      )}

      {error && (
        <div className="mx-5 mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-4 px-5">

          {/* ── NO INSIGHTS YET ── */}
          {!legacy && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-center">
              <p className="text-sm font-medium text-gray-500">No insights yet</p>
              <p className="text-xs text-gray-400 mt-1">Generate insights to see your analysis</p>
            </div>
          )}

          {/* ── WHAT WORKED WELL ── */}
          {(working?.insight || legacy?.what_worked) && (
            <InsightCard
              variant="green"
              icon={<CheckCircle size={13} className="text-green-600" />}
              label="What worked well"
              item={working ?? { insight: legacy!.what_worked!, evidence: [] }}
            />
          )}

          {/* ── WHAT WAS AVERAGE ── */}
          {(patterns?.insight || legacy?.what_was_average) && (
            <InsightCard
              variant="indigo"
              icon={<Zap size={13} className="text-indigo-500" />}
              label="What was average"
              item={patterns ?? { insight: legacy!.what_was_average!, evidence: [] }}
            />
          )}

          {/* ── WATCH OUT ── */}
          {friction.length > 0 && friction.map((item, i) => (
            <InsightCard key={i} variant="amber" icon={<AlertTriangle size={13} className="text-amber-500" />} label="Watch out" item={item} />
          ))}
          {friction.length === 0 && legacyNotices.map((w, i) => (
            <InsightCard key={i} variant="amber" icon={<AlertTriangle size={13} className="text-amber-500" />} label="Watch out" item={{ insight: w, evidence: [] }} />
          ))}

        </div>
      )}

      {/* ── WhatsApp sticky button ── */}
      {legacy && (
        <div className="fixed bottom-[calc(2rem+env(safe-area-inset-bottom))] left-0 right-0 z-40">
          <div className="max-w-md mx-auto px-5">
            {sent ? (
              <div className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-green-50 border border-green-200 shadow-2xl">
                <CheckCircle size={16} className="text-green-600" />
                <span className="text-sm font-semibold text-green-700">Sent via WhatsApp</span>
              </div>
            ) : (
              <button
                onClick={sendWhatsApp}
                disabled={sending}
                className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-gray-900 hover:bg-gray-800 active:scale-[0.98] text-white py-4 shadow-2xl transition-all disabled:opacity-50"
              >
                <Send size={18} />
                <span className="text-sm font-semibold tracking-wide">{sending ? 'Sending…' : 'Send via WhatsApp'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──

function LogoMark() {
  return (
    <div className="w-11 h-11 bg-gray-900 rounded-2xl flex items-center justify-center shrink-0 shadow-md">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
        <path d="M2 12h4l2-5 4 10 3-7 2 2h5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

type CardVariant = 'green' | 'blue' | 'amber' | 'indigo'

const variantStyles: Record<CardVariant, { border: string; bg: string; label: string; pill: string; rec: string; recLabel: string; recText: string; text: string }> = {
  green:  { border: 'border-green-200',  bg: 'bg-green-50',  label: 'text-green-600',  pill: 'bg-green-100 text-green-700',  rec: 'bg-green-100',  recLabel: 'text-green-600',  recText: 'text-green-800',  text: 'text-green-900'  },
  blue:   { border: 'border-blue-100',   bg: 'bg-blue-50',   label: 'text-blue-500',   pill: 'bg-blue-100 text-blue-600',    rec: 'bg-blue-100',   recLabel: 'text-blue-600',   recText: 'text-blue-800',   text: 'text-blue-900'   },
  amber:  { border: 'border-amber-200',  bg: 'bg-amber-50',  label: 'text-amber-600',  pill: 'bg-amber-100 text-amber-600',  rec: 'bg-amber-100',  recLabel: 'text-amber-700',  recText: 'text-amber-800',  text: 'text-amber-900'  },
  indigo: { border: 'border-indigo-100', bg: 'bg-indigo-50', label: 'text-indigo-500', pill: 'bg-indigo-100 text-indigo-600', rec: 'bg-indigo-100', recLabel: 'text-indigo-600', recText: 'text-indigo-800', text: 'text-indigo-900' },
}

function InsightCard({
  variant, icon, label, item, children,
}: {
  variant: CardVariant
  icon: React.ReactNode
  label: string
  item: InsightItem
  children?: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const s = variantStyles[variant]
  const hasDetail = !!(item.recommendation || (item.evidence && item.evidence.length > 0) || children)

  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
      {/* Header — always visible */}
      <button
        className="w-full text-left"
        onClick={() => hasDetail && setExpanded(v => !v)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {icon}
            <p className={`text-xs font-semibold ${s.label} uppercase tracking-widest`}>{label}</p>
          </div>
          {hasDetail && (
            <ChevronDown
              size={14}
              className={`${s.label} transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            />
          )}
        </div>
        {item.title && (
          <p className={`text-base font-semibold ${s.text} mt-1`}>{item.title}</p>
        )}
        {/* Insight — clamped when collapsed, full when expanded */}
        <p className={`text-sm ${s.text} leading-relaxed mt-1 ${!expanded ? 'line-clamp-2' : ''}`}>
          {item.insight}
        </p>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-2">
          {item.recommendation && (
            <div className={`${s.rec} rounded-lg px-3 py-2 mt-2`}>
              <p className={`text-xs font-semibold ${s.recLabel} mb-0.5`}>Try</p>
              <p className={`text-xs ${s.recText}`}>{item.recommendation}</p>
            </div>
          )}
          {item.evidence && item.evidence.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {item.evidence.map((e, i) => (
                <span key={i} className={`text-[11px] ${s.pill} px-2 py-0.5 rounded-full`}>{e}</span>
              ))}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  )
}

function SleepStagesBar({ deep, light, rem }: { deep: number; light: number; rem: number }) {
  const total = deep + light + rem
  if (total === 0) return null
  return (
    <div className="flex rounded-full overflow-hidden h-3 w-full gap-px">
      <div className="bg-indigo-500 rounded-l-full" style={{ width: `${(deep / total) * 100}%` }} />
      <div className="bg-blue-300" style={{ width: `${(light / total) * 100}%` }} />
      <div className="bg-violet-400 rounded-r-full" style={{ width: `${(rem / total) * 100}%` }} />
    </div>
  )
}


function fmtMins(secs: number): string {
  const m = Math.round(secs / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Zap, AlertTriangle, CheckCircle, GitBranch, ChevronDown, Send } from 'lucide-react'

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
  connections: InsightItem[]
  friction: InsightItem[]
  working?: InsightItem | null
  patterns?: InsightItem | null
  data_gaps: string[]
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
  const hasHRV = data && data.snapshots.filter(s => s.hrv_ms).length > 1

  // Use rich shape when available, fall back to legacy columns
  const connections = raw?.connections ?? []
  const friction = raw?.friction ?? []
  const working = raw?.working ?? null
  const patterns = raw?.patterns ?? null
  const dataGaps = raw?.data_gaps ?? (legacy?.key_correlations ?? [])

  // Legacy fallbacks when raw is absent
  const legacyNotices = (!raw && legacy?.warnings?.length) ? legacy.warnings : []

  return (
    <div className="flex flex-col min-h-screen pb-[calc(8rem+env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="px-5 pt-8 pb-4 flex items-center gap-3">
        <Link href="/" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Project Trace</p>
          <h1 className="text-xl font-bold text-gray-900">Analyze</h1>
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

          {/* ── NO INSIGHTS YET ── only when cache is truly empty ── */}
          {!legacy && !working && connections.length === 0 && friction.length === 0 && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-center">
              <p className="text-sm font-medium text-gray-500">No insights yet</p>
              <p className="text-xs text-gray-400 mt-1">Run <code className="bg-gray-100 px-1 rounded">python scripts/garmin_sync.py</code> to generate</p>
            </div>
          )}

          {/* ── WHAT'S WORKING ── */}
          {(working || legacy?.what_worked) && (
            <InsightCard
              variant="green"
              icon={<CheckCircle size={13} className="text-green-600" />}
              label="What's working"
              item={working ?? { insight: legacy!.what_worked!, evidence: [] }}
            >
              {hasSleepStages && today && (
                <div className="border-t border-green-200 pt-3 mt-3">
                  <SleepStagesBar
                    deep={today.deep_sleep_secs ?? 0}
                    light={today.light_sleep_secs ?? 0}
                    rem={today.rem_sleep_secs ?? 0}
                  />
                  <div className="flex gap-3 mt-2 text-xs text-green-700">
                    <span>Deep {fmtMins(today.deep_sleep_secs ?? 0)}</span>
                    <span>·</span>
                    <span>Light {fmtMins(today.light_sleep_secs ?? 0)}</span>
                    <span>·</span>
                    <span>REM {fmtMins(today.rem_sleep_secs ?? 0)}</span>
                    {today.sleep_score && <><span>·</span><span>Score {today.sleep_score}</span></>}
                  </div>
                </div>
              )}
            </InsightCard>
          )}

          {/* ── CONNECTIONS ── */}
          {connections.map((item, i) => (
            <InsightCard key={i} variant="blue" icon={<GitBranch size={13} className="text-blue-500" />} label="Connection" item={item} />
          ))}

          {/* ── FRICTION ── */}
          {friction.map((item, i) => (
            <InsightCard key={i} variant="amber" icon={<AlertTriangle size={13} className="text-amber-500" />} label="Friction" item={item} />
          ))}

          {/* ── LEGACY NOTICES (when no raw shape) ── */}
          {legacyNotices.map((w, i) => (
            <InsightCard
              key={i}
              variant="amber"
              icon={<AlertTriangle size={13} className="text-amber-500" />}
              label="Notice"
              item={{ insight: w, evidence: [] }}
            />
          ))}

          {/* ── HRV TREND — contextual ── */}
          {hasHRV && (
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">HRV — 14 day trend</p>
              <HRVSparkline snapshots={data.snapshots} />
              {today?.avg_stress != null && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex gap-4 text-xs text-gray-500">
                  <span>Avg stress today: <strong className="text-gray-800">{today.avg_stress}</strong>/100</span>
                  {today.resting_hr && <span>Resting HR: <strong className="text-gray-800">{today.resting_hr} bpm</strong></span>}
                </div>
              )}
            </div>
          )}

          {/* ── PATTERNS ── */}
          {(patterns || legacy?.what_was_average) && (
            <InsightCard
              variant="indigo"
              icon={<Zap size={13} className="text-indigo-500" />}
              label="14-day pattern"
              item={patterns ?? { insight: legacy!.what_was_average!, evidence: [] }}
            />
          )}

          {/* ── WORKOUTS + DATA GAPS ── */}
          {(data.workouts.length > 0 || dataGaps.length > 0) && (
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              {data.workouts.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Recent workouts</p>
                  <div className="flex flex-col divide-y divide-gray-50 mb-4">
                    {data.workouts.slice(0, 5).map((w, i) => (
                      <div key={i} className="flex items-center justify-between py-2">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{w.workout_type}</p>
                          <p className="text-xs text-gray-400">{w.date}</p>
                        </div>
                        <div className="text-right text-xs text-gray-500">
                          {w.duration_mins && <span>{w.duration_mins}min</span>}
                          {w.avg_hr && <span className="ml-2">{w.avg_hr} bpm</span>}
                          {w.distance_km && <span className="ml-2">{w.distance_km}km</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {dataGaps.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Data gaps</p>
                  <ul className="flex flex-col gap-1.5">
                    {dataGaps.map((g, i) => (
                      <li key={i} className="text-xs text-gray-400 flex gap-2">
                        <span className="shrink-0">·</span>
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

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

function HRVSparkline({ snapshots }: { snapshots: Snapshot[] }) {
  const valid = [...snapshots].reverse().filter(s => s.hrv_ms && s.hrv_ms > 0)
  if (valid.length < 2) return <p className="text-sm text-gray-400">Not enough HRV data yet</p>

  const vals = valid.map(s => s.hrv_ms as number)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const W = 300
  const H = 56
  const step = W / (vals.length - 1)

  const points = vals.map((v, i) => `${i * step},${H - ((v - min) / range) * H}`).join(' ')
  const latest = vals[vals.length - 1]
  const prev = vals[vals.length - 2]
  const trend = latest > prev ? 'up' : latest < prev ? 'down' : 'flat'

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900 tabular-nums">{latest}ms</span>
          <span className="text-xs text-gray-400">today</span>
        </div>
        <span className="flex items-center gap-1 text-xs text-gray-400">
          {trend === 'up' && <TrendingUp size={13} className="text-green-500" />}
          {trend === 'down' && <TrendingDown size={13} className="text-red-400" />}
          {trend === 'flat' && <Minus size={13} />}
          vs yesterday
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={(vals.length - 1) * step} cy={H - ((latest - min) / range) * H} r="4" fill="#6366f1" />
      </svg>
      <div className="flex justify-between text-[10px] text-gray-300 mt-1">
        <span>{valid[0].date.slice(5)}</span>
        <span>today</span>
      </div>
    </div>
  )
}

function fmtMins(secs: number): string {
  const m = Math.round(secs / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

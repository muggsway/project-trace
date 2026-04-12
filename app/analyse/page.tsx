'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react'

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
  calories_active: number | null
}

interface Insights {
  what_worked: string
  what_was_average: string
  warnings: string[]
  key_correlations: string[]
}

interface AnalyseData {
  insights: Insights
  snapshots: Snapshot[]
  workouts: Workout[]
}

export default function AnalysePage() {
  const [data, setData] = useState<AnalyseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/analyse')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setData(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const today = data?.snapshots?.[0]

  return (
    <div className="flex flex-col min-h-screen pb-16">
      {/* Header */}
      <div className="px-5 pt-8 pb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="w-11 h-11 bg-gray-900 rounded-2xl flex items-center justify-center shrink-0 shadow-md">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <path d="M2 12h4l2-5 4 10 3-7 2 2h5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-base font-bold text-gray-900 tracking-widest uppercase leading-none">Trace</p>
              <p className="text-[10px] text-gray-400 tracking-wider uppercase leading-none mt-1">Health Companion</p>
            </div>
          </div>
          <Link href="/" className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-full hover:bg-gray-200 transition-colors">
            <ArrowLeft size={12} />
            Back
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Analyse</h1>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-5">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Generating your insights…</p>
        </div>
      )}

      {error && (
        <div className="mx-5 mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {data && (
        <div className="flex flex-col gap-6 px-5">

          {/* ── TODAY'S STATS ── */}
          {today && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Today at a Glance</h2>
              <div className="grid grid-cols-2 gap-2">
                <StatCard label="HRV" value={today.hrv_ms != null ? `${today.hrv_ms}ms` : '—'} sub="last night avg" />
                <StatCard label="Sleep Score" value={today.sleep_score != null ? `${today.sleep_score}` : '—'} sub={today.sleep_hours != null ? `${today.sleep_hours}h total` : ''} />
                <StatCard label="Resting HR" value={today.resting_hr != null ? `${today.resting_hr} bpm` : '—'} sub="today" />
                <StatCard label="Stress" value={today.avg_stress != null ? `${today.avg_stress}` : '—'} sub="avg today (0–100)" />
              </div>
            </section>
          )}

          {/* ── SLEEP STAGES ── */}
          {today && (today.deep_sleep_secs || today.light_sleep_secs || today.rem_sleep_secs) ? (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Sleep Breakdown</h2>
              <div className="rounded-xl bg-white border border-gray-100 p-4">
                <SleepStagesBar
                  deep={today.deep_sleep_secs ?? 0}
                  light={today.light_sleep_secs ?? 0}
                  rem={today.rem_sleep_secs ?? 0}
                />
                <div className="flex gap-4 mt-3 justify-center text-xs">
                  <LegendDot color="bg-indigo-500" label={`Deep ${fmtMins(today.deep_sleep_secs ?? 0)}`} />
                  <LegendDot color="bg-blue-400" label={`Light ${fmtMins(today.light_sleep_secs ?? 0)}`} />
                  <LegendDot color="bg-violet-400" label={`REM ${fmtMins(today.rem_sleep_secs ?? 0)}`} />
                </div>
              </div>
            </section>
          ) : null}

          {/* ── HRV 14-DAY TREND ── */}
          {data.snapshots.length > 1 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">HRV — 14 Day Trend</h2>
              <div className="rounded-xl bg-white border border-gray-100 p-4">
                <HRVSparkline snapshots={data.snapshots} />
              </div>
            </section>
          )}

          {/* ── RECENT WORKOUTS ── */}
          {data.workouts.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Recent Workouts</h2>
              <div className="flex flex-col gap-2">
                {data.workouts.slice(0, 6).map((w, i) => (
                  <div key={i} className="rounded-xl bg-white border border-gray-100 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{w.workout_type}</p>
                      <p className="text-xs text-gray-400">{w.date}</p>
                    </div>
                    <div className="text-right text-xs text-gray-500 space-y-0.5">
                      {w.duration_mins && <p>{w.duration_mins}min</p>}
                      {w.avg_hr && <p>avg {w.avg_hr} bpm</p>}
                      {w.distance_km && <p>{w.distance_km}km</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── INSIGHTS ── */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Insights</h2>
            <div className="flex flex-col gap-3">

              {data.insights.what_worked && (
                <InsightCard
                  emoji="🟢"
                  label="What worked"
                  text={data.insights.what_worked}
                  borderColor="border-green-200"
                  bg="bg-green-50"
                  textColor="text-green-900"
                />
              )}

              {data.insights.what_was_average && (
                <InsightCard
                  emoji="🟡"
                  label="What was average"
                  text={data.insights.what_was_average}
                  borderColor="border-amber-200"
                  bg="bg-amber-50"
                  textColor="text-amber-900"
                />
              )}

              {data.insights.warnings?.map((w, i) => (
                <InsightCard
                  key={i}
                  emoji="⚠️"
                  label="Watch out"
                  text={w}
                  borderColor="border-red-200"
                  bg="bg-red-50"
                  textColor="text-red-900"
                />
              ))}

              {data.insights.key_correlations?.length > 0 && (
                <div className="rounded-xl bg-white border border-gray-100 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Patterns across 14 days</p>
                  <ul className="flex flex-col gap-2">
                    {data.insights.key_correlations.map((c, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-700">
                        <span className="mt-0.5 text-gray-300">→</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          </section>

        </div>
      )}
    </div>
  )
}

// ── Sub-components ──

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 px-4 py-3">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function InsightCard({ emoji, label, text, borderColor, bg, textColor }: {
  emoji: string; label: string; text: string
  borderColor: string; bg: string; textColor: string
}) {
  return (
    <div className={`rounded-xl border ${borderColor} ${bg} px-4 py-3`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{emoji} {label}</p>
      <p className={`text-sm ${textColor}`}>{text}</p>
    </div>
  )
}

function SleepStagesBar({ deep, light, rem }: { deep: number; light: number; rem: number }) {
  const total = deep + light + rem
  if (total === 0) return null
  const deepPct = (deep / total) * 100
  const lightPct = (light / total) * 100
  const remPct = (rem / total) * 100
  return (
    <div className="flex rounded-full overflow-hidden h-4 w-full gap-0.5">
      <div className="bg-indigo-500 rounded-l-full" style={{ width: `${deepPct}%` }} />
      <div className="bg-blue-400" style={{ width: `${lightPct}%` }} />
      <div className="bg-violet-400 rounded-r-full" style={{ width: `${remPct}%` }} />
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1 text-gray-500">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  )
}

function HRVSparkline({ snapshots }: { snapshots: Snapshot[] }) {
  const valid = [...snapshots].reverse().filter(s => s.hrv_ms != null)
  if (valid.length < 2) return <p className="text-sm text-gray-400">Not enough data yet</p>

  const vals = valid.map(s => s.hrv_ms as number)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const W = 300
  const H = 60
  const step = W / (vals.length - 1)

  const points = vals.map((v, i) => {
    const x = i * step
    const y = H - ((v - min) / range) * H
    return `${x},${y}`
  }).join(' ')

  const latest = vals[vals.length - 1]
  const prev = vals[vals.length - 2]
  const trend = latest > prev ? 'up' : latest < prev ? 'down' : 'flat'

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl font-bold text-gray-900 tabular-nums">{latest}ms</span>
        <span className="flex items-center gap-1 text-xs text-gray-400">
          {trend === 'up' && <TrendingUp size={14} className="text-green-500" />}
          {trend === 'down' && <TrendingDown size={14} className="text-red-400" />}
          {trend === 'flat' && <Minus size={14} />}
          vs yesterday
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke="#6366f1"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Today's dot */}
        <circle
          cx={(vals.length - 1) * step}
          cy={H - ((latest - min) / range) * H}
          r="4"
          fill="#6366f1"
        />
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

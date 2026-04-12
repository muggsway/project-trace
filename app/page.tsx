'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, Dumbbell, PenLine, BarChart2, ChevronRight, Droplets, Pill,
  Timer, MapPin, Heart, Flame, Moon, Activity, Footprints, Brain,
  AlertTriangle, ChevronDown, ChevronUp, Utensils, CalendarCheck,
} from 'lucide-react'
import VoiceOverlay from '@/components/VoiceOverlay'
import WorkoutGeneratorModal from '@/components/WorkoutGeneratorModal'
import { dummyTrackerSnapshot, dummyWorkout, dummyEntries } from '@/lib/dummy-data'
import { TrackerSnapshot, Workout, JournalEntry, Macros } from '@/lib/types'
import { formatDate } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PlannedWorkout {
  id: string
  workout_type: string
  duration_mins: number
  muscles: string[] | null
  intensity_zone: number | null
  plan_text: string
  scheduled_date: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const POSITIVE_WORDS = ['good', 'great', 'happy', 'energized', 'focused', 'calm',
  'motivated', 'excellent', 'positive', 'productive', 'refreshed', 'strong', 'amazing', 'upbeat']
const NEGATIVE_WORDS = ['sluggish', 'tired', 'stressed', 'anxious', 'sad', 'bad', 'low',
  'exhausted', 'depressed', 'irritable', 'awful', 'terrible', 'fatigued', 'drained', 'rough']

function getMoodColor(text: string): 'green' | 'yellow' | 'red' {
  const lower = text.toLowerCase()
  if (NEGATIVE_WORDS.some(w => lower.includes(w))) return 'red'
  if (POSITIVE_WORDS.some(w => lower.includes(w))) return 'green'
  return 'yellow'
}

// Shorten supplement/food names: take first meaningful word, strip filler words
function shortenName(name: string): string {
  const fillers = ['supplement', 'capsule', 'tablet', 'powder', 'extract', 'complex', 'formula']
  const words = name.split(/\s+/)
  const meaningful = words.filter(w => !fillers.includes(w.toLowerCase()))
  return meaningful.slice(0, 2).join(' ')
}

// Safe % delta — guards against 0/null/string-zero avg (no infinity)
function pctDelta(value: number | null | undefined, avg: number | null | undefined): number | null {
  const v = Number(value)
  const a = Number(avg)
  if (!v || !a || a === 0 || !isFinite(v / a)) return null
  return Math.round(((v - a) / a) * 100)
}

// Tile traffic-light color based on delta + direction
function tileColor(delta: number | null, higherIsBetter: boolean): 'green' | 'yellow' | 'red' | 'neutral' {
  if (delta == null) return 'neutral'
  const good = higherIsBetter ? delta : -delta
  if (good >= -5) return 'green'
  if (good >= -15) return 'yellow'
  return 'red'
}

const TILE_STYLES = {
  green:   { bg: 'bg-green-50',  border: 'border-green-200',  val: 'text-green-900',  delta: 'text-green-600'  },
  yellow:  { bg: 'bg-yellow-50', border: 'border-yellow-200', val: 'text-yellow-900', delta: 'text-yellow-600' },
  red:     { bg: 'bg-red-50',    border: 'border-red-200',    val: 'text-red-900',    delta: 'text-red-600'    },
  neutral: { bg: 'bg-gray-50',   border: 'border-transparent', val: 'text-gray-900',  delta: 'text-gray-400'   },
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionCard({ title, icon, iconBg = 'bg-gray-100', iconColor = 'text-gray-500', children }: {
  title: string; icon: React.ReactNode; iconBg?: string; iconColor?: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
      <div className="px-4 pt-3.5 pb-2.5 flex items-center gap-2.5 border-b border-gray-50">
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
          <span className={iconColor}>{icon}</span>
        </div>
        <h2 className="text-xs font-semibold text-gray-700 tracking-tight">{title}</h2>
      </div>
      <div className="px-4 pb-4 pt-3 flex flex-col gap-2">{children}</div>
    </div>
  )
}

function MetricTile({ label, value, unit, icon, delta, higherIsBetter }: {
  label: string; value: string | number | null; unit?: string
  icon: React.ReactNode; delta?: number | null; higherIsBetter?: boolean
}) {
  const color = tileColor(delta ?? null, higherIsBetter ?? true)
  const s = TILE_STYLES[color]
  return (
    <div className={`flex-1 rounded-xl border px-3 py-3 ${s.bg} ${s.border}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-gray-400 opacity-70">{icon}</span>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      </div>
      <div className="flex items-end gap-1">
        <span className={`text-xl font-bold leading-none ${s.val}`}>{value ?? '—'}</span>
        {unit && value != null && <span className={`text-xs mb-0.5 ${s.delta}`}>{unit}</span>}
      </div>
      {delta != null && (
        <p className={`text-[10px] mt-1 font-medium ${s.delta}`}>
          {delta > 0 ? '+' : ''}{delta}% vs avg
        </p>
      )}
    </div>
  )
}

function CaloriesCircle({ calories, goal = 2000 }: { calories: number; goal?: number }) {
  const pct = Math.min(calories / goal, 1)
  const r = 22, circ = 2 * Math.PI * r
  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#f3f4f6" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none"
          stroke={pct >= 1 ? '#f59e0b' : '#111827'} strokeWidth="6"
          strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] font-bold text-gray-900 leading-none">{calories > 0 ? calories : '—'}</span>
        <span className="text-[9px] text-gray-400">kcal</span>
      </div>
    </div>
  )
}

function MacroRow({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-xs font-bold ${color}`}>{value > 0 ? value.toFixed(0) : '—'}</span>
      <span className="text-[10px] text-gray-400">{unit} {label}</span>
    </div>
  )
}

function WorkoutMiniCard({ workout }: { workout: Workout }) {
  const icon = workout.workout_type?.toLowerCase().includes('run') ? '🏃' : workout.workout_type?.toLowerCase().includes('swim') ? '🏊' : workout.workout_type?.toLowerCase().includes('cycl') ? '🚴' : '💪'
  const wDate = (workout.started_at || '').slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const diff = Math.round((new Date(today).getTime() - new Date(wDate).getTime()) / 86400000)
  const dateLabel = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : `${diff}d ago`
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-base">{icon}</span>
          <span className="text-xs font-semibold text-gray-700 capitalize">{workout.workout_type}</span>
        </div>
        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{dateLabel}</span>
      </div>
      <div className="flex gap-3">
        <div className="flex items-center gap-1 text-[10px] text-gray-500"><Timer size={10} />{workout.duration_mins}m</div>
        {workout.distance_km != null && <div className="flex items-center gap-1 text-[10px] text-gray-500"><MapPin size={10} />{workout.distance_km}km</div>}
        {workout.avg_hr != null && <div className="flex items-center gap-1 text-[10px] text-gray-500"><Heart size={10} className="text-red-400" />{workout.avg_hr}bpm</div>}
        {workout.calories_active != null && <div className="flex items-center gap-1 text-[10px] text-gray-500"><Flame size={10} className="text-orange-400" />{workout.calories_active}kcal</div>}
      </div>
    </div>
  )
}

function WarningsBanner({ warnings }: { warnings: string[] }) {
  const [expanded, setExpanded] = useState(false)
  if (warnings.length === 0) return null
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <AlertTriangle size={15} className="text-amber-600 shrink-0" />
        <span className="text-sm font-semibold text-amber-800 flex-1">
          {warnings.length} active {warnings.length === 1 ? 'warning' : 'warnings'}
        </span>
        {expanded ? <ChevronUp size={15} className="text-amber-500" /> : <ChevronDown size={15} className="text-amber-500" />}
      </button>
      {expanded && (
        <div className="border-t border-amber-200 divide-y divide-amber-100">
          {warnings.map((w, i) => (
            <div key={i} className="px-4 py-3 flex gap-3">
              <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-900 leading-relaxed">{w}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// App logo mark — ECG pulse line in a dark rounded square
function LogoMark() {
  return (
    <div className="w-9 h-9 bg-gray-900 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M2 12h4l2-5 4 10 3-7 2 2h5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

// Caricature SVG avatar
function Avatar() {
  return (
    <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-gray-200 bg-amber-100 shrink-0">
      <svg viewBox="0 0 40 40" width="36" height="36">
        <circle cx="20" cy="20" r="20" fill="#fef3c7" />
        <ellipse cx="20" cy="13" rx="9" ry="8" fill="#92400e" />
        <ellipse cx="20" cy="10" rx="9" ry="5" fill="#92400e" />
        <circle cx="20" cy="17" r="8" fill="#fcd34d" />
        <circle cx="17" cy="16" r="1.5" fill="#1f2937" />
        <circle cx="23" cy="16" r="1.5" fill="#1f2937" />
        <path d="M17 20 Q20 23 23 20" stroke="#92400e" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <ellipse cx="20" cy="34" rx="10" ry="8" fill="#6d28d9" />
      </svg>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [showVoice, setShowVoice] = useState(false)
  const [showWorkoutGenerator, setShowWorkoutGenerator] = useState(false)
  const [showActionMenu, setShowActionMenu] = useState(false)

  const [snap, setSnap] = useState<TrackerSnapshot>(dummyTrackerSnapshot)
  const [recentWorkouts, setRecentWorkouts] = useState<Workout[]>([dummyWorkout])
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>([])
  const [entries, setEntries] = useState<JournalEntry[]>(dummyEntries)
  const [warnings, setWarnings] = useState<string[]>([])

  const fetchPlanned = useCallback(async () => {
    try {
      const res = await fetch('/api/workout/planned')
      if (res.ok) setPlannedWorkouts(await res.json())
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(d => { if (d.snapshot) setSnap(d.snapshot) }).catch(() => {})
    fetch('/api/workout/recent').then(r => r.json()).then(d => { if (Array.isArray(d) && d.length) setRecentWorkouts(d) }).catch(() => {})
    fetch('/api/journal/today').then(r => r.json()).then(d => { if (Array.isArray(d)) setEntries(d) }).catch(() => {})
    fetch('/api/warnings').then(r => r.json()).then(d => { if (Array.isArray(d.warnings)) setWarnings(d.warnings) }).catch(() => {})
    fetchPlanned()
  }, [fetchPlanned])

  // ── Derived: Body Metrics ──────────────────────────────────────────────────

  const hrv_delta   = pctDelta(snap.hrv_ms, snap.hrv_avg_14d)
  const sleep_delta = pctDelta(snap.sleep_hours, snap.sleep_avg_14d)
  const steps_delta = pctDelta(snap.steps, snap.steps_avg_14d)
  const hr_delta    = pctDelta(snap.resting_hr, snap.resting_hr_avg_30d)

  // ── Derived: Nutrition ─────────────────────────────────────────────────────

  const foodEntries = entries.filter(e => e.entry_type === 'food' && e.macros)
  const totals: Macros = foodEntries.reduce(
    (acc, e) => ({
      calories:  acc.calories  + (e.macros?.calories  ?? 0),
      protein_g: acc.protein_g + (e.macros?.protein_g ?? 0),
      carbs_g:   acc.carbs_g   + (e.macros?.carbs_g   ?? 0),
      fat_g:     acc.fat_g     + (e.macros?.fat_g     ?? 0),
      fibre_g:   (acc.fibre_g  ?? 0) + (e.macros?.fibre_g ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 }
  )

  const supplementEntries = entries.filter(e => e.entry_type === 'supplement')

  const waterEntries = entries.filter(
    e => e.entry_type === 'drink' && e.description.toLowerCase().includes('water')
  )
  const waterLitres = (() => {
    let total = 0
    for (const e of waterEntries) {
      const q = (e.quantity ?? '').toLowerCase()
      const ml  = q.match(/(\d+\.?\d*)\s*ml/)
      const l   = q.match(/(\d+\.?\d*)\s*l[^a-z]/)
      const cup = q.match(/(\d+\.?\d*)\s*(cup|glass|bottle)/)
      if (ml) total += parseFloat(ml[1]) / 1000
      else if (l) total += parseFloat(l[1])
      else if (cup) total += parseFloat(cup[1]) * 0.25
      else total += 0.25
    }
    return Math.round(total * 10) / 10
  })()

  // ── Derived: Mood ──────────────────────────────────────────────────────────

  const moodEntries = entries.filter(e => e.entry_type === 'mood')
    .sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime())
  const latestMood = moodEntries[0] ?? null
  const moodColor  = latestMood ? getMoodColor(latestMood.description) : null
  const moodStyles = {
    green:  { bg: 'bg-green-50',  border: 'border-green-200',  dot: 'bg-green-500',  text: 'text-green-800'  },
    yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', dot: 'bg-yellow-400', text: 'text-yellow-800' },
    red:    { bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500',    text: 'text-red-800'    },
  }
  const ms = moodColor ? moodStyles[moodColor] : null
  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      <div className="flex flex-col min-h-dvh pb-[calc(7rem+env(safe-area-inset-bottom))]">

        {/* Header */}
        <div className="px-5 pt-8 pb-5">
          <div className="flex items-center justify-between mb-4">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <LogoMark />
              <div>
                <p className="text-[11px] font-bold text-gray-900 tracking-widest uppercase leading-none">Trace</p>
                <p className="text-[9px] text-gray-400 tracking-wider uppercase leading-none mt-0.5">Health Journal</p>
              </div>
            </div>
            {/* Avatar + Analyse */}
            <div className="flex items-center gap-2">
              <Link href="/analyse" className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-full hover:bg-gray-200 transition-colors">
                <BarChart2 size={12} />
                Analyse
              </Link>
              <Avatar />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{formatDate(new Date().toISOString())}</h1>
        </div>

        <div className="flex flex-col gap-3 px-5">

          {/* Warnings banner */}
          <WarningsBanner warnings={warnings} />

          {/* ── 1. Body Metrics ───────────────────────────────────────────── */}
          <SectionCard title="Body Metrics" icon={<Activity size={13} />} iconBg="bg-blue-50" iconColor="text-blue-500">
            <div className="flex gap-2">
              <MetricTile label="HRV" value={snap.hrv_ms ?? null} unit="ms"
                icon={<Activity size={11} />} delta={hrv_delta} higherIsBetter={true} />
              <MetricTile label="Sleep" value={snap.sleep_hours ? snap.sleep_hours.toFixed(1) : null} unit="h"
                icon={<Moon size={11} />} delta={sleep_delta} higherIsBetter={true} />
            </div>
            <div className="flex gap-2">
              <MetricTile label="Steps" value={snap.steps ? snap.steps.toLocaleString() : null}
                icon={<Footprints size={11} />} delta={steps_delta} higherIsBetter={true} />
              <MetricTile label="Resting HR" value={snap.resting_hr ?? null} unit="bpm"
                icon={<Heart size={11} />} delta={hr_delta} higherIsBetter={false} />
            </div>
          </SectionCard>

          {/* ── 2. Nutrition ──────────────────────────────────────────────── */}
          <SectionCard title="Nutrition" icon={<Utensils size={13} />} iconBg="bg-amber-50" iconColor="text-amber-500">
            <Link href="/food" className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-3 flex items-center gap-3 active:scale-[0.99] transition-all">
              <CaloriesCircle calories={totals.calories} />
              <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1.5">
                <MacroRow label="Protein" value={totals.protein_g} unit="g" color="text-blue-600" />
                <MacroRow label="Carbs"   value={totals.carbs_g}   unit="g" color="text-amber-600" />
                <MacroRow label="Fat"     value={totals.fat_g}     unit="g" color="text-orange-500" />
                <MacroRow label="Fibre"   value={totals.fibre_g ?? 0} unit="g" color="text-green-600" />
              </div>
              <ChevronRight size={14} className="text-gray-300 shrink-0" />
            </Link>
          </SectionCard>

          {/* ── 3. Supplements + Hydration (side by side) ─────────────────── */}
          <div className="flex gap-3">
            {/* Supplements */}
            <div className="flex-1 rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
              <div className="px-3 pt-3 pb-2.5 flex items-center gap-2 border-b border-gray-50">
                <div className="w-6 h-6 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                  <Pill size={12} className="text-purple-500" />
                </div>
                <h2 className="text-xs font-semibold text-gray-700 tracking-tight">Supplements</h2>
              </div>
              <div className="px-3 pt-2.5 pb-3">
                {supplementEntries.length === 0 ? (
                  <p className="text-xs text-gray-400">None logged</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {supplementEntries.map(e => (
                      <div key={e.id} className="flex items-baseline gap-1">
                        <span className="text-[11px] font-medium text-purple-700">{shortenName(e.description)}</span>
                        {e.quantity && (
                          <span className="text-[10px] text-gray-400">{e.quantity}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Hydration */}
            <div className="flex-1 rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
              <div className="px-3 pt-3 pb-2.5 flex items-center gap-2 border-b border-gray-50">
                <div className="w-6 h-6 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
                  <Droplets size={12} className="text-sky-500" />
                </div>
                <h2 className="text-xs font-semibold text-gray-700 tracking-tight">Hydration</h2>
              </div>
              <div className="px-3 pt-2.5 pb-3">
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-lg font-bold text-gray-900">{waterLitres > 0 ? waterLitres : '0'}</span>
                  <span className="text-xs text-gray-400">/ 3L</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(waterLitres / 3, 1) * 100}%`, backgroundColor: waterLitres >= 3 ? '#22c55e' : '#38bdf8' }} />
                </div>
              </div>
            </div>
          </div>

          {/* ── 3. Workout ────────────────────────────────────────────────── */}
          <SectionCard title="Workout" icon={<Dumbbell size={13} />} iconBg="bg-red-50" iconColor="text-red-500">
            {recentWorkouts.length > 0
              ? recentWorkouts.map(w => <WorkoutMiniCard key={w.id} workout={w} />)
              : <p className="text-xs text-gray-400 px-1">No recent workouts</p>
            }

            {plannedWorkouts.length > 0 ? (
              plannedWorkouts.map(pw => (
                <div key={pw.id} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <CalendarCheck size={13} className="text-amber-600" />
                      <span className="text-xs font-semibold text-gray-800 capitalize">{pw.workout_type}</span>
                    </div>
                    <span className="text-[10px] text-amber-600 font-medium bg-amber-100 px-1.5 py-0.5 rounded-full">
                      {pw.scheduled_date === today ? 'Today' : 'Tomorrow'}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 pl-5">
                    {pw.duration_mins}min · {pw.muscles?.join(', ') ?? `Zone ${pw.intensity_zone}`}
                  </p>
                </div>
              ))
            ) : (
              <button
                onClick={() => setShowWorkoutGenerator(true)}
                className="rounded-xl border border-dashed border-gray-200 px-3 py-3 flex items-center gap-2 text-xs text-gray-500 hover:bg-gray-50 transition-colors w-full"
              >
                <Dumbbell size={13} className="text-gray-300" />
                Plan a new workout
              </button>
            )}
          </SectionCard>

          {/* ── 4. Mental Health ──────────────────────────────────────────── */}
          <SectionCard title="Mental Health" icon={<Brain size={13} />} iconBg="bg-violet-50" iconColor="text-violet-500">
            {latestMood && ms ? (
              <div className={`rounded-xl px-4 py-3 flex items-center gap-3 border ${ms.bg} ${ms.border}`}>
                <div className={`w-3 h-3 rounded-full shrink-0 ${ms.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${ms.text}`}>{latestMood.description}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(latestMood.logged_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowVoice(true)}
                className="rounded-xl border border-dashed border-gray-200 px-4 py-3 flex items-center gap-2 text-xs text-gray-400 hover:bg-gray-50 transition-colors w-full">
                <Brain size={13} className="text-gray-300" />
                Log your mood with voice
              </button>
            )}
          </SectionCard>

        </div>
      </div>

      {/* ── FAB ─────────────────────────────────────────────────────────────── */}
      <div className="fixed bottom-[calc(2rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 flex items-center gap-3">
        {showActionMenu && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            <button onClick={() => { setShowActionMenu(false); setShowWorkoutGenerator(true) }}
              className="flex items-center gap-2 bg-white border border-gray-200 shadow-lg rounded-2xl px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50 active:scale-95 transition-all whitespace-nowrap">
              <Dumbbell size={16} className="text-gray-600" />Plan a new workout
            </button>
            <button onClick={() => { setShowActionMenu(false); setShowVoice(true) }}
              className="flex items-center gap-2 bg-white border border-gray-200 shadow-lg rounded-2xl px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50 active:scale-95 transition-all whitespace-nowrap">
              <PenLine size={16} className="text-gray-600" />Log entry
            </button>
          </div>
        )}
        <button onClick={() => setShowActionMenu(v => !v)}
          className={`w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-all active:scale-95 ${showActionMenu ? 'bg-gray-200 rotate-45' : 'bg-gray-900 hover:bg-gray-800'}`}>
          <Plus size={26} className={showActionMenu ? 'text-gray-700' : 'text-white'} />
        </button>
      </div>

      {showActionMenu && <div className="fixed inset-0 z-30" onClick={() => setShowActionMenu(false)} />}
      {showVoice && (
        <VoiceOverlay
          onClose={() => setShowVoice(false)}
          onResult={async (transcript) => {
            setShowVoice(false)
            try {
              const res = await fetch('/api/log/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript }),
              })
              if (res.ok) {
                // Refresh entries from DB so nutrition updates immediately
                fetch('/api/journal/today').then(r => r.json()).then(d => { if (Array.isArray(d)) setEntries(d) }).catch(() => {})
              }
            } catch { /* non-critical */ }
          }}
        />
      )}
      {showWorkoutGenerator && (
        <WorkoutGeneratorModal
          onClose={() => setShowWorkoutGenerator(false)}
          onSaved={() => { fetchPlanned(); setShowWorkoutGenerator(false) }}
        />
      )}
    </>
  )
}

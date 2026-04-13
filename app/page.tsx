'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Dumbbell, BarChart2, Droplets, Pill,
  Timer, MapPin, Heart, Flame, Moon, Activity, Footprints, Brain,
  AlertTriangle, ChevronDown, ChevronUp, Utensils, CalendarCheck, ClipboardList,
  Wheat, Droplet, Leaf, Plus, X, CheckCircle,
} from 'lucide-react'
import VoiceOverlay from '@/components/VoiceOverlay'
import WorkoutGeneratorModal from '@/components/WorkoutGeneratorModal'
import LogTimeline from '@/components/LogTimeline'
import { dummyTrackerSnapshot, dummyWorkout } from '@/lib/dummy-data'
import { TrackerSnapshot, Workout, JournalEntry, Macros } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { useEntries } from '@/lib/entries-context'

// ── Types ──────────────────────────────────────────────────────────────────────

interface StrengthExercise { name: string; sets?: number; reps?: number | string; rest_secs?: number; tip?: string; duration?: string }
interface RunSegment { name: string; duration_mins: number; zone?: number; description?: string }
interface PlanJson {
  warmup?: StrengthExercise[]
  main?: StrengthExercise[]
  cooldown?: StrengthExercise[]
  segments?: RunSegment[]
  target_hr_note?: string
}
interface PlannedWorkout {
  id: string
  workout_type: string
  duration_mins: number
  muscles: string[] | null
  intensity_zone: number | null
  plan_text: string
  plan_json: PlanJson | null
  scheduled_date: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const NEGATION = /\b(not|don't|dont|didn't|didnt|never|can't|cant|no longer)\b/i

const MOOD_MAP: { keywords: string[]; emoji: string; color: 'green' | 'yellow' | 'red' }[] = [
  { keywords: ['happy', 'great', 'amazing', 'fantastic', 'excellent', 'wonderful', 'awesome', 'good', 'well'], emoji: '😊', color: 'green'  },
  { keywords: ['energized', 'energetic', 'motivated', 'strong', 'pumped', 'upbeat', 'productive'],   emoji: '⚡', color: 'green'  },
  { keywords: ['calm', 'relaxed', 'peaceful', 'refreshed', 'rested', 'balanced', 'centered'],        emoji: '😌', color: 'green'  },
  { keywords: ['focused', 'sharp', 'clear', 'alert', 'present'],                                     emoji: '🎯', color: 'green'  },
  { keywords: ['okay', 'fine', 'alright', 'decent', 'neutral', 'average', 'normal'],                 emoji: '🙂', color: 'yellow' },
  { keywords: ['tired', 'exhausted', 'fatigued', 'drained', 'sleepy', 'groggy'],                     emoji: '😴', color: 'red'    },
  { keywords: ['stressed', 'overwhelmed', 'anxious', 'worried', 'nervous', 'tense'],                 emoji: '😤', color: 'red'    },
  { keywords: ['sad', 'down', 'depressed', 'low', 'unhappy', 'miserable', 'upset'],                  emoji: '😔', color: 'red'    },
  { keywords: ['sick', 'unwell', 'ill', 'nauseous', 'rough', 'awful', 'terrible', 'sluggish'],       emoji: '🤒', color: 'red'    },
  { keywords: ['irritable', 'frustrated', 'angry', 'annoyed'],                                        emoji: '😠', color: 'red'    },
]

function getMoodMeta(text: string): { emoji: string; color: 'green' | 'yellow' | 'red' } {
  const lower = text.toLowerCase()
  // Find the keyword that appears earliest in the sentence — that's the primary mood signal
  let best: { emoji: string; color: 'green' | 'yellow' | 'red'; idx: number } | null = null
  for (const bucket of MOOD_MAP) {
    for (const kw of bucket.keywords) {
      const idx = lower.indexOf(kw)
      if (idx === -1) continue
      if (best !== null && idx >= best.idx) continue
      const before = lower.slice(Math.max(0, idx - 20), idx)
      const negated = NEGATION.test(before)
      if (negated) {
        best = { emoji: '😔', color: 'red', idx }
      } else {
        best = { emoji: bucket.emoji, color: bucket.color, idx }
      }
    }
  }
  return best ?? { emoji: '🙂', color: 'yellow' }
}

// Shorten supplement names: strip parentheticals, form suffixes, and filler words
function shortenName(name: string): string {
  const fillers = new Set(['supplement', 'capsule', 'tablet', 'powder', 'extract', 'complex', 'formula',
    'glycinate', 'sulfate', 'gluconate', 'citrate', 'bisglycinate', 'monohydrate', 'oxide', 'chloride',
    'malate', 'fumarate', 'picolinate', 'orotate', 'threonate'])
  // Strip anything in parentheses
  const stripped = name.replace(/\s*\(.*?\)/g, '').trim()
  const words = stripped.split(/\s+/)
  const meaningful = words.filter(w => !fillers.has(w.toLowerCase()))
  return meaningful.slice(0, 2).join(' ') || name
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

function SectionCard({ title, icon, iconBg = 'bg-gray-100', iconColor = 'text-gray-500', right, children }: {
  title: string; icon: React.ReactNode; iconBg?: string; iconColor?: string; right?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
      <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between border-b border-gray-50">
        <div className="flex items-center gap-2.5">
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
            <span className={iconColor}>{icon}</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        </div>
        {right}
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
    <div className="relative w-16 h-16 shrink-0 hidden">
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

function MacroStat({ label, value, icon, iconBg }: { label: string; value: number; icon: React.ReactNode; iconBg: string }) {
  const display = value > 0 ? (value % 1 === 0 ? value : parseFloat(value.toFixed(1))) : '—'
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${iconBg}`}>
        {icon}
      </div>
      <span className="text-sm font-bold text-gray-900 tabular-nums">{display}{value > 0 ? ' g' : ''}</span>
      <span className="text-[10px] text-gray-500">{label}</span>
    </div>
  )
}

function JournalWorkoutCard({ entry }: { entry: JournalEntry }) {
  const lower = entry.description.toLowerCase()
  const icon = lower.includes('run') || lower.includes('jog') ? '🏃'
    : lower.includes('swim') ? '🏊'
    : lower.includes('cycl') || lower.includes('bike') ? '🚴'
    : lower.includes('yoga') ? '🧘'
    : lower.includes('walk') ? '🚶'
    : '💪'
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-3 flex items-center gap-3">
      <span className="text-base shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-700 capitalize truncate">{entry.description}</p>
        {entry.quantity && <p className="text-[10px] text-gray-400 mt-0.5">{entry.quantity}</p>}
      </div>
      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">Today</span>
    </div>
  )
}

function WorkoutMiniCard({ workout, onClick }: { workout: Workout; onClick?: () => void }) {
  const icon = workout.workout_type?.toLowerCase().includes('run') ? '🏃' : workout.workout_type?.toLowerCase().includes('swim') ? '🏊' : workout.workout_type?.toLowerCase().includes('cycl') ? '🚴' : '💪'
  const wDate = (workout.started_at || '').slice(0, 10)
  const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const diff = Math.round((new Date(today).getTime() - new Date(wDate).getTime()) / 86400000)
  const dateLabel = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : `${diff}d ago`
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      {...(onClick ? { onClick } : {})}
      className={`w-full text-left rounded-xl bg-gray-50 border border-gray-100 px-3 py-3 flex flex-col gap-2${onClick ? ' hover:bg-gray-100 active:scale-[0.98] transition-all' : ''}`}
    >
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
        {workout.muscles?.length ? <div className="flex items-center gap-1 text-[10px] text-gray-500 truncate">{workout.muscles.join(', ')}</div> : null}
      </div>
    </Wrapper>
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
    <div className="w-11 h-11 bg-gray-900 rounded-2xl flex items-center justify-center shrink-0 shadow-md">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
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
  const [expandedPlan, setExpandedPlan] = useState<PlannedWorkout | null>(null)
  const [completedView, setCompletedView] = useState<Workout | null>(null)

  const { entries, addEntries, waterMl, addWaterMl } = useEntries()
  const [snap, setSnap] = useState<TrackerSnapshot>(dummyTrackerSnapshot)
  const [recentWorkouts, setRecentWorkouts] = useState<Workout[]>([dummyWorkout])
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>([])
  const [warnings, setWarnings] = useState<string[]>([])

  const fetchPlanned = useCallback(async () => {
    try {
      const ld = new Date()
      const localToday = `${ld.getFullYear()}-${String(ld.getMonth()+1).padStart(2,'0')}-${String(ld.getDate()).padStart(2,'0')}`
      const res = await fetch(`/api/workout/planned?today=${localToday}`)
      if (res.ok) setPlannedWorkouts(await res.json())
    } catch { /* non-critical */ }
  }, [])

  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch('/api/workout/recent')
      if (res.ok) { const d = await res.json(); if (Array.isArray(d) && d.length) setRecentWorkouts(d) }
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(d => { if (d.snapshot) setSnap(d.snapshot) }).catch(() => {})
    fetch('/api/workout/recent').then(r => r.json()).then(d => { if (Array.isArray(d) && d.length) setRecentWorkouts(d) }).catch(() => {})
    fetch('/api/warnings').then(r => r.json()).then(d => { if (Array.isArray(d.warnings)) setWarnings(d.warnings) }).catch(() => {})
    fetchPlanned()
  }, [fetchPlanned])

  function handleVoiceResult(newEntries: JournalEntry[], _newWaterMl: number | null) {
    if (newEntries.length) addEntries(newEntries)
  }

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
  const workoutJournalEntries = entries.filter(e => e.entry_type === 'workout')

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
  const moodMeta   = latestMood ? getMoodMeta(latestMood.description) : null
  const moodStyles = {
    green:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-800'  },
    yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800' },
    red:    { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-800'    },
  }
  const ms = moodMeta ? moodStyles[moodMeta.color] : null
  const _d = new Date(); const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`

  return (
    <>
      <div className="flex flex-col min-h-dvh pb-[calc(8rem+env(safe-area-inset-bottom))]">

        {/* Header */}
        <div className="px-5 pt-8 pb-5">
          <div className="flex items-center justify-between mb-4">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <LogoMark />
              <div>
                <p className="text-base font-bold text-gray-900 tracking-widest uppercase leading-none">Trace</p>
                <p className="text-[10px] text-gray-400 tracking-wider uppercase leading-none mt-1">Health Companion</p>
              </div>
            </div>
            {/* Avatar + Analyse */}
            <div className="flex items-center gap-2">
              <Link href="/analyze" className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-full hover:bg-gray-200 transition-colors">
                <BarChart2 size={12} />
                Analyze
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
          <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
            <div className="px-4 pt-3.5 pb-2.5 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                  <Utensils size={13} className="text-amber-500" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Nutrition</h2>
              </div>
              <Link href="/food" className="w-6 h-6 rounded-lg bg-gray-900 flex items-center justify-center hover:bg-gray-700 active:scale-95 transition-all">
                <Plus size={13} className="text-white" />
              </Link>
            </div>
            <div className="px-4 pb-4 pt-3">
              <Link href="/food" className="grid grid-cols-4 active:opacity-70 transition-opacity">
                <MacroStat label="Proteins" value={totals.protein_g}    iconBg="bg-blue-50"   icon={<Dumbbell size={16} className="text-blue-500"   />} />
                <MacroStat label="Carbs"    value={totals.carbs_g}      iconBg="bg-amber-50"  icon={<Wheat    size={16} className="text-amber-500"  />} />
                <MacroStat label="Fats"     value={totals.fat_g}        iconBg="bg-orange-50" icon={<Droplet  size={16} className="text-orange-500" />} />
                <MacroStat label="Fiber"    value={totals.fibre_g ?? 0} iconBg="bg-green-50"  icon={<Leaf     size={16} className="text-green-500"  />} />
              </Link>
            </div>
          </div>

          {/* ── 3. Supplements + Hydration (side by side) ─────────────────── */}
          <div className="flex gap-3">
            {/* Supplements */}
            <div className="flex-1 rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
              <div className="px-3 pt-3 pb-2.5 flex items-center gap-2 border-b border-gray-50">
                <div className="w-6 h-6 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                  <Pill size={12} className="text-purple-500" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Supplements</h2>
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
                <h2 className="text-lg font-bold text-gray-900">Hydration</h2>
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
          <SectionCard title="Workout" icon={<Dumbbell size={13} />} iconBg="bg-red-50" iconColor="text-red-500"
            right={
              <button onClick={() => setShowWorkoutGenerator(true)} className="w-6 h-6 rounded-lg bg-gray-900 flex items-center justify-center hover:bg-gray-700 active:scale-95 transition-all">
                <Plus size={13} className="text-white" />
              </button>
            }
          >
            {/* Planned (scheduled) workouts — shown first */}
            {plannedWorkouts.map(pw => (
              <button
                key={pw.id}
                onClick={() => setExpandedPlan(pw)}
                className="w-full text-left rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 hover:bg-amber-100 active:scale-[0.98] transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <CalendarCheck size={13} className="text-amber-600" />
                    <span className="text-xs font-semibold text-gray-800 capitalize">{pw.workout_type}</span>
                  </div>
                  <span className="text-[10px] text-amber-600 font-medium bg-amber-100 px-1.5 py-0.5 rounded-full">
                    Scheduled · {pw.scheduled_date.slice(0, 10) === today ? 'Today' : 'Tomorrow'}
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 pl-5">
                  {pw.duration_mins}min · {pw.muscles?.join(', ') ?? `Zone ${pw.intensity_zone}`}
                </p>
              </button>
            ))}

            {/* Voice-logged workouts from journal */}
            {workoutJournalEntries.map(e => <JournalWorkoutCard key={e.id} entry={e} />)}

            {/* Garmin-synced workouts */}
            {recentWorkouts.length > 0
              ? recentWorkouts.map(w => <WorkoutMiniCard key={w.id} workout={w} onClick={w.source === 'planned' ? () => setCompletedView(w) : undefined} />)
              : workoutJournalEntries.length === 0 && plannedWorkouts.length === 0 && <p className="text-xs text-gray-400 px-1">No recent workouts</p>
            }

          </SectionCard>

          {/* ── 4. Mental Health ──────────────────────────────────────────── */}
          <SectionCard title="Mental Health" icon={<Brain size={13} />} iconBg="bg-violet-50" iconColor="text-violet-500">
            {latestMood && ms && moodMeta ? (
              <div className={`rounded-xl px-4 py-3 flex items-center gap-3 border ${ms.bg} ${ms.border}`}>
                <span className="text-2xl shrink-0">{moodMeta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${ms.text}`}>{latestMood.description}</p>
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

          {/* ── 5. Today's Log ────────────────────────────────────────────── */}
          <SectionCard title="Today's Log" icon={<ClipboardList size={13} />} iconBg="bg-gray-100" iconColor="text-gray-500">
            <LogTimeline initialEntries={entries} />
          </SectionCard>

        </div>
      </div>

      {/* ── Voice button ─────────────────────────────────────────────────────── */}
      <div className="fixed bottom-[calc(2rem+env(safe-area-inset-bottom))] left-0 right-0 z-40">
        <div className="max-w-md mx-auto px-5">
          <button onClick={() => setShowVoice(true)}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-gray-900 hover:bg-gray-800 active:scale-[0.98] text-white py-4 shadow-2xl transition-all">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
              <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z" />
            </svg>
            <span className="text-sm font-semibold tracking-wide">Trace</span>
          </button>
        </div>
      </div>
      {showVoice && (
        <VoiceOverlay
          onClose={() => setShowVoice(false)}
          onResult={handleVoiceResult}
        />
      )}
      {showWorkoutGenerator && (
        <WorkoutGeneratorModal
          onClose={() => setShowWorkoutGenerator(false)}
          onSaved={() => { fetchPlanned(); setShowWorkoutGenerator(false) }}
        />
      )}
      {completedView && (
        <PlannedWorkoutSheet
          plan={{
            id: completedView.id,
            workout_type: completedView.workout_type,
            duration_mins: completedView.duration_mins,
            muscles: completedView.muscles ?? null,
            intensity_zone: completedView.intensity_zone ?? null,
            plan_text: completedView.plan_text ?? '',
            plan_json: (completedView.plan_json as PlanJson) ?? null,
            scheduled_date: completedView.started_at,
          }}
          onClose={() => setCompletedView(null)}
          completed
        />
      )}
      {expandedPlan && (
        <PlannedWorkoutSheet
          plan={expandedPlan}
          onClose={() => setExpandedPlan(null)}
          onDone={async () => {
            const ld = new Date()
            const localToday = `${ld.getFullYear()}-${String(ld.getMonth()+1).padStart(2,'0')}-${String(ld.getDate()).padStart(2,'0')}`
            const doneWorkout = expandedPlan
            // Remove from planned immediately — don't re-fetch planned (race condition)
            setPlannedWorkouts(prev => prev.filter(p => p.id !== doneWorkout.id))
            setExpandedPlan(null)
            await fetch('/api/workout/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: doneWorkout.id, completed_date: localToday }),
            })
            // Add to recent workouts list directly so it shows up immediately
            setRecentWorkouts(prev => [{
              id: doneWorkout.id,
              workout_type: doneWorkout.workout_type,
              started_at: localToday,
              duration_mins: doneWorkout.duration_mins,
              muscles: doneWorkout.muscles ?? undefined,
              intensity_zone: doneWorkout.intensity_zone ?? undefined,
              plan_text: doneWorkout.plan_text,
              plan_json: doneWorkout.plan_json ?? undefined,
              source: 'planned' as const,
            }, ...prev.filter(w => w.id !== doneWorkout.id)])
          }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Planned workout detail sheet
// ---------------------------------------------------------------------------

function PlannedWorkoutSheet({ plan, onClose, onDone, completed }: { plan: PlannedWorkout; onClose: () => void; onDone?: () => void; completed?: boolean }) {
  const [marking, setMarking] = useState(false)

  async function handleDone() {
    if (!onDone) return
    setMarking(true)
    await onDone()
  }
  const pj = plan.plan_json
  const isStrength = !pj?.segments
  const isRun = !!pj?.segments

  const zoneColors: Record<number, string> = {
    1: 'bg-blue-50 text-blue-700 border-blue-200',
    2: 'bg-teal-50 text-teal-700 border-teal-200',
    3: 'bg-amber-50 text-amber-700 border-amber-200',
    4: 'bg-orange-50 text-orange-700 border-orange-200',
    5: 'bg-red-50 text-red-700 border-red-200',
  }
  const zoneLabels: Record<number, string> = { 1: 'Easy', 2: 'Light', 3: 'Moderate', 4: 'Hard', 5: 'Max' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl flex flex-col" style={{ maxHeight: '82vh' }}>

        {/* Header */}
        <div className="px-5 pt-5 pb-4 shrink-0 flex items-start justify-between">
          <div>
            <p className={`text-[10px] font-semibold uppercase tracking-widest mb-1 ${completed ? 'text-green-600' : 'text-gray-400'}`}>
              {completed ? 'Completed' : plan.scheduled_date.slice(0, 10) === (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })() ? 'Today' : 'Tomorrow'}
            </p>
            <h2 className="text-xl font-bold text-gray-900 capitalize">{plan.workout_type}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-500">{plan.duration_mins} min</span>
              {plan.muscles?.length ? (
                <span className="text-xs text-gray-400">· {plan.muscles.join(', ')}</span>
              ) : plan.intensity_zone ? (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${zoneColors[plan.intensity_zone] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                  Zone {plan.intensity_zone} · {zoneLabels[plan.intensity_zone]}
                </span>
              ) : null}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 shrink-0 ml-3 mt-1"
          >
            <X size={15} />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100 mx-5 shrink-0" />

        {/* Body — scrollable */}
        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-5">

          {/* ── Strength plan ── */}
          {isStrength && pj && (
            <>
              {pj.warmup?.length ? (
                <Section label="Warm-Up" emoji="🌅">
                  {pj.warmup.map((e, i) => (
                    <ExerciseRow key={i} name={e.name} meta={e.reps ? `${e.reps} reps` : e.duration ?? ''} />
                  ))}
                </Section>
              ) : null}

              {pj.main?.length ? (
                <Section label="Main Workout" emoji="💪">
                  {pj.main.map((e, i) => (
                    <ExerciseRow
                      key={i}
                      index={i + 1}
                      name={e.name}
                      meta={[
                        e.sets && e.reps ? `${e.sets}×${e.reps}` : null,
                        e.rest_secs ? `Rest ${e.rest_secs}s` : null,
                      ].filter(Boolean).join(' · ')}
                      tip={e.tip}
                    />
                  ))}
                </Section>
              ) : null}

              {pj.cooldown?.length ? (
                <Section label="Cool-Down" emoji="❄️">
                  {pj.cooldown.map((e, i) => (
                    <ExerciseRow key={i} name={e.name} meta={e.duration ?? (e.reps ? `${e.reps} reps` : '')} />
                  ))}
                </Section>
              ) : null}
            </>
          )}

          {/* ── Running plan ── */}
          {isRun && pj?.segments && (
            <>
              <Section label="Segments" emoji="🏃">
                {pj.segments.map((seg, i) => (
                  <div key={i} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                    <div className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border ${seg.zone ? (zoneColors[seg.zone] ?? 'bg-gray-50 text-gray-600 border-gray-200') : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {seg.zone ? `Z${seg.zone}` : '—'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{seg.name}</p>
                      {seg.description && <p className="text-xs text-gray-400 mt-0.5">{seg.description}</p>}
                    </div>
                    <span className="text-xs text-gray-500 shrink-0 tabular-nums">{seg.duration_mins}min</span>
                  </div>
                ))}
              </Section>
              {pj.target_hr_note && (
                <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
                  <p className="text-xs text-blue-700">{pj.target_hr_note}</p>
                </div>
              )}
            </>
          )}

          {/* Fallback — no structured JSON */}
          {!pj && (
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {plan.plan_text}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          {completed ? (
            <div className="w-full flex items-center justify-center gap-2 rounded-2xl bg-green-50 border border-green-200 py-3.5">
              <CheckCircle size={16} className="text-green-600" />
              <span className="text-sm font-semibold text-green-700">Completed</span>
            </div>
          ) : (
            <button
              onClick={handleDone}
              disabled={marking}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gray-900 text-white py-3.5 text-sm font-semibold hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <CheckCircle size={16} />
              {marking ? 'Saving…' : 'Mark as Done'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ label, emoji, children }: { label: string; emoji: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm">{emoji}</span>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>
      </div>
      <div className="rounded-2xl border border-gray-100 bg-gray-50 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function ExerciseRow({ name, meta, tip, index }: { name: string; meta: string; tip?: string; index?: number }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
      {index !== undefined ? (
        <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{index}</span>
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0 mt-2" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{name}</p>
        {tip && <p className="text-[11px] text-gray-400 mt-0.5 italic">{tip}</p>}
      </div>
      {meta && <span className="text-xs text-gray-500 shrink-0 tabular-nums font-medium">{meta}</span>}
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Dumbbell } from 'lucide-react'
import HealthTile from '@/components/HealthTile'
import WorkoutCard from '@/components/WorkoutCard'
import PlannedWorkoutCard from '@/components/PlannedWorkoutCard'
import InsightsBanner from '@/components/InsightsBanner'
import LogTimeline from '@/components/LogTimeline'
import VoiceOverlay from '@/components/VoiceOverlay'
import WorkoutGeneratorModal from '@/components/WorkoutGeneratorModal'
import FoodTrackerTile from '@/components/FoodTrackerTile'
import WaterWidget from '@/components/WaterWidget'
import MoodBox from '@/components/MoodBox'
import { dummyTrackerSnapshot, dummyWorkout, dummyInsights } from '@/lib/dummy-data'
import { formatDate } from '@/lib/utils'
import { JournalEntry, TrackerSnapshot, Workout } from '@/lib/types'
import { useEntries } from '@/lib/entries-context'

interface PlannedWorkout {
  id: string
  workout_type: string
  duration_mins: number
  muscles: string[] | null
  intensity_zone: number | null
  equipment: string | null
  plan_text: string
  scheduled_date: string
}

export default function DashboardPage() {
  const [showVoice, setShowVoice] = useState(false)
  const [showWorkoutGenerator, setShowWorkoutGenerator] = useState(false)
  const [plannedWorkouts, setPlannedWorkouts] = useState<PlannedWorkout[]>([])
  const [snap, setSnap] = useState<TrackerSnapshot>(dummyTrackerSnapshot)
  const [workout, setWorkout] = useState<Workout | null>(dummyWorkout)
  const { entries, addEntries, waterMl, addWaterMl } = useEntries()
  const [mood, setMood] = useState<string | null>(null)

  const fetchPlanned = useCallback(async () => {
    try {
      const res = await fetch('/api/workout/planned')
      if (res.ok) setPlannedWorkouts(await res.json())
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => { fetchPlanned() }, [fetchPlanned])

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(data => {
        if (data.snapshot) setSnap(data.snapshot)
        if (data.workout !== undefined) setWorkout(data.workout)
      })
      .catch(err => console.error('Failed to load health data:', err))
  }, [])

  function handleVoiceResult(newEntries: JournalEntry[], newWaterMl: number | null) {
    if (newEntries.length) {
      addEntries(newEntries)
      const moodEntry = newEntries.find((e) => e.entry_type === 'mood')
      if (moodEntry) setMood(moodEntry.description)
    }
    if (newWaterMl) addWaterMl(newWaterMl)
  }

  return (
    <>
      <div className="flex flex-col min-h-dvh pb-[calc(7rem+env(safe-area-inset-bottom))]">
        {/* Header */}
        <div className="px-5 pt-8 pb-4 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
              Project Trace
            </p>
            <h1 className="text-xl font-bold text-gray-900">
              {formatDate(new Date().toISOString())}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowWorkoutGenerator(true)}
              className="p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
              title="Generate workout"
            >
              <Dumbbell size={18} />
            </button>
            <Link
              href="/summary"
              className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full hover:bg-amber-100 transition-colors"
            >
              Today's Summary →
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5">
          {/* Insights banner */}
          <InsightsBanner insights={dummyInsights} />

          {/* Mood box — only shown if mood logged */}
          {mood && <MoodBox mood={mood} />}

          {/* Water widget */}
          <WaterWidget consumed_ml={waterMl} />

          {/* Tracker tiles — 2×2 grid */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
              Tracker
            </h2>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <HealthTile
                label="HRV"
                value={snap.hrv_ms ? snap.hrv_ms : '—'}
                unit={snap.hrv_ms ? 'ms' : undefined}
                rawValue={snap.hrv_ms || undefined}
                average={snap.hrv_avg_14d || undefined}
                averageLabel="14d avg"
                higherIsBetter={true}
              />
              <HealthTile
                label="Sleep"
                value={snap.sleep_hours ? snap.sleep_hours.toFixed(1) : '—'}
                unit={snap.sleep_hours ? 'h' : undefined}
                rawValue={snap.sleep_hours || undefined}
                average={snap.sleep_avg_14d || undefined}
                averageLabel="14d avg"
                higherIsBetter={true}
              />
              <HealthTile
                label="Steps"
                value={snap.steps ? snap.steps.toLocaleString() : '—'}
                rawValue={snap.steps || undefined}
                average={snap.steps_avg_14d || undefined}
                averageLabel="14d avg"
                higherIsBetter={true}
              />
              <HealthTile
                label="Resting HR"
                value={snap.resting_hr ? snap.resting_hr : '—'}
                unit={snap.resting_hr ? 'bpm' : undefined}
                rawValue={snap.resting_hr || undefined}
                average={snap.resting_hr_avg_30d || undefined}
                averageLabel="30d avg"
                higherIsBetter={false}
              />
            </div>
            <WorkoutCard workout={workout} />
            {plannedWorkouts.map(pw => (
              <PlannedWorkoutCard key={pw.id} workout={pw} />
            ))}
          </section>

          {/* Food tracker tile */}
          <FoodTrackerTile entries={entries} />

          {/* Log timeline */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
              Today's Log
            </h2>
            <LogTimeline initialEntries={entries} />
          </section>
        </div>
      </div>

      {/* Trace voice button */}
      <div className="fixed bottom-[calc(2rem+env(safe-area-inset-bottom))] left-0 right-0 z-40">
        <div className="max-w-md mx-auto px-5">
          <button
            onClick={() => setShowVoice(true)}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl bg-gray-900 hover:bg-gray-800 active:scale-[0.98] text-white py-4 shadow-2xl transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
              <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z" />
            </svg>
            <span className="text-sm font-semibold tracking-wide">Trace</span>
          </button>
        </div>
      </div>

      {/* Voice overlay */}
      {showVoice && (
        <VoiceOverlay
          onClose={() => setShowVoice(false)}
          onResult={handleVoiceResult}
        />
      )}

      {/* Workout generator modal */}
      {showWorkoutGenerator && (
        <WorkoutGeneratorModal
          onClose={() => setShowWorkoutGenerator(false)}
          onSaved={() => { fetchPlanned(); setShowWorkoutGenerator(false) }}
        />
      )}
    </>
  )
}

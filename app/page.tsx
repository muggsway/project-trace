'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mic, Plus, Dumbbell, PenLine } from 'lucide-react'
import HealthTile from '@/components/HealthTile'
import WorkoutCard from '@/components/WorkoutCard'
import InsightsBanner from '@/components/InsightsBanner'
import LogTimeline from '@/components/LogTimeline'
import VoiceOverlay from '@/components/VoiceOverlay'
import WorkoutGeneratorModal from '@/components/WorkoutGeneratorModal'
import { dummyTrackerSnapshot, dummyWorkout, dummyEntries, dummyInsights } from '@/lib/dummy-data'
import { formatDate } from '@/lib/utils'

export default function DashboardPage() {
  const [showVoice, setShowVoice] = useState(false)
  const [showWorkoutGenerator, setShowWorkoutGenerator] = useState(false)
  const [showActionMenu, setShowActionMenu] = useState(false)
  const [lastTranscript, setLastTranscript] = useState<string | null>(null)

  const snap = dummyTrackerSnapshot

  function handleVoiceResult(transcript: string) {
    setLastTranscript(transcript)
    // TODO (Voice & Parsing — Person A): POST transcript to /api/log/parse,
    // then prepend returned entries to the timeline.
  }

  return (
    <>
      <div className="flex flex-col min-h-screen pb-28">
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
          <Link
            href="/summary"
            className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full hover:bg-amber-100 transition-colors"
          >
            Today's Summary →
          </Link>
        </div>

        <div className="flex flex-col gap-4 px-5">
          {/* Insights banner */}
          <InsightsBanner insights={dummyInsights} />

          {/* Toast: last transcript processed */}
          {lastTranscript && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2">
              <span className="text-green-600 text-sm">✓</span>
              <p className="text-sm text-green-800 truncate">{lastTranscript}</p>
              <button
                onClick={() => setLastTranscript(null)}
                className="ml-auto text-green-400 hover:text-green-600 text-xs"
              >
                ✕
              </button>
            </div>
          )}

          {/* Tracker tiles — 2×2 grid */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
              Tracker
            </h2>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <HealthTile
                label="HRV"
                value={snap.hrv_ms}
                unit="ms"
                rawValue={snap.hrv_ms}
                average={snap.hrv_avg_14d}
                averageLabel="14d avg"
                higherIsBetter={true}
              />
              <HealthTile
                label="Sleep"
                value={snap.sleep_hours.toFixed(1)}
                unit="h"
                rawValue={snap.sleep_hours}
                average={snap.sleep_avg_14d}
                averageLabel="14d avg"
                higherIsBetter={true}
              />
              <HealthTile
                label="Steps"
                value={snap.steps.toLocaleString()}
                rawValue={snap.steps}
                average={snap.steps_avg_14d}
                averageLabel="14d avg"
                higherIsBetter={true}
              />
              <HealthTile
                label="Resting HR"
                value={snap.resting_hr}
                unit="bpm"
                rawValue={snap.resting_hr}
                average={snap.resting_hr_avg_30d}
                averageLabel="30d avg"
                higherIsBetter={false}
              />
            </div>
            {/* Workout — full width */}
            <WorkoutCard workout={dummyWorkout} />
          </section>

          {/* Log timeline */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
              Today's Log
            </h2>
            <LogTimeline initialEntries={dummyEntries} />
          </section>
        </div>
      </div>

      {/* Floating action buttons */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3">
        {/* Action menu options — shown above when open */}
        {showActionMenu && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            <button
              onClick={() => { setShowActionMenu(false); setShowWorkoutGenerator(true) }}
              className="flex items-center gap-2 bg-white border border-gray-200 shadow-lg rounded-2xl px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50 active:scale-95 transition-all whitespace-nowrap"
            >
              <Dumbbell size={16} className="text-gray-600" />
              Generate workout
            </button>
            <button
              onClick={() => { setShowActionMenu(false); setShowVoice(true) }}
              className="flex items-center gap-2 bg-white border border-gray-200 shadow-lg rounded-2xl px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50 active:scale-95 transition-all whitespace-nowrap"
            >
              <PenLine size={16} className="text-gray-600" />
              Log entry
            </button>
          </div>
        )}

        {/* + button */}
        <button
          onClick={() => setShowActionMenu(v => !v)}
          className={`w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-all active:scale-95 ${showActionMenu ? 'bg-gray-200 rotate-45' : 'bg-gray-900 hover:bg-gray-800'}`}
        >
          <Plus size={26} className={showActionMenu ? 'text-gray-700' : 'text-white'} />
        </button>
      </div>

      {/* Tap outside action menu to close */}
      {showActionMenu && (
        <div className="fixed inset-0 z-30" onClick={() => setShowActionMenu(false)} />
      )}

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
          onSaved={() => setShowWorkoutGenerator(false)}
        />
      )}
    </>
  )
}

'use client'

import { useState } from 'react'
import { JournalEntry } from '@/lib/types'
import LogEntryCard from './LogEntry'

interface LogTimelineProps {
  initialEntries: JournalEntry[]
}

export default function LogTimeline({ initialEntries }: LogTimelineProps) {
  const [overrides, setOverrides] = useState<Record<string, Partial<JournalEntry>>>({})
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  function confirmEntry(id: string) {
    setOverrides((prev) => ({ ...prev, [id]: { status: 'confirmed' as const } }))
  }

  function dismissEntry(id: string) {
    setDismissed((prev) => new Set(prev).add(id))
  }

  const entries = initialEntries
    .filter((e) => !dismissed.has(e.id))
    .map((e) => ({ ...e, ...overrides[e.id] }))

  // Sort newest first
  const sorted = [...entries].sort(
    (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
  )

  if (sorted.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        No entries yet today. Tap the mic to log something.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((entry) => (
        <LogEntryCard
          key={entry.id}
          entry={entry}
          onConfirm={confirmEntry}
          onDismiss={dismissEntry}
        />
      ))}
    </div>
  )
}

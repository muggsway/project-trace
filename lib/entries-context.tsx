'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { JournalEntry } from './types'

interface EntriesContextValue {
  entries: JournalEntry[]
  loading: boolean
  addEntries: (newEntries: JournalEntry[]) => void
  addWaterMl: (ml: number) => void
  waterMl: number
}

const EntriesContext = createContext<EntriesContextValue>({
  entries: [],
  loading: true,
  addEntries: () => {},
  addWaterMl: () => {},
  waterMl: 0,
})

export function EntriesProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [waterMl, setWaterMl] = useState(0)

  const fetchToday = useCallback(async () => {
    try {
      const d = new Date()
      const localDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      const res = await fetch(`/api/log/today?date=${localDate}`)
      if (!res.ok) return
      const data: JournalEntry[] = await res.json()
      if (!Array.isArray(data)) return
      setEntries(data)
    } catch (e) {
      console.error('[EntriesProvider]', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchToday() }, [fetchToday])

  function addEntries(newEntries: JournalEntry[]) {
    setEntries((prev) => {
      const existingIds = new Set(prev.map((e) => e.id))
      const fresh = newEntries.filter((e) => !existingIds.has(e.id))
      return [...fresh, ...prev]
    })
  }

  function addWaterMl(ml: number) {
    setWaterMl((prev) => prev + ml)
  }

  return (
    <EntriesContext.Provider value={{ entries, loading, addEntries, addWaterMl, waterMl }}>
      {children}
    </EntriesContext.Provider>
  )
}

export function useEntries() {
  return useContext(EntriesContext)
}

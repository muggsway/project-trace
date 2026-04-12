'use client'

import Link from 'next/link'
import { Flame, ChevronRight } from 'lucide-react'
import { JournalEntry } from '@/lib/types'

interface FoodTrackerTileProps {
  entries: JournalEntry[]
}

export default function FoodTrackerTile({ entries }: FoodTrackerTileProps) {
  const foodEntries = entries.filter(
    (e) => e.entry_type === 'food' && e.status === 'confirmed'
  )

  const totalCalories = foodEntries.reduce((sum, e) => sum + (e.macros?.calories ?? 0), 0)
  const totalProtein = foodEntries.reduce((sum, e) => sum + (e.macros?.protein_g ?? 0), 0)

  return (
    <Link
      href="/food"
      className="w-full rounded-2xl border border-gray-100 bg-white px-4 py-3 flex items-center justify-between hover:bg-gray-50 active:scale-[0.99] transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center">
          <Flame size={18} className="text-green-600" />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest leading-none mb-0.5">
            Food Today
          </p>
          <p className="text-xl font-bold text-gray-900 leading-tight">
            {totalCalories > 0 ? `${totalCalories} kcal` : '—'}
          </p>
          {totalProtein > 0 && (
            <p className="text-xs text-gray-400">{totalProtein}g protein</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-gray-300">
        <span className="text-xs text-gray-400">{foodEntries.length} items</span>
        <ChevronRight size={16} />
      </div>
    </Link>
  )
}

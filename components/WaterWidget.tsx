'use client'

import { Droplets } from 'lucide-react'

const DAILY_GOAL_ML = 3200

interface WaterWidgetProps {
  consumed_ml: number
}

export default function WaterWidget({ consumed_ml }: WaterWidgetProps) {
  const pct = Math.min(consumed_ml / DAILY_GOAL_ML, 1)
  const consumed_L = (consumed_ml / 1000).toFixed(1)
  const goal_L = (DAILY_GOAL_ML / 1000).toFixed(1)
  const isAnomaly = pct < 0.4

  return (
    <div className={`rounded-2xl border px-4 py-3 flex items-center gap-3 ${isAnomaly ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100'}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isAnomaly ? 'bg-blue-100' : 'bg-blue-50'}`}>
        <Droplets size={18} className="text-blue-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-1.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Water</p>
          <p className="text-xs text-gray-400">{consumed_L}L / {goal_L}L</p>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-400 transition-all duration-500"
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      </div>
      <p className="text-sm font-bold text-gray-700 shrink-0 w-10 text-right">
        {Math.round(pct * 100)}%
      </p>
    </div>
  )
}

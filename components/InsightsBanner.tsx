'use client'

import { useState } from 'react'
import { Info, ChevronDown, ChevronUp } from 'lucide-react'

interface InsightsBannerProps {
  notices: string[]
}

export default function InsightsBanner({ notices }: InsightsBannerProps) {
  const [expanded, setExpanded] = useState(false)

  if (notices.length === 0) return null

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <Info size={16} className="text-amber-600 shrink-0" />
        <span className="text-sm font-semibold text-amber-800 flex-1">
          {notices.length} {notices.length === 1 ? 'notice' : 'notices'} for today
        </span>
        {expanded
          ? <ChevronUp size={16} className="text-amber-500" />
          : <ChevronDown size={16} className="text-amber-500" />
        }
      </button>

      {expanded && (
        <div className="border-t border-amber-200 divide-y divide-amber-100">
          {notices.map((text, i) => (
            <div key={i} className="px-4 py-3 flex gap-3">
              <Info size={14} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-900 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

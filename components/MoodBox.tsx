'use client'

const MOOD_CONFIG: Record<string, { emoji: string; color: string; bg: string; border: string }> = {
  happy:     { emoji: '😊', color: 'text-yellow-700', bg: 'bg-yellow-50',  border: 'border-yellow-200' },
  sad:       { emoji: '😔', color: 'text-blue-700',   bg: 'bg-blue-50',    border: 'border-blue-200'   },
  anxious:   { emoji: '😟', color: 'text-orange-700', bg: 'bg-orange-50',  border: 'border-orange-200' },
  tired:     { emoji: '😴', color: 'text-purple-700', bg: 'bg-purple-50',  border: 'border-purple-200' },
  energetic: { emoji: '⚡', color: 'text-green-700',  bg: 'bg-green-50',   border: 'border-green-200'  },
  stressed:  { emoji: '😤', color: 'text-red-700',    bg: 'bg-red-50',     border: 'border-red-200'    },
  calm:      { emoji: '😌', color: 'text-teal-700',   bg: 'bg-teal-50',    border: 'border-teal-200'   },
}

function getMoodConfig(mood: string) {
  const key = mood.toLowerCase()
  return MOOD_CONFIG[key] ?? { emoji: '🙂', color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200' }
}

interface MoodBoxProps {
  mood: string
}

export default function MoodBox({ mood }: MoodBoxProps) {
  const config = getMoodConfig(mood)

  return (
    <div className={`rounded-2xl border ${config.border} ${config.bg} px-4 py-3 flex items-center gap-3`}>
      <span className="text-2xl">{config.emoji}</span>
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest leading-none mb-0.5">
          Mood
        </p>
        <p className={`text-base font-bold ${config.color} capitalize`}>{mood}</p>
      </div>
    </div>
  )
}

export type EntryType = 'food' | 'drink' | 'supplement' | 'symptom' | 'mood' | 'energy' | 'workout'
export type EntryStatus = 'confirmed' | 'pending'
export type EntrySource = 'voice' | 'habit' | 'manual'

export interface Macros {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface JournalEntry {
  id: string
  entry_type: EntryType
  description: string
  quantity?: string
  logged_at: string // ISO string
  created_at: string
  status: EntryStatus
  source: EntrySource
  macros?: Macros
}

export interface Habit {
  id: string
  description: string
  entry_type: EntryType
  usual_time: string // "HH:MM"
  active: boolean
}

export interface TrackerSnapshot {
  date: string
  hrv_ms: number
  hrv_avg_14d: number
  sleep_hours: number
  sleep_avg_14d: number
  sleep_score?: number
  resting_hr: number
  resting_hr_avg_30d: number
  steps: number
  steps_avg_14d: number
  deep_sleep_pct?: number
  deep_sleep_secs?: number
  light_sleep_secs?: number
  rem_sleep_secs?: number
  body_battery_high?: number
  body_battery_low?: number
  avg_stress?: number
}

export interface Workout {
  id: string
  workout_type: string
  started_at: string
  ended_at: string
  duration_mins: number
  distance_km?: number
  calories_active?: number
  avg_hr?: number
  max_hr?: number
}

export interface Insight {
  type: 'positive' | 'average' | 'warning'
  text: string
}

export interface DailySummary {
  date: string
  what_worked: string
  what_was_average: string
  warnings: string[]
  generated_at: string
}

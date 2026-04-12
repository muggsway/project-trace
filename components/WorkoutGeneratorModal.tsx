'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Mic, Square, Send, RefreshCw, CheckCircle, Volume2, VolumeX, CalendarDays, CalendarClock } from 'lucide-react'
import { dummyTrackerSnapshot, dummyWorkout } from '@/lib/dummy-data'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface GeneratedWorkout {
  workout_type: string
  duration_mins: number
  muscles?: string[]
  intensity_zone?: number
  equipment?: string
  plan_text: string
  plan_json: object
}

interface WorkoutGeneratorModalProps {
  onClose: () => void
  onSaved: () => void
}

type RecordingState = 'idle' | 'recording' | 'processing'

const OPENING_MESSAGE: Message = {
  role: 'assistant',
  content: JSON.stringify({ type: 'question', message: 'What kind of workout do you want today?' }),
}

function parseAssistantContent(content: string): { type: string; message: string; workout?: GeneratedWorkout } {
  try {
    return JSON.parse(content)
  } catch {
    return { type: 'question', message: content }
  }
}

export default function WorkoutGeneratorModal({ onClose, onSaved }: WorkoutGeneratorModalProps) {
  const [messages, setMessages] = useState<Message[]>([OPENING_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [generatedWorkout, setGeneratedWorkout] = useState<GeneratedWorkout | null>(null)
  const [scheduled, setScheduled] = useState<'today' | 'tomorrow' | null>(null)
  const [muted, setMuted] = useState(false)
  const mutedRef = useRef(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const ttsAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  // Push history state so browser back closes the modal
  useEffect(() => {
    history.pushState({ workoutGenerator: true }, '')
    const handlePop = () => onClose()
    window.addEventListener('popstate', handlePop)
    return () => {
      window.removeEventListener('popstate', handlePop)
      ttsAbortRef.current?.abort()
      audioRef.current?.pause()
    }
  }, [onClose])

  // Speak the opening question on first mount
  useEffect(() => {
    const parsed = parseAssistantContent(OPENING_MESSAGE.content)
    speakText(parsed.message)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function speakText(text: string) {
    if (mutedRef.current || !text) return
    // Cancel any in-flight TTS request and stop current audio
    ttsAbortRef.current?.abort()
    ttsAbortRef.current = new AbortController()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: ttsAbortRef.current.signal,
      })
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.play()
      audio.onended = () => URL.revokeObjectURL(url)
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      // silently fail — user can still read the text
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    const userMsg: Message = { role: 'user', content: text.trim() }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setInput('')
    setLoading(true)

    try {
      const snap = dummyTrackerSnapshot
      const res = await fetch('/api/workout/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updated,
          health_context: {
            hrv_ms: snap.hrv_ms,
            hrv_avg_14d: snap.hrv_avg_14d,
            sleep_hours: snap.sleep_hours,
            sleep_score: snap.sleep_score,
            last_workout: dummyWorkout
              ? { workout_type: dummyWorkout.workout_type, duration_mins: dummyWorkout.duration_mins, avg_hr: dummyWorkout.avg_hr, date: snap.date }
              : null,
            recent_symptoms: [],
          },
        }),
      })

      const data = await res.json()
      const assistantMsg: Message = { role: 'assistant', content: JSON.stringify(data) }
      setMessages([...updated, assistantMsg])

      if (data.type === 'workout' && data.workout) {
        setGeneratedWorkout(data.workout)
        speakText(data.message || 'Here is your workout.')
      } else if (data.message) {
        speakText(data.message)
      }
    } catch {
      const errMsg: Message = { role: 'assistant', content: JSON.stringify({ type: 'question', message: 'Something went wrong. Please try again.' }) }
      setMessages([...updated, errMsg])
      speakText('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function regenerate() {
    if (!generatedWorkout) return
    setGeneratedWorkout(null)
    setScheduled(null)
    await sendMessage('Regenerate a different version of that workout please.')
  }

  async function scheduleWorkout(when: 'today' | 'tomorrow') {
    if (!generatedWorkout) return
    const date = new Date()
    if (when === 'tomorrow') date.setDate(date.getDate() + 1)
    const scheduled_date = date.toISOString().slice(0, 10)
    await fetch('/api/workout/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workout: generatedWorkout, scheduled_date }),
    })
    setScheduled(when)
    onSaved()
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferred = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
      const mimeType = preferred.find(t => MediaRecorder.isTypeSupported(t)) ?? ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setRecordingState('processing')
        const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm'
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        const form = new FormData()
        form.append('audio', blob, `recording.${ext}`)
        try {
          const res = await fetch('/api/stt', { method: 'POST', body: form })
          const { transcript } = await res.json()
          if (transcript) await sendMessage(transcript)
        } catch {
          // silently fall through — user can type instead
        } finally {
          setRecordingState('idle')
        }
      }
      recorder.start(250)
      mediaRecorderRef.current = recorder
      setRecordingState('recording')
    } catch {
      setRecordingState('idle')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-center">
    <div className="w-full max-w-md flex flex-col bg-white h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-8 pb-4 border-b border-gray-100">
        <div className="w-11 h-11 bg-gray-900 rounded-2xl flex items-center justify-center shrink-0 shadow-md">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
            <path d="M2 12h4l2-5 4 10 3-7 2 2h5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <p className="text-base font-bold text-gray-900 tracking-widest uppercase leading-none">Trace</p>
          <p className="text-[10px] text-gray-400 tracking-wider uppercase leading-none mt-1">Health Companion</p>
        </div>
        <div className="ml-auto flex items-end flex-col">
          <p className="text-base font-bold text-gray-900 leading-none">Workout</p>
          <p className="text-[10px] text-gray-400 leading-none mt-0.5">Generator</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => {
              const next = !mutedRef.current
              mutedRef.current = next
              setMuted(next)
              if (next) { audioRef.current?.pause(); audioRef.current = null }
            }}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
            title={muted ? 'Unmute' : 'Mute voice'}
          >
            {muted
              ? <VolumeX size={18} className="text-gray-400" />
              : <Volume2 size={18} className="text-gray-500" />
            }
          </button>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X size={20} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Health context pill */}
      <div className="px-5 py-2 flex gap-2">
        <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-2 py-0.5">
          HRV {dummyTrackerSnapshot.hrv_ms}ms ↓
        </span>
        <span className="text-xs bg-gray-50 border border-gray-200 text-gray-500 rounded-full px-2 py-0.5">
          Sleep {dummyTrackerSnapshot.sleep_hours}h
        </span>
      </div>

      {/* Chat thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-3">
        {messages.map((msg, i) => {
          if (msg.role === 'assistant') {
            const parsed = parseAssistantContent(msg.content)
            const isWorkout = parsed.type === 'workout' && parsed.workout
            return (
              <div key={i} className="flex flex-col gap-1 items-start max-w-[85%]">
                <div className={`rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed ${isWorkout ? 'bg-gray-900 text-white w-full max-w-none' : 'bg-gray-100 text-gray-900'}`}>
                  {isWorkout ? (
                    <WorkoutCard workout={parsed.workout as GeneratedWorkout} message={parsed.message} />
                  ) : (
                    parsed.message
                  )}
                </div>
              </div>
            )
          }
          return (
            <div key={i} className="flex justify-end">
              <div className="bg-amber-400 text-gray-900 rounded-2xl rounded-tr-sm px-4 py-3 text-sm max-w-[85%] leading-relaxed">
                {msg.content}
              </div>
            </div>
          )
        })}

        {loading && (
          <div className="flex items-start gap-2">
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Workout actions (shown after generation) */}
      {generatedWorkout && (
        <div className="px-5 pb-2 flex gap-2 flex-wrap">
          {!scheduled ? (
            <>
              <button
                onClick={regenerate}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <RefreshCw size={12} />
                Regenerate
              </button>
              <button
                onClick={() => scheduleWorkout('today')}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-200 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
              >
                <CalendarDays size={12} />
                Today
              </button>
              <button
                onClick={() => scheduleWorkout('tomorrow')}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <CalendarClock size={12} />
                Tomorrow
              </button>
            </>
          ) : (
            <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-50 border border-green-200 text-xs font-semibold text-green-700">
              <CheckCircle size={12} />
              Scheduled for {scheduled === 'today' ? 'today' : 'tomorrow'}
            </div>
          )}
        </div>
      )}

      {/* Input bar */}
      <div className="px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-2 border-t border-gray-100 flex items-center gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendMessage(input) }}
          placeholder="Type or tap mic…"
          className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent"
          disabled={loading}
        />
        {input.trim() ? (
          <button
            onClick={() => sendMessage(input)}
            disabled={loading}
            className="w-11 h-11 rounded-2xl bg-amber-400 flex items-center justify-center hover:bg-amber-300 active:scale-95 transition-all"
          >
            <Send size={16} className="text-gray-900" />
          </button>
        ) : (
          <button
            onPointerDown={recordingState === 'idle' ? startRecording : undefined}
            onPointerUp={recordingState === 'recording' ? stopRecording : undefined}
            disabled={loading || recordingState === 'processing'}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center active:scale-95 transition-all ${
              recordingState === 'recording'
                ? 'bg-red-500 text-white'
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            {recordingState === 'recording' ? <Square size={14} fill="white" /> : <Mic size={16} />}
          </button>
        )}
      </div>
    </div>
    </div>
  )
}

function WorkoutCard({ workout, message }: { workout: GeneratedWorkout; message: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-white/80 text-xs font-semibold uppercase tracking-wide">{message}</p>
      <pre className="text-white text-xs leading-relaxed whitespace-pre-wrap font-sans">
        {workout.plan_text}
      </pre>
      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/20">
        <span className="text-[10px] bg-white/10 text-white/70 rounded-full px-2 py-0.5">
          {workout.workout_type === 'strength' ? '💪' : '🏃'} {workout.workout_type}
        </span>
        <span className="text-[10px] bg-white/10 text-white/70 rounded-full px-2 py-0.5">
          {workout.duration_mins} mins
        </span>
        {workout.muscles && (
          <span className="text-[10px] bg-white/10 text-white/70 rounded-full px-2 py-0.5">
            {workout.muscles.join(', ')}
          </span>
        )}
        {workout.intensity_zone && (
          <span className="text-[10px] bg-white/10 text-white/70 rounded-full px-2 py-0.5">
            Zone {workout.intensity_zone}
          </span>
        )}
      </div>
    </div>
  )
}

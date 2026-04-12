'use client'

import { useState, useRef } from 'react'
import { X, Square } from 'lucide-react'

interface VoiceOverlayProps {
  onClose: () => void
  onResult: (transcript: string) => void
}

type RecordingState = 'idle' | 'recording' | 'processing'

export default function VoiceOverlay({ onClose, onResult }: VoiceOverlayProps) {
  const [state, setState] = useState<RecordingState>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setState('processing')
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        await sendToElevenLabs(blob)
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setState('recording')
    } catch {
      setError('Microphone access denied. Please allow microphone access and try again.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
  }

  async function sendToElevenLabs(blob: Blob) {
    try {
      const form = new FormData()
      form.append('audio', blob, 'recording.webm')

      const res = await fetch('/api/stt', { method: 'POST', body: form })

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error)
      }

      const { transcript } = await res.json()
      setTranscript(transcript || '(no speech detected)')
      setState('idle')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transcription failed'
      setError(message + ' — please try again.')
      setState('idle')
    }
  }

  function handleUseTranscript() {
    onResult(transcript)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900/80 backdrop-blur-sm px-6">
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-[calc(1.5rem+env(safe-area-inset-top))] right-6 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <X size={20} />
      </button>

      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* Status label */}
        <div className="text-center">
          <p className="text-white/60 text-sm font-medium tracking-widest uppercase">
            {state === 'idle' && transcript === '' && 'Tap to speak'}
            {state === 'recording' && 'Listening…'}
            {state === 'processing' && 'Transcribing…'}
            {state === 'idle' && transcript !== '' && 'Transcript'}
          </p>
        </div>

        {/* Waveform / Processing animation */}
        <div className="h-12 flex items-center justify-center gap-1">
          {state === 'recording' ? (
            Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="waveform-bar w-1 rounded-full bg-amber-400"
                style={{ animationDelay: `${i * 0.08}s` }}
              />
            ))
          ) : state === 'processing' ? (
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-amber-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          ) : (
            Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="w-1 h-1 rounded-full bg-white/20" />
            ))
          )}
        </div>

        {/* Transcript display */}
        {transcript && (
          <div className="w-full bg-white/10 rounded-2xl px-4 py-3">
            <p className="text-white text-sm leading-relaxed">{transcript}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-red-300 text-sm text-center">{error}</p>
        )}

        {/* Controls */}
        <div className="flex flex-col items-center gap-4 w-full">
          {state === 'idle' && transcript === '' && (
            <button
              onClick={startRecording}
              className="w-20 h-20 rounded-full bg-amber-400 hover:bg-amber-300 active:scale-95 transition-all shadow-lg flex items-center justify-center"
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
                <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z" />
              </svg>
            </button>
          )}

          {state === 'recording' && (
            <button
              onClick={stopRecording}
              className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-400 active:scale-95 transition-all shadow-lg flex items-center justify-center"
            >
              <Square size={28} fill="white" className="text-white" />
            </button>
          )}

          {state === 'idle' && transcript !== '' && (
            <div className="flex gap-3 w-full">
              <button
                onClick={() => { setTranscript(''); setError(null) }}
                className="flex-1 py-3 rounded-2xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors"
              >
                Re-record
              </button>
              <button
                onClick={handleUseTranscript}
                className="flex-1 py-3 rounded-2xl bg-amber-400 text-gray-900 text-sm font-semibold hover:bg-amber-300 active:scale-95 transition-all"
              >
                Log entries
              </button>
            </div>
          )}
        </div>

        <p className="text-white/30 text-xs text-center pb-[env(safe-area-inset-bottom)]">
          Powered by ElevenLabs · entries parsed by Claude
        </p>
      </div>
    </div>
  )
}

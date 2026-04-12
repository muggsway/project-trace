'use client'

import { useState, useRef } from 'react'
import { X, Square } from 'lucide-react'
import { JournalEntry } from '@/lib/types'

interface VoiceOverlayProps {
  onClose: () => void
  onResult: (entries: JournalEntry[], waterMl: number | null) => void
}

type Stage = 'idle' | 'recording' | 'thinking' | 'speaking'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function VoiceOverlay({ onClose, onResult }: VoiceOverlayProps) {
  const [stage, setStage] = useState<Stage>('idle')
  const [followUpQuestion, setFollowUpQuestion] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  async function speakText(text: string) {
    setStage('speaking')
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error(`TTS API error ${res.status}`)

      const arrayBuffer = await res.arrayBuffer()
      const audioContext = new AudioContext()

      // Resume AudioContext — required on mobile after async gap
      if (audioContext.state === 'suspended') await audioContext.resume()

      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContext.destination)

      await new Promise<void>((resolve) => {
        source.onended = () => resolve()
        source.start(0)
      })

      await audioContext.close()
    } catch (e) {
      console.error('[TTS]', e)
      // Non-fatal — question is shown as text
    } finally {
      setStage('idle')
    }
  }

  async function startRecording() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setStage('thinking')
        await transcribeAndParse(new Blob(chunksRef.current, { type: 'audio/webm' }))
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setStage('recording')
    } catch {
      setError('Microphone access denied.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
  }

  async function transcribeAndParse(blob: Blob) {
    try {
      const form = new FormData()
      form.append('audio', blob, 'recording.webm')
      const sttRes = await fetch('/api/stt', { method: 'POST', body: form })
      if (!sttRes.ok) {
        const { error } = await sttRes.json().catch(() => ({ error: 'Unknown' }))
        throw new Error(error)
      }
      const { transcript } = await sttRes.json()
      if (!transcript) throw new Error('No speech detected')

      const updatedMessages: Message[] = [...messages, { role: 'user', content: transcript }]
      const messagesWithContext: Message[] = followUpQuestion
        ? [
            ...messages,
            { role: 'assistant', content: JSON.stringify({ follow_up_question: followUpQuestion, entries: [], water_ml: null }) },
            { role: 'user', content: transcript },
          ]
        : updatedMessages

      const parseRes = await fetch('/api/log/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messagesWithContext }),
      })
      const data = await parseRes.json()
      if (!parseRes.ok) throw new Error(data.error ?? 'Parse failed')

      if (data.follow_up_question) {
        setMessages(updatedMessages)
        setFollowUpQuestion(data.follow_up_question)
        await speakText(data.follow_up_question)
      } else {
        onResult(data.entries ?? [], data.water_ml ?? null)
        onClose()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStage('idle')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Background */}
      <div className="absolute inset-0 bg-[#0a0a0a]" />

      {/* Content — constrained to mobile container */}
      <div className="relative flex flex-col flex-1 max-w-md mx-auto w-full px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+2rem)]">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-auto">
          <div>
            <p className="text-white text-base font-semibold tracking-tight">Trace</p>
            <p className="text-white/40 text-xs mt-0.5">
              {stage === 'idle' && !followUpQuestion && 'Tap to speak'}
              {stage === 'idle' && followUpQuestion && 'Tap to answer'}
              {stage === 'recording' && 'Listening'}
              {stage === 'thinking' && 'Processing'}
              {stage === 'speaking' && 'Trace is speaking'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20 transition-colors compact"
          >
            <X size={17} />
          </button>
        </div>

        {/* Center — mic + animations */}
        <div className="flex flex-col items-center justify-center flex-1 gap-8">

          {/* Follow-up question bubble */}
          {followUpQuestion && stage === 'idle' && (
            <div className="w-full bg-white/8 border border-white/10 rounded-2xl px-4 py-3.5">
              <p className="text-amber-400 text-[10px] font-semibold uppercase tracking-widest mb-1.5">Trace</p>
              <p className="text-white text-sm leading-relaxed">{followUpQuestion}</p>
            </div>
          )}

          {/* Mic button with pulse rings */}
          <div className="relative flex items-center justify-center">
            {/* Pulse rings — only when recording */}
            {stage === 'recording' && (
              <>
                <div className="absolute w-24 h-24 rounded-full bg-red-500/30 pulse-ring pointer-events-none" />
                <div className="absolute w-24 h-24 rounded-full bg-red-500/20 pulse-ring-2 pointer-events-none" />
              </>
            )}

            {stage === 'thinking' || stage === 'speaking' ? (
              /* Thinking indicator */
              <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            ) : stage === 'recording' ? (
              /* Stop button */
              <button
                onClick={stopRecording}
                className="w-24 h-24 rounded-full bg-red-500 active:scale-95 transition-all shadow-2xl flex items-center justify-center"
              >
                <Square size={26} fill="white" className="text-white" />
              </button>
            ) : (
              /* Mic button */
              <button
                onClick={startRecording}
                className="w-24 h-24 rounded-full bg-white active:scale-95 transition-all shadow-2xl flex items-center justify-center"
              >
                <svg width="30" height="30" viewBox="0 0 24 24" fill="#0a0a0a">
                  <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z" />
                  <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V19H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.08A7 7 0 0 0 19 10z" />
                </svg>
              </button>
            )}
          </div>

          {/* Waveform — only when recording */}
          {stage === 'recording' && (
            <div className="flex items-center justify-center gap-1 h-8">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="waveform-bar w-0.5 rounded-full bg-white/60"
                />
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-red-400 text-xs text-center max-w-xs">{error}</p>
          )}
        </div>

        {/* Bottom hint */}
        <p className="text-center text-white/20 text-xs">
          {stage === 'recording' ? 'Tap square to stop' : 'ElevenLabs · Claude'}
        </p>
      </div>
    </div>
  )
}

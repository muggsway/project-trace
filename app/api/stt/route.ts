import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/stt
 * Receives audio blob, forwards to ElevenLabs Scribe v1, returns transcript.
 * API key stays server-side.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })
  }

  const formData = await req.formData()
  const audio = formData.get('audio') as Blob | null
  if (!audio) {
    return NextResponse.json({ error: 'No audio provided' }, { status: 400 })
  }

  const elevenForm = new FormData()
  elevenForm.append('file', audio, 'recording.webm')
  elevenForm.append('model_id', 'scribe_v1')

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: elevenForm,
  })

  if (!response.ok) {
    const error = await response.text()
    return NextResponse.json({ error: 'Transcription failed', detail: error }, { status: 502 })
  }

  const result = await response.json()
  return NextResponse.json({ transcript: result.text ?? '' })
}

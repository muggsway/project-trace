import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/stt
 *
 * Receives an audio blob from the browser, forwards it to ElevenLabs
 * Scribe v1 for transcription, and returns the transcript text.
 *
 * Keeping the API key server-side so it's never exposed to the client.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })
  }

  const formData = await req.formData()
  const audio = formData.get('audio') as Blob | null

  if (!audio) {
    return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
  }

  // Forward to ElevenLabs Speech-to-Text
  const elevenForm = new FormData()
  elevenForm.append('file', audio, 'recording.webm')
  elevenForm.append('model_id', 'scribe_v1')
  elevenForm.append('language_code', 'en')  // pin to English — prevents auto-detect picking wrong language

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
    },
    body: elevenForm,
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('ElevenLabs STT error:', error)
    return NextResponse.json({ error: `ElevenLabs: ${error}` }, { status: 502 })
  }

  const result = await response.json()
  return NextResponse.json({ transcript: result.text ?? '' })
}

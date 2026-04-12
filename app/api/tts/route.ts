import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/tts
 *
 * Converts text to speech using ElevenLabs and returns the audio stream.
 * Used by the Workout Generator to speak Claude's responses aloud.
 */

const VOICE_ID = '21m00Tcm4TlvDq8ikWAM' // Rachel — calm, conversational

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })
  }

  const { text } = await req.json()
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 })
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_flash_v2_5',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        speed: 1.2,            // 1.0 = default, 1.2 = brisk conversational pace
      },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('ElevenLabs TTS error:', error)
    return NextResponse.json({ error: 'TTS failed', detail: error }, { status: 502 })
  }

  const audioBuffer = await response.arrayBuffer()
  return new Response(audioBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audioBuffer.byteLength),
    },
  })
}

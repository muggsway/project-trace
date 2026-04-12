# Trace — AI Health Companion

Trace is a personal health-tracking app that connects wearable data, voice-logged nutrition and mood, and AI-generated insights into a single mobile interface. Built for the Anthropic Hackathon — Biology & Healthcare track.

---

## What it does

**Home screen**
- Pulls today's Garmin data (HRV, sleep, resting HR, steps, body battery, stress) and compares against your 14-day averages
- Tracks nutrition — log meals by voice, see daily calories, protein, carbs, fat, and fibre
- Shows supplements logged today, hydration progress, workout summary, and mood
- Surfaces active warnings from your latest AI analysis (e.g. supplement timing conflicts)
- Today's Log — a chronological timeline of everything you've tracked

**Voice logging**
- Tap the mic, speak naturally: "I had oatmeal with banana and two eggs, and took my iron supplement"
- Claude extracts structured entries (food with macros, supplements, mood, workouts, water)
- If details are missing, Trace asks a follow-up question via ElevenLabs TTS and waits for your answer
- Multi-turn conversation until all data is captured, then saves to DB

**Food log**
- Photo logging — take a photo of your meal, Claude Vision estimates macros
- Voice logging via the main voice button
- Daily macro totals with breakdown by protein, carbs, fat, and fibre

**Analyze**
- AI-generated insights from your last 14 days of Garmin data + today's journal
- Three sections: What Worked Well · What Was Average · Watch Out
- Evidence-backed, cross-domain connections (e.g. sleep ↔ HRV, supplement timing ↔ absorption)
- Regenerate on demand
- Send summary to WhatsApp

**Workout generator**
- Describe what you want ("30 min upper body, moderate intensity")
- Claude generates a structured workout plan
- Supports strength training and running

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend + Backend | Next.js 15 (App Router, TypeScript) |
| Database | Neon — serverless Postgres |
| AI | Anthropic Claude (`claude-sonnet-4-6`) |
| Speech-to-text | ElevenLabs Scribe v1 |
| Text-to-speech | ElevenLabs (`eleven_flash_v2_5`) |
| Wearable data | Garmin Connect via `garminconnect` Python library |
| Notifications | Twilio WhatsApp |
| Styling | Tailwind CSS v4 |

---

## Architecture

```
Browser (mobile-width UI)
  │
  ├── Voice input  →  /api/stt        (ElevenLabs Scribe)
  │                →  /api/log/parse  (Claude — multi-turn, extracts entries + macros)
  │                →  journal_entries (Neon DB)
  │
  ├── Photo input  →  /api/log/photo  (Claude Vision — food detection + macro estimation)
  │
  ├── Home screen  →  /api/health     (Garmin snapshot + 14-day averages)
  │                →  /api/log/today  (today's journal entries)
  │                →  /api/warnings   (friction items from latest insights_cache)
  │
  ├── Analyze      →  /api/insights/generate  (Claude — 14-day analysis → insights_cache)
  │                →  /api/insights/status    (reads cached insights)
  │                →  /api/notify/whatsapp    (Twilio — sends summary)
  │
  └── Workout gen  →  /api/workout/generate   (Claude — structured plan)

scripts/garmin_sync.py  (runs separately, pulls Garmin → Neon)
ara/main.py             (cron agent — scheduled 9 PM ET WhatsApp digest)
```

---

## Database schema

| Table | Purpose |
|---|---|
| `journal_entries` | Voice/photo-logged food, supplements, mood, workouts, water |
| `tracker_snapshots` | Daily Garmin metrics (HRV, sleep, HR, steps, stress, body battery) |
| `workouts` | Garmin workout history (type, duration, HR, distance) |
| `planned_workouts` | Claude-generated workout plans |
| `insights_cache` | Latest AI analysis — what worked, patterns, friction, raw JSON |
| `habits` | Recurring supplement/habit tracking |
| `health_summaries` | Daily aggregated summaries |

---

## Setup

### Prerequisites

- Node.js 18+
- Python 3.9+
- Neon Postgres database
- Garmin Connect account

### 1. Clone and install

```bash
git clone <repo-url>
cd project-trace
npm install
pip install -r scripts/requirements.txt
```

### 2. Environment variables

```bash
cp .env.local.example .env.local
```

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | [console.neon.tech](https://console.neon.tech) → your project → Connection Details |
| `GARMIN_EMAIL` | Your Garmin Connect login email |
| `GARMIN_PASSWORD` | Your Garmin Connect password |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `ELEVENLABS_API_KEY` | [elevenlabs.io](https://elevenlabs.io) → Profile → API Key |
| `TWILIO_ACCOUNT_SID` | [console.twilio.com](https://console.twilio.com) → Account Info |
| `TWILIO_AUTH_TOKEN` | [console.twilio.com](https://console.twilio.com) → Account Info |
| `TWILIO_WHATSAPP_TO` | Your WhatsApp number with country code (e.g. `+14155550123`) |
| `ARA_API_KEY` | [app.ara.so](https://app.ara.so) → Settings → System → API Key |

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## WhatsApp — incoming messages (local setup)

The bidirectional WhatsApp agent (`/api/whatsapp/incoming`) receives messages via a Twilio webhook. Twilio needs a public URL to reach your local server — use [ngrok](https://ngrok.com) to create one.

### 1. Install ngrok and start a tunnel

```bash
# Install (macOS)
brew install ngrok

# Expose your local Next.js server
ngrok http 3000
```

Copy the `https://` forwarding URL ngrok prints (e.g. `https://abc123.ngrok-free.app`).

### 2. Set the Twilio webhook

1. Go to [console.twilio.com](https://console.twilio.com) → Messaging → Senders → WhatsApp Senders
2. Click your sandbox or approved sender
3. Under **"When a message comes in"**, paste:
   ```
   https://abc123.ngrok-free.app/api/whatsapp/incoming
   ```
4. Set the method to **HTTP POST** and save

### 3. Add Twilio env vars

Make sure `.env.local` has:

```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   # your Twilio sandbox number
TWILIO_WHATSAPP_TO=whatsapp:+1...            # your personal number
```

### 4. Test

Start the app and keep ngrok running in a separate terminal:

```bash
# Terminal 1
npm run dev

# Terminal 2
ngrok http 3000
```

Text your Twilio WhatsApp number. Examples:
- "How did I sleep last night?" → Claude replies with your real Garmin data
- "Log iron supplement 400mg" → logged to DB, confirmed in reply

> **Note:** The ngrok URL changes every time you restart ngrok (on the free plan). Update the Twilio webhook URL each session, or use a [static domain](https://ngrok.com/docs/getting-started/#step-4-always-use-the-same-domain) (ngrok free tier includes one).

---

## Data sync

Garmin sync runs automatically every time you start the app (`npm run dev` or `npm start`). HRV and sleep are computed by Garmin overnight — start the app in the morning to get last night's values.

To backfill more history manually:

```bash
python scripts/garmin_sync.py --days 30
```

---

## Key files

```
app/
  page.tsx                      Home screen
  food/page.tsx                 Food log
  analyze/page.tsx              AI insights
  api/
    health/                     Garmin snapshot endpoint
    log/parse/                  Claude voice parser (multi-turn)
    log/photo/                  Claude Vision food logger
    log/today/                  Today's journal entries
    insights/generate/          AI insight generation
    insights/status/            Cached insights reader
    notify/whatsapp/            Twilio WhatsApp sender
    whatsapp/incoming/          Twilio inbound webhook (bidirectional agent)
    stt/                        ElevenLabs speech-to-text
    tts/                        ElevenLabs text-to-speech
    workout/generate/           Claude workout planner
components/
  VoiceOverlay.tsx              Full-screen voice recording UI
  WorkoutGeneratorModal.tsx     Workout generation chat UI
  LogTimeline.tsx               Today's log feed
lib/
  insights-prompt.ts            Claude prompt for analysis
  entries-context.tsx           Global journal entries state
  db.ts                         Neon DB client
scripts/
  garmin_sync.py                Garmin → Neon sync (runs automatically on app start)
  ara_agent.py                  Optional Ara-based WhatsApp agent (deploy once)
ara/
  main.py                       Scheduled WhatsApp digest agent (9 PM ET)
```

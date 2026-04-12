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

### 3. Sync Garmin data

```bash
python scripts/garmin_sync.py --days 14
```

First run may prompt for an MFA code. Tokens are then cached at `~/.garminconnect` and reused automatically. HRV and sleep are computed by Garmin overnight — run the sync in the morning to get last night's values.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
  garmin_sync.py                Garmin → Neon sync (run standalone)
ara/
  main.py                       Scheduled WhatsApp digest agent
```

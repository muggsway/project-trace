# Project Trace

A health-tracking app that correlates wearable data (Garmin), voice-logged meals/supplements, and AI-generated insights — built for the Anthropic Hackathon, Biology & Healthcare track.

---

## Setup

### Prerequisites

- Node.js 18+
- Python 3.9+
- A [Neon](https://neon.tech) Postgres database
- A Garmin Connect account (the same login you use on the Garmin app)

### 1. Clone the repo

```bash
git clone <repo-url>
cd project-trace
```

### 2. Install Node dependencies

```bash
npm install
```

### 3. Install Python dependencies

```bash
pip install -r scripts/requirements.txt
```

### 4. Configure environment variables

Copy the example file and fill in your values:

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
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | [console.twilio.com](https://console.twilio.com) → Account Info |
| `TWILIO_WHATSAPP_TO` | Your WhatsApp number with country code (e.g. `+14155550123`) |
| `ARA_API_KEY` | [app.ara.so](https://app.ara.so) → Settings → System → API Key |

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Data sync

Garmin sync runs automatically every time you start the app (`npm run dev` or `npm start`). It connects to Garmin Connect, writes today's snapshot and recent workouts to Neon, then triggers Claude insight regeneration.

HRV and sleep are computed by Garmin overnight — start the app in the morning to get last night's values.

To backfill more history manually:

```bash
python scripts/garmin_sync.py --days 30
```

---

## WhatsApp agent (Ara)

Project Trace has two WhatsApp integrations:

### 1. Bidirectional health assistant (`scripts/ara_agent.py`)

A conversational agent you can text to ask health questions or log entries:
- "How did I sleep last night?" → pulls real data from the DB
- "Log iron supplement 400mg" → writes to `journal_entries`
- "What are my active warnings?" → surfaces the latest Claude insights

This is deployed to Ara's cloud **once** by the project owner — everyone else just texts it:

```bash
ara deploy scripts/ara_agent.py
```

### 2. Daily summary push (`ara/main.py`)

A scheduled agent that runs automatically every night at 9 PM ET. It fetches today's data, generates a Claude summary, and sends it to your WhatsApp via Twilio. No action needed — it runs on Ara's servers once deployed:

```bash
ara deploy ara/main.py
```

> Both `ara deploy` commands are **one-time deploys** — not something anyone cloning the repo needs to run. Only re-deploy if you change the agent code.

---

## Project structure

```
app/             Next.js app (pages, API routes)
components/      React components
lib/             Shared types, DB client, utilities
scripts/
  garmin_sync.py     pulls Garmin data → Neon DB, triggers insight generation
  ara_agent.py       bidirectional WhatsApp health agent (deploy to Ara once)
  requirements.txt   Python deps for both scripts
ara/
  main.py            scheduled daily summary agent (9 PM ET push via WhatsApp)
```

Key docs:
- `REQUIREMENTS.md` — full feature spec, data model, demo script
- `DB_SCHEMA.md` — database schema reference

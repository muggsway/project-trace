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

### 3. Install Python dependencies (Garmin sync)

```bash
pip install -r scripts/requirements.txt
```

### 4. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | [console.neon.tech](https://console.neon.tech) → your project → Connection Details |
| `GARMIN_EMAIL` | Your Garmin Connect login email |
| `GARMIN_PASSWORD` | Your Garmin Connect password |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `ELEVENLABS_API_KEY` | [elevenlabs.io](https://elevenlabs.io) → Profile → API Key |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | [console.twilio.com](https://console.twilio.com) → Account Info |
| `DEMO_PHONE_NUMBER` | Your WhatsApp number with country code (e.g. `+14155550123`) |

### 5. Sync Garmin data

Run once to pull your health data into the DB:

```bash
python scripts/garmin_sync.py --days 14
```

On first run you may be prompted for an MFA code if your Garmin account has 2FA enabled. After that, tokens are cached at `~/.garminconnect` and reused automatically.

### 6. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app hot-reloads as you make changes.

---

## Data sync

The Garmin sync script is a one-shot pull — run it whenever you want fresh data:

```bash
python scripts/garmin_sync.py           # today's snapshot + last 14 days of workouts
python scripts/garmin_sync.py --days 30 # backfill more workout history
```

HRV and sleep data are computed by Garmin overnight, so run the sync in the morning to get last night's values.

---

## Project structure

```
app/           Next.js app (pages, API routes)
components/    React components
lib/           Shared types, DB client, utilities
scripts/       Python scripts (run separately from the Next.js app)
  garmin_sync.py       pulls Garmin data → Neon DB
  requirements.txt     Python dependencies
public/        Static assets
```

Key docs:
- `REQUIREMENTS.md` — full feature spec, data model, demo script
- `GARMIN_SYNC.md` — Garmin integration details and troubleshooting

@AGENTS.md

# Project Trace

A Next.js (TypeScript) health-tracking app for the Anthropic Hackathon — Biology & Healthcare track.

## Key docs — read these before writing any code

- **REQUIREMENTS.md** — full feature spec, data model, team split, and demo script

## Stack

- **Frontend/Backend:** Next.js (TypeScript, App Router) — one repo
- **Database:** Neon (serverless Postgres) via `@neondatabase/serverless`
- **AI:** Anthropic Claude (`claude-sonnet-4-6`) for voice parsing and insight generation
- **STT:** ElevenLabs Scribe v1
- **Notifications:** Twilio WhatsApp
- **Garmin data:** `garminconnect` Python library — see `scripts/garmin_sync.py`

## Repo structure

```
app/             Next.js app (routes, pages, API handlers)
components/      React components
lib/             Shared types, DB client, utilities
scripts/         Python scripts (Garmin sync — runs separately, not part of Next.js)
  garmin_sync.py     pulls Garmin data → Neon DB
  requirements.txt   Python deps — install with: pip install -r scripts/requirements.txt
REQUIREMENTS.md  Full project spec
GARMIN_SYNC.md   Garmin integration guide
```

## What to clean up

These files are deprecated stubs — delete them:
- `app/api/terra/` (whole directory)
- `app/api/open-wearables/` (whole directory)
- `OPEN_WEARABLES.md`

## Important constraints

- Single-user demo — no auth layer
- `scripts/` contains Python, everything else is TypeScript
- Do not add Python dependencies to `package.json` — use `scripts/requirements.txt`
- Do not modify `scripts/garmin_sync.py` to add Next.js app logic — keep it a standalone sync script

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
  api/
    notify/whatsapp/    POST — sends daily summary to user's WhatsApp (outbound)
    whatsapp/incoming/  POST — Twilio webhook, bidirectional agent (inbound + replies)
    insights/generate/  POST — Claude insight generation
    log/parse/          POST — voice/text log parser
    migrate/            GET  — run once to apply DB schema migrations
components/      React components
lib/             Shared types, DB client, utilities
scripts/         Python scripts (Garmin sync — runs separately, not part of Next.js)
  garmin_sync.py     pulls Garmin data → Neon DB
  requirements.txt   Python deps — install with: pip install -r scripts/requirements.txt
REQUIREMENTS.md  Full project spec
GARMIN_SYNC.md   Garmin integration guide
```

## WhatsApp bidirectional agent

Bidirectional WhatsApp is handled by the **Ara agent** (`scripts/ara_agent.py`), not by a Next.js route.
The Ara SDK app deploys to Ara's platform, which manages the WhatsApp channel.

**Deploy the Ara agent:**
```bash
pip install -r scripts/requirements.txt
ara secrets set DATABASE_URL "your-neon-connection-string"
ara deploy scripts/ara_agent.py
```

**How it works:**
- User texts their Ara WhatsApp number → Ara routes to `health_agent` in `ara_agent.py`
- Agent calls `get_health_context` or `get_todays_summary` to pull live data from Neon DB
- Agent calls `log_health_entry` if the user mentions food, supplements, symptoms, etc.
- Ara delivers the reply back to WhatsApp automatically

**Fallback — Twilio inbound:**
`app/api/whatsapp/incoming/route.ts` is the Twilio-based fallback (full implementation in git history).
To switch back: restore the implementation from git and configure Twilio's webhook to point to that route.

**Outbound daily summary** is still handled by Twilio via `app/api/notify/whatsapp/route.ts` — unchanged.

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

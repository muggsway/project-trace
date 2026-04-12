# Task: Wire up and verify the Ara bidirectional WhatsApp agent

## What's already done

- `scripts/ara_agent.py` — Ara SDK app with three tools (`get_health_context`, `log_health_entry`, `get_todays_summary`) and a `health_agent` entrypoint. Written but not yet deployed or tested.
- `scripts/requirements.txt` — includes `ara-sdk`, `psycopg2-binary`, `python-dotenv`, `garminconnect`, `curl_cffi`
- `CLAUDE.md` → "WhatsApp bidirectional agent" section — documents the full approach
- `.env.local.example` — includes `ARA_API_KEY` and `ARA_RUNTIME_KEY` slots

## Your job

### 1. Read the Ara SDK docs first

Before touching any code, fetch the full documentation index and read the relevant pages:

```
https://docs.ara.so/llms.txt        ← full doc index
https://docs.ara.so/sdk/quickstart  ← install + deploy loop
https://docs.ara.so/sdk/reference   ← exact API surface
```

Cross-check `scripts/ara_agent.py` against the actual SDK. Fix anything that doesn't match — decorator signatures, how `Secret` works, how `skills=` maps tool names, the `input` dict shape the agent receives, etc.

### 2. Install dependencies

```bash
pip install -r scripts/requirements.txt
```

Verify `ara-sdk` imports cleanly:

```bash
python -c "from ara_sdk import App; print('ok')"
```

### 3. Authenticate with Ara

```bash
ara auth login
```

Or set `ARA_API_KEY` in the environment (get it from app.ara.so → Settings → System → API Key).

### 4. Set the DATABASE_URL secret

```bash
ara secrets set DATABASE_URL "your-neon-connection-string"
```

This syncs the Neon connection string to Ara's vault so the agent can reach the DB at runtime.

### 5. Deploy

```bash
ara deploy scripts/ara_agent.py
```

Save the returned `runtime_key` — add it to `.env.local` as `ARA_RUNTIME_KEY`.

### 6. Verify the agent works

Send a test message through the Ara CLI or SDK:

```bash
ara run scripts/ara_agent.py --message "What was my HRV yesterday?"
ara run scripts/ara_agent.py --message "Log that I had black coffee just now"
```

Confirm:
- `get_health_context` returns real data from Neon (or a clear "no data yet" if DB is empty)
- `log_health_entry` writes a row to `journal_entries` with `source = 'whatsapp'`
- Agent replies are short, plain text, specific

### 7. Verify on WhatsApp (if Ara WhatsApp is configured)

Text the Ara WhatsApp number:
- "How did I sleep last night?" → should reference actual sleep data
- "Log my iron supplement 400mg" → should confirm and write to DB
- "What are my active warnings?" → should surface the latest insights_cache warnings

### 8. Clean up deprecated files

Delete these — they are stubs with no active logic:

```
app/api/terra/           ← whole directory
app/api/open-wearables/  ← whole directory  
OPEN_WEARABLES.md
```

The Twilio fallback at `app/api/whatsapp/incoming/route.ts` should be KEPT — it is intentionally stubbed as a fallback. Do not delete it.

## Success criteria

- [ ] `ara deploy` completes without errors
- [ ] `ara run --message "..."` returns a relevant, data-grounded response
- [ ] `log_health_entry` tool writes to `journal_entries` and is visible in the app's log timeline
- [ ] Deprecated stub files deleted
- [ ] `CLAUDE.md` still accurately describes the setup (update if anything changed during deploy)

## Key files to reference

- `scripts/ara_agent.py` — the agent (may need fixes after reading SDK docs)
- `scripts/requirements.txt` — Python deps
- `CLAUDE.md` — project overview and WhatsApp agent section
- `GARMIN_SYNC.md` — how Garmin data gets into the DB (context only)
- `lib/types.ts` — data model types (for understanding the DB schema)
- `app/api/insights/generate/route.ts` — how health context is assembled (mirror this logic in the agent's `get_health_context` tool)

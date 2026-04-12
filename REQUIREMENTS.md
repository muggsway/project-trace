# Project Trace — Requirements Document

> Hackathon: Biology & Healthcare Track
> Build window: 3 hours
> Team: 3–4 people (no native mobile developers)
> Demo style: End-to-end narrative story

---

## 1. Problem

Fitness enthusiasts who operate on data have no single place to correlate information across sources. Your fitness tracker knows your HRV and sleep. Your memory knows you took iron with coffee this morning. No system triangulates these to surface a genuinely useful, specific, actionable warning. Generic wellness apps give generic advice. Project Trace gives you the warning that iron absorption is blocked when taken within 30 minutes of coffee — because it *knows* you did exactly that today.

---

## 2. Target User

Fitness enthusiasts who:
- Track data obsessively (steps, HRV, sleep stages, workouts, supplements, food)
- Are frustrated by siloed data (your fitness tracker, food logs, supplement trackers all separate)
- Want insights that are *earned* — not generic, not obvious, only shown when truly warranted

---

## 3. Core Value Proposition

One voice tap logs everything. The app triangulates your journal with tracker data to surface *specific*, *actionable* warnings and insights — delivered in-app and via WhatsApp at end of day.

---

## 4. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js (React) | Full-stack, one repo, hackathon-friendly |
| Database | Neon (Postgres, serverless) | Free tier, Claude Code MCP integration |
| AI/LLM | Claude claude-sonnet-4-6 | Insight generation, log parsing, pattern inference |
| STT | ElevenLabs (Scribe v1) | Speech-to-text for voice log input |
| Tracker Input | Terra API (hackathon tier) | Bridges fitness trackers (e.g. Apple Health) without native app |
| Notifications | Twilio for WhatsApp | Sandbox works without Meta verification |
| Auth | None (single-user demo) | Eliminates 30+ min of build time |

---

## 5. Features

### 5.1 Must-Haves (Non-Negotiable for Demo)

1. **Voice log with ElevenLabs STT** — tap overlay → speak → ElevenLabs Scribe transcribes → Claude parses into structured entries
2. **Tentative entry approval** — habits auto-populate as pending; user approves inline
3. **Tracker tiles** — HRV, sleep score, steps, resting HR from Terra API on dashboard
4. **End-of-day summary** — Claude-generated insights page in app + WhatsApp delivery via Twilio

### 5.2 Nice-to-Have (If Time Permits)

- Photo-based food detection (future roadmap item)
- Multiple user profiles / auth
- Push notifications (web)
- Configurable end-of-day time per user

---

## 6. Data Model

### 6.1 Entities

#### `journal_entries`
```sql
id              UUID PRIMARY KEY
entry_type      ENUM('food', 'drink', 'supplement', 'symptom', 'mood', 'energy', 'workout')
description     TEXT          -- e.g. "black coffee", "vitamin D 2000IU", "mild knee pain"
quantity        TEXT          -- e.g. "1 cup", "400mg" (optional, parsed from voice)
logged_at       TIMESTAMPTZ   -- when it occurred (extracted from voice or defaulted to now)
created_at      TIMESTAMPTZ   -- when the entry was created in the app
status          ENUM('confirmed', 'pending')  -- pending = tentative from habit
source          ENUM('voice', 'habit', 'manual')
```

#### `habits`
```sql
id              UUID PRIMARY KEY
description     TEXT          -- e.g. "black coffee"
entry_type      ENUM('food', 'drink', 'supplement', ...)
usual_time      TIME          -- e.g. 09:00
created_at      TIMESTAMPTZ
active          BOOLEAN
```

#### `tracker_snapshots`
```sql
id              UUID PRIMARY KEY
date            DATE
hrv_ms          FLOAT         -- HRV in milliseconds
sleep_hours     FLOAT
sleep_score     INT           -- 0-100 if available
resting_hr      INT
steps           INT
deep_sleep_pct  FLOAT
synced_at       TIMESTAMPTZ
```

#### `workouts`
```sql
id              UUID PRIMARY KEY
terra_id        TEXT UNIQUE   -- Terra's workout ID, for deduplication on re-sync
workout_type    TEXT          -- e.g. "Running", "Cycling", "Strength Training", "HIIT"
started_at      TIMESTAMPTZ   -- workout start time (key for correlating with journal entries)
ended_at        TIMESTAMPTZ
duration_mins   INT
distance_km     FLOAT         -- null for non-distance workouts (e.g. strength)
calories_active INT
avg_hr          INT           -- average heart rate during workout
max_hr          INT
source          TEXT          -- e.g. 'apple_health', 'garmin', etc. (via Terra)
date            DATE          -- derived from started_at, for easier daily queries
synced_at       TIMESTAMPTZ
```

**Note on workout deduplication:** Voice log entries with `entry_type = 'workout'` (e.g. "had a light jog") and `workouts` records from Terra are kept separate. The insight engine sees both — if a user says "had a 30-min run" and Terra also sends a Running workout that day, Claude correlates them rather than treating them as contradictions. The Terra record is authoritative for metrics (HR, distance, calories); the voice entry may carry context the sensor can't (e.g. "felt tired during the run").

#### `health_summaries` (long-term memory)
```sql
id              UUID PRIMARY KEY
period_start    DATE
period_end      DATE
summary_text    TEXT          -- Claude-generated rolling summary of older data
created_at      TIMESTAMPTZ
```

### 6.2 Notes on Timestamps

Timestamps are first-class data. The time a supplement was taken relative to food is a key signal (e.g., iron + coffee within 30 minutes). All entries store `logged_at` (when the event happened), not just `created_at` (when it was entered). Claude extracts this from voice: "I had eggs at 8 and coffee at 8:30" produces two entries with distinct `logged_at` values.

---

## 7. Feature Specifications

### 7.1 Voice Log — Siri-Style Overlay

**Trigger:** Floating mic button accessible from any screen (bottom-center).

**UX Flow:**
1. User taps mic button
2. Full-screen overlay appears with waveform animation (dark overlay on light background)
3. ElevenLabs STT streams transcription in real-time (or on completion)
4. On stop: transcription sent to Claude for parsing
5. Claude returns structured entries (JSON)
6. Entries flash into the timeline as `confirmed` (or `pending` if matching a habit)
7. Overlay dismisses

**Claude Parsing Prompt Context:**
- Current date/time
- User's existing habits (for deduplication)
- Instruction to extract: entry_type, description, quantity, logged_at
- Instruction to detect habit declarations: "I drink coffee every morning around 9am" → create/update habit record

**Error Handling:**
- If ElevenLabs STT fails: fall back to browser Web Speech API
- If Claude parsing fails: show raw transcription as a manual text entry for user to categorize

---

### 7.2 Tentative Entry Approval

**Logic:**
- Each day at midnight (or on first app open), active habits are auto-generated as `status: 'pending'` entries at their `usual_time`
- Pending entries appear in the timeline with a distinct yellow/amber highlight
- Each pending entry shows three inline actions: **Accept** | **Edit** | **Dismiss**

**Accept:** Sets `status = 'confirmed'`, no other change
**Edit:** Opens a small inline form to adjust description/quantity/time before confirming
**Dismiss:** Deletes the pending entry for today (habit is not affected)

---

### 7.3 Tracker Dashboard Tiles

**Displayed metrics (5 tiles, 2×2 grid + 1 full-width workout row):**
- HRV (ms) — with 14-day trend sparkline
- Sleep (hours + score if available)
- Steps — vs personal daily average
- Resting Heart Rate — vs 30-day average
- **Today's Workout(s)** — full-width card showing workout type, duration, distance (if applicable), avg HR. If multiple workouts today, show as a compact list. If no workout logged, card is dimmed/empty (not hidden — its absence is itself data).

**Sync frequency:** Every 48 hours (Terra webhook or manual pull)

**Terra integration flow:**
- User completes Terra OAuth on first setup (iOS Health app authorization)
- Terra sends webhook to `/api/terra/webhook` with data payload
- Daily summary data stored in `tracker_snapshots`; individual workouts stored in `workouts` table

**Anomaly highlighting:** If today's value deviates >10% from 14-day average, tile background turns amber. Tooltip explains the deviation.

---

### 7.4 Insight Engine

#### Context bundled into every Claude insight call:
1. Last 30 days of `journal_entries` (confirmed only)
2. Last 14 days of `tracker_snapshots`
3. Last 14 days of `workouts` (type, duration, avg HR, distance, calories)
4. All active `habits`
5. Today's confirmed + pending entries
6. Latest `health_summaries` record (compressed history of older data)

#### Long-term memory (data older than 30 days journal / 14 days tracker):

**Rolling summary:** A background job runs nightly. It compresses data outside the active window into a structured natural-language summary stored in `health_summaries`. This summary is always included in Claude's insight context.

**Fetch tool:** Claude is given a `fetch_historical_data(start_date, end_date, data_type)` tool it can invoke during insight generation when it needs to verify a pattern or cross-check a specific historical period.

#### Quality bar for insights:

> **Only show an insight if it is specific, true for this user today, and requires an action.** Do not show generic health advice. If the user's hydration is fine, don't mention hydration. If nothing is wrong, show nothing. An empty insight section is better than a filler insight.

**Examples of acceptable insights:**
- "You took iron and had coffee within 25 minutes today — iron absorption is significantly reduced. Try spacing these by at least 1 hour."
- "Your HRV today (42ms) is 19% below your 14-day average (52ms) despite a rest day. Unusual. Watch for signs of overreaching."
- "You logged joint pain for the 3rd consecutive day and haven't logged omega-3 in 5 days. This may be related to inflammation."
- "You ran 8.2km today with an avg HR of 172bpm — that's in Zone 4/5, higher than your usual long-run effort. Your HRV was already low this morning. Consider a recovery run next time conditions look like this."
- "You did a strength session and logged creatine today — good pairing. You've done this 4 times in the last 2 weeks and your sleep score has averaged 82 on those nights vs. 71 otherwise."

**Examples of unacceptable insights:**
- "Staying hydrated is important for performance." (generic)
- "Great job logging today!" (filler)
- "Consider getting more sleep." (not grounded in user's actual data today)

---

### 7.5 End-of-Day Summary

**In-app page:** Always accessible via "Today's Summary" tab. Shows full summary generated on demand or at scheduled time.

**WhatsApp message format (Twilio):**

```
🟢 What worked well
• [1-2 sentences on the positive — e.g. "Workout was excellent. Hydration consistent all day."]

🟡 What was average
• [1-2 sentences on what could improve — e.g. "Sleep was below your average. You logged 5.8hrs vs your usual 7.2hrs."]

⚠️ Watch out (only if applicable — omit entirely if nothing)
• [Specific warning + action — e.g. "Iron and coffee were logged 20 mins apart. Space them by 1hr tomorrow."]
```

**Trigger:** Configurable time (default: 9pm). For the hackathon demo, triggerable on-demand via a "Send Now" button.

---

## 8. Dashboard (Home Screen)

**Layout (top to bottom):**

1. **Header:** "Today, [Date]" + floating mic button
2. **Active Insights Banner** (only if insights exist for today): Amber/yellow strip showing count of active warnings. Tap to expand.
3. **Tracker Tiles** (2×2 grid + workout row): HRV, Sleep, Steps, Resting HR, Today's Workout
4. **Today's Log Timeline**: Chronological list of all entries, newest at top
   - Confirmed entries: white card
   - Pending/tentative entries: amber card with Accept | Edit | Dismiss actions
   - Entries grouped by hour if multiple within same hour

**Design:** Light mode, clinical. White and light grey background. Inter or SF Pro font. One accent color (amber/gold) used only for warnings and pending states. Data-forward — numbers are large and prominent.

---

## 9. WhatsApp / Twilio Setup

Twilio WhatsApp sandbox requires:
1. Create Twilio account (free)
2. Enable WhatsApp sandbox in Twilio console
3. User joins sandbox by sending a code to Twilio's WhatsApp number
4. Twilio sends messages from sandbox number to user's WhatsApp

**Note:** This setup takes ~15–20 minutes. Should be completed before the hackathon starts, not during the 3-hour build window.

**API call:** `POST /api/notify/whatsapp` — accepts `{ message: string, phone: string }`, calls Twilio Messages API.

---

## 10. Demo Script (End-to-End Narrative)

> **"This is Riya. She's been training for a half-marathon and obsessively tracks her data."**

1. **Open app:** Show dashboard with pre-seeded Tracker tiles. HRV tile is amber (19% below average). "Riya woke up and noticed her HRV was off today."

2. **Voice log:** Tap mic → speak: "Had black coffee at 8, took my iron supplement at 8:15, eggs, had a light jog." Overlay shows waveform → entries appear in timeline. The workout tile also shows the tracker's record of a 5.4km run synced from Terra — the voice log and sensor data sit side by side.

3. **Insight fires:** Two warnings appear in the banner: "Iron taken 15 minutes after coffee — absorption blocked. Space by 1 hour." And: "You ran in Zone 4 with HRV already 19% below baseline — high overreaching risk. Consider active recovery tomorrow."

4. **Tentative approval:** "Riya's morning habits are already pre-filled — she just taps accept for the ones that apply."

5. **End-of-day summary (on demand):** Tap "Generate Summary." Summary page appears.

6. **WhatsApp:** Tap "Send Now" → show phone receiving WhatsApp message in real time.

> **"Riya got a warning she wouldn't have found on her own — across two completely separate data sources. That's Project Trace."**

---

## 11. Build Strategy & Team Split

### Claude Usage Strategy

Claude Code usage limits are a real constraint. The team runs in **two waves** to maximize throughput without all four people hitting limits at the same time.

- **Wave 1 (Claude-active):** 2 people build the AI-heavy features using Claude Code
- **Wave 1 concurrent (no Claude needed):** Other 2 people do all infrastructure setup — clicking through dashboards, writing SQL, configuring services — none of which requires Claude
- **Wave 2 (Claude switches):** When Wave 1 accounts hit limits, the other 2 accounts take over to build the UI and wire everything together. Wave 1 people can assist with any remaining non-Claude tasks.

---

### Wave 1 — Claude-Active (2 people)

These are the two most AI-heavy tracks. Start here because they define the core data contracts everything else depends on.

#### Voice & Parsing
**Owner:** Person A (Claude active)
**Tasks:**
- ElevenLabs STT API integration: record audio in browser, POST to ElevenLabs Scribe v1, receive transcription
- Siri-style recording overlay (waveform animation, tap-to-start/stop)
- Claude parsing endpoint (`/api/log/parse`): takes transcription, returns structured `journal_entries[]`
- Handle habit declaration detection in Claude parsing
- Write entries to Neon (confirmed or pending)
- Fallback to browser Web Speech API if ElevenLabs STT fails
- Export and document the API contract for Dashboard & UI

**Deliverable:** `POST /api/log/parse` working end-to-end; tap mic → speak → entries in DB

---

#### Insights & Delivery
**Owner:** Person B (Claude active)
**Tasks:**
- Claude insight generation endpoint (`/api/insights/generate`):
  - Bundles context (30d journal, 14d tracker, 14d workouts, habits, today, rolling summary)
  - Includes `fetch_historical_data` tool definition for Claude
  - Returns structured insights (what worked, what was average, warnings)
  - Enforces quality bar (no generic advice)
- Store generated insights in DB with `generated_at` timestamp
- Twilio WhatsApp integration (`/api/notify/whatsapp`): formats message per §7.5, calls Twilio
- Rolling summary generation endpoint (condenses older data into `health_summaries`)
- Export and document the API contract for Dashboard & UI

**Deliverable:** `POST /api/insights/generate` returns structured insights; WhatsApp message sends successfully

---

### Wave 1 Concurrent — No Claude Needed (2 people)

These tasks are all setup, config, SQL, and scripting. Do them while Wave 1 is running. Claude is not required.

#### Data & Infrastructure
**Owner:** Person C & Person D (no Claude needed)

**Database & Schema**
- Create Neon project, save connection string to `.env.local`
- Write and run all `CREATE TABLE` statements from §6 (copy-paste from this doc — no Claude needed)
- Write DB query functions / Drizzle ORM schema for all entities
- Write seed script: 30 days of realistic tracker snapshots + workout records + journal entries (see seed data guidance below)
- Run seed script and verify data looks correct in Neon console

**External Services Setup**
- **Terra API:** Register for hackathon tier, complete OAuth app setup, note the webhook URL format (`/api/terra/webhook`), test with a sample payload
- **Twilio:** Create account, enable WhatsApp sandbox, send a test message to confirm sandbox works. Save `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` to `.env.local`
- **ElevenLabs:** Create account, generate API key (Scribe v1 access), save to `.env.local`
- **Next.js scaffold:** Run `npx create-next-app@latest project-trace --typescript --tailwind --app`, confirm it boots
- **`.env.local` template:** Document all required keys so Wave 2 people can run the app immediately

**Seed data guidance (no Claude needed — write directly):**
- 30 rows in `tracker_snapshots`: vary HRV between 38–62ms (dip it low 2 days ago for the demo), sleep 5.5–8hrs, steps 4k–14k, resting HR 48–68
- 15 rows in `workouts`: mix of Running (3–9km, avg HR 145–175), Strength (45–60min), Cycling. Include a Zone 4/5 run on the day HRV is low.
- 20 rows in `journal_entries`: include iron + coffee logged close together on today's seed date; omega-3 gap; joint pain entries; mood/energy variations
- 3 rows in `habits`: black coffee ~9am, vitamin D ~8am, omega-3 (with a gap showing it hasn't been confirmed recently)

**Deliverable:** DB seeded and queryable, all API keys in `.env.local`, Next.js app boots, Twilio sandbox tested, Terra registered

---

### Wave 2 — Claude Switches (2 people)

When Wave 1 accounts hit limits, these two pick up Claude and build the UI layer. By this point, the API endpoints from Track B and D are done (or close), and the DB is seeded.

#### Dashboard & UI
**Owner:** Person C & Person D (Claude active, new accounts)
**Tasks:**
- Home screen layout: header, Tracker tiles (HRV, Sleep, Steps, Resting HR + workout row), log timeline
- Wire Tracker tiles to DB (`tracker_snapshots` + `workouts`)
- Today's log timeline: confirmed entries (white card) + pending entries (amber card with Accept | Edit | Dismiss inline)
- Active insights banner (reads from DB, only shown if insights exist)
- Siri-style mic overlay (integrate Voice & Parsing recording component)
- "Today's Summary" page (calls Insights & Delivery API, displays structured result)
- "Send Now" button → calls `/api/notify/whatsapp`
- Light mode, clinical design per §8

**Deliverable:** Full UI wired end-to-end; demo script runs without switching screens awkwardly

---

### Integration Checkpoint (target: ~2hr mark)
All tracks merge. Run the demo script in §10 end-to-end:
- Voice & Parsing entries appear in Dashboard timeline ✓
- Insights & Delivery results appear in Dashboard banner ✓
- WhatsApp message sends and arrives on phone ✓
- Tracker tiles show seeded data with correct anomaly highlighting ✓

---

## 12. Pre-Hackathon Checklist

Complete these **before** the 3-hour clock starts:

- [ ] Neon project created, connection string saved
- [ ] Twilio account created, WhatsApp sandbox enabled, test message sent
- [ ] Terra API hackathon tier approved, API key ready
- [ ] ElevenLabs account created, API key ready (Scribe v1 STT)
- [ ] Anthropic API key ready
- [ ] Next.js repo scaffolded (`npx create-next-app@latest project-trace`)
- [ ] `.env.local` template with all keys documented
- [ ] Team alignment on who owns which track
- [ ] Demo seed data prepared (30 days of tracker + journal entries)

---

## 13. Feature: Workout Generator

### Overview

A conversational workout generator accessible from the home screen. The user describes what they want (or just says "leg day"), Claude gathers any missing information one question at a time, then generates a structured workout plan. Claude is health-context aware — it sees the user's HRV, sleep, and recent workouts before generating, and will proactively suggest scaling down if the user is under-recovered.

Supports: **Strength Training** and **Running** only.

---

### 13.1 Entry Point

A **`+` action button** on the home screen (alongside or near the floating mic button). Tapping it shows two options:

- **Log entry** → opens the existing voice overlay
- **Generate workout** → opens the Workout Generator modal

---

### 13.2 Workout Generator Modal (Full-Screen)

Opens as a full-screen modal, similar in feel to the voice overlay. Contains a **chat thread** — alternating user and Claude bubbles — plus an input bar at the bottom.

**Input bar:**
- Primary: mic button (ElevenLabs STT via `/api/stt`)
- Always-visible text field underneath as fallback
- User can switch between voice and text mid-conversation

**Conversation flow:**
1. User opens modal — Claude greets with a prompt: *"What kind of workout do you want today?"*
2. User responds (voice or text)
3. Claude identifies workout type and checks for missing required fields
4. Claude asks **one missing field per turn** — never dumps all questions at once
5. Once all required fields are collected, Claude generates the workout
6. Generated workout is displayed in the chat as a structured card

---

### 13.3 Required Fields by Workout Type

**Strength Training:**
| Field | Example |
|---|---|
| Muscles targeted | Legs, chest, back, full body |
| Duration | 15 mins, 45 mins |
| Equipment | Full gym / dumbbells only / bodyweight |

Equipment flow: When the user says "strength training", Claude asks: *"Should I assume you have access to a full gym? If not, what equipment do you have or don't have?"*

**Running:**
| Field | Example |
|---|---|
| Duration | 20 mins, 5km |
| Intensity / Zone | Easy (Zone 1-2), Moderate (Zone 3), Hard (Zone 4-5) |

Running intensity is expressed as **heart rate zones (1–5)**:
- Zone 1-2: Easy/recovery
- Zone 3: Moderate/aerobic
- Zone 4-5: Hard/threshold/max

---

### 13.4 Health Context Injection

Before generating, Claude receives the user's current health snapshot:
- Today's HRV (and % deviation from 14-day avg)
- Last night's sleep hours and score
- Yesterday's workout (type, intensity, duration)
- Any symptoms logged in the last 24 hours

Claude uses this to proactively flag recovery concerns and adjust the plan:

> *"Your HRV is 19% below your baseline today and you ran hard yesterday — I'd suggest scaling this leg session down. Want me to keep it moderate, or push through?"*

The user can override at any time. Claude respects the override without pushing back.

---

### 13.5 Generated Workout Format

**Structured with instructions.** Each exercise includes:
- Sets × reps (or duration for running intervals)
- Rest time between sets
- One-line coach tip

**Strength example:**
```
💪 Leg Day — 15 mins · Full gym

Warm-up (2 min)
• Bodyweight squats × 15

Main block
• Barbell Back Squat    3 × 10  |  rest 60s
  → Keep chest up, knees tracking over toes
• Romanian Deadlift     3 × 10  |  rest 60s
  → Hinge at hips, soft bend in knees
• Leg Press             2 × 15  |  rest 45s
  → Full range of motion, don't lock knees at top

Cooldown (1 min)
• Standing quad stretch × 30s each side
```

**Running example:**
```
🏃 Zone 3 Run — 20 mins

Warm-up    5 min  |  Zone 1-2 easy jog
Main block 12 min  |  Zone 3 — steady aerobic effort
             Keep cadence ~170 spm, conversational pace
Cooldown   3 min  |  Zone 1 walk/jog

Target HR: ~140-155 bpm (adjust for your max HR)
```

---

### 13.6 Post-Generation Actions

Once the workout card appears in the chat:

| Action | Behaviour |
|---|---|
| **Save** | Saves to `planned_workouts` table. Appears in today's timeline as a pending workout entry. |
| **Regenerate** | Claude generates a new version with the same inputs. Previous card stays visible above. |
| **Mark as done** | Immediately saves to `planned_workouts` as `completed`. Creates a confirmed journal entry. Modal closes. |

---

### 13.7 Data Model — `planned_workouts` Table

Separate from the `workouts` table (which stores Terra-synced completed workouts).

```sql
CREATE TABLE planned_workouts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_type    TEXT NOT NULL CHECK (workout_type IN ('strength', 'running')),
  duration_mins   INT NOT NULL,
  muscles         TEXT[],           -- e.g. ['legs', 'glutes'] — null for running
  intensity_zone  INT,              -- 1-5, null for strength
  equipment       TEXT,             -- 'full gym', 'bodyweight', etc.
  plan_json       JSONB NOT NULL,   -- full structured workout from Claude
  plan_text       TEXT NOT NULL,    -- rendered text version (for WhatsApp/display)
  status          TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'skipped')),
  health_context  JSONB,            -- snapshot of HRV/sleep/workouts at generation time
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);
```

---

### 13.8 API Route — `/api/workout/generate`

```
POST /api/workout/generate

Body:
{
  messages: { role: 'user'|'assistant', content: string }[]  // full conversation so far
  health_context: {
    hrv_ms: number, hrv_avg_14d: number,
    sleep_hours: number, sleep_score: number,
    last_workout: { type, duration_mins, avg_hr, date } | null,
    recent_symptoms: string[]
  }
}

Response:
{
  type: 'question'    // Claude needs more info → content is the next question
       | 'workout'    // workout is ready → content is the plan
  content: string     // Claude's message text
  workout?: {         // only when type === 'workout'
    workout_type: string
    duration_mins: number
    muscles?: string[]
    intensity_zone?: number
    equipment?: string
    plan_json: object
    plan_text: string
  }
}
```

Claude's system prompt instructs it to:
1. Return `type: 'question'` until all required fields are collected
2. Return `type: 'workout'` once ready to generate
3. Always consider health context and flag concerns
4. Never generate a workout without all required fields

---

### 13.9 Home Screen Placement

```
┌─────────────────────────────────┐
│ Project Trace    Sunday Apr 12  │
│                          [+] 🎤 │  ← + button added next to mic
├─────────────────────────────────┤
│ ⚠️ 2 active warnings          > │
├─────────────────────────────────┤
│ TRACKER                         │
│ [HRV 42↓] [Sleep 6.2h↓]        │
│ [Steps]   [HR 61↑]              │
│ [🏃 5.4km Run · 34m · 172bpm]  │
├─────────────────────────────────┤
│ TODAY'S LOG          ← below workouts
│ ...entries...                   │
└─────────────────────────────────┘
```

The `+` button sits in the top-right header area alongside the existing "Today's Summary →" link, or as a floating button paired with the mic.

---

## 14. Future Roadmap (Post-Hackathon)

- **Photo food detection** — camera tap → Claude Vision identifies food, auto-creates journal entry
- **Multi-user auth** — Supabase Auth, each user has isolated data
- **Configurable notification time** — user sets their preferred end-of-day time
- **Trend charts** — 14-day HRV vs. sleep correlation scatter plots
- **iOS Shortcut** — one-tap Siri shortcut that opens voice log directly from lock screen
- **Lab results ingestion** — upload blood panel PDF, Claude extracts biomarkers and correlates with logs

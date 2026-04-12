# Database Schema — Project Trace (Neon Postgres)

## `journal_entries`
Stores all user-logged health events (food, supplements, workouts, mood, drinks).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| entry_type | text | NO | — | `food`, `supplement`, `workout`, `mood`, `drink` |
| description | text | NO | — | Human-readable description |
| quantity | text | YES | — | e.g. "1 bowl", "200g", "3 sets × 75 lbs" |
| logged_at | timestamptz | NO | — | When the event occurred |
| created_at | timestamptz | NO | now() | When the row was inserted |
| status | text | NO | `'confirmed'` | `confirmed` or `pending` |
| source | text | NO | — | `voice`, `photo`, `manual` |
| calories | integer | YES | — | Legacy flat column (unused for new entries) |
| protein_g | numeric | YES | — | Legacy flat column |
| carbs_g | numeric | YES | — | Legacy flat column |
| fat_g | numeric | YES | — | Legacy flat column |
| fibre_g | numeric | YES | — | Legacy flat column |
| macros | jsonb | YES | — | **Active** — `{ calories, protein_g, carbs_g, fat_g, fibre_g }` |

---

## `tracker_snapshots`
Daily Garmin health metrics, synced via `scripts/garmin_sync.py`.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| date | date | NO | — | One row per day (unique) |
| hrv_ms | double precision | YES | — | HRV in milliseconds |
| sleep_hours | double precision | YES | — | Total sleep |
| sleep_score | integer | YES | — | Garmin sleep score (0–100) |
| resting_hr | integer | YES | — | Resting heart rate (bpm) |
| steps | integer | YES | — | Daily step count |
| deep_sleep_pct | double precision | YES | — | % of total sleep in deep stage |
| deep_sleep_secs | integer | YES | — | Deep sleep in seconds |
| light_sleep_secs | integer | YES | — | Light sleep in seconds |
| rem_sleep_secs | integer | YES | — | REM sleep in seconds |
| body_battery_high | integer | YES | — | Garmin Body Battery peak |
| body_battery_low | integer | YES | — | Garmin Body Battery trough |
| avg_stress | integer | YES | — | Average stress score (0–100) |
| synced_at | timestamptz | NO | now() | When sync ran |

---

## `workouts`
Garmin-synced workout sessions.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| terra_id | text | YES | — | Legacy Terra integration ID |
| workout_type | text | NO | — | e.g. "Running", "Strength Training" |
| started_at | timestamptz | NO | — | Workout start time |
| ended_at | timestamptz | YES | — | Workout end time |
| duration_mins | integer | YES | — | Duration in minutes |
| distance_km | double precision | YES | — | Distance (running/cycling) |
| calories_active | integer | YES | — | Active calories burned |
| avg_hr | integer | YES | — | Average heart rate |
| max_hr | integer | YES | — | Max heart rate |
| source | text | NO | `'apple_health'` | Data source |
| date | date | NO | — | Workout date |
| synced_at | timestamptz | NO | now() | When sync ran |

---

## `planned_workouts`
AI-generated workout plans from WorkoutGeneratorModal.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| workout_type | text | NO | — | `strength` or `running` |
| duration_mins | integer | NO | — | Planned duration |
| muscles | text[] | YES | — | Targeted muscle groups (strength only) |
| intensity_zone | integer | YES | — | HR zone (running only) |
| equipment | text | YES | — | Available equipment |
| plan_json | jsonb | NO | — | Full structured workout plan |
| plan_text | text | NO | — | Human-readable workout plan (markdown) |
| status | text | NO | `'planned'` | `planned`, `completed`, `skipped` |
| health_context | jsonb | YES | — | Snapshot of health data used at generation time |
| generated_at | timestamptz | NO | now() | When plan was generated |
| completed_at | timestamptz | YES | — | When marked complete |
| scheduled_date | date | YES | — | Target date for the workout |

---

## `insights_cache`
Cached AI-generated health insights from `/api/analyse`.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| generated_at | timestamptz | NO | now() | When insights were generated |
| what_worked | text | YES | — | Positive summary |
| what_was_average | text | YES | — | Neutral summary |
| warnings | jsonb | NO | `'[]'` | Array of warning strings |
| key_correlations | jsonb | NO | `'[]'` | Array of pattern/correlation strings |
| raw_insights | jsonb | YES | — | Full raw Claude response |

---

## `habits`
Recurring health habits to track.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| description | text | NO | — | Habit description |
| entry_type | text | NO | — | Category (e.g. `supplement`, `workout`) |
| usual_time | time | NO | — | Typical time of day |
| created_at | timestamptz | NO | now() | When created |
| active | boolean | NO | true | Whether habit is active |

---

## `health_summaries`
Periodic AI-generated health summaries.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| period_start | date | NO | — | Summary period start |
| period_end | date | NO | — | Summary period end |
| summary_text | text | NO | — | Generated summary |
| created_at | timestamptz | NO | now() | When generated |

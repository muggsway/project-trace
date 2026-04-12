"""
garmin_sync.py
--------------
Fetches today's health data from Garmin Connect and upserts it into Neon (Postgres).

What it syncs:
  - tracker_snapshots: HRV, sleep hours, sleep score, resting HR, steps
  - workouts:          all activities from the last 14 days

Usage:
  python scripts/garmin_sync.py               # sync today
  python scripts/garmin_sync.py --days 14     # also backfill last 14 days of workouts

Dependencies:
  pip install --upgrade garminconnect curl_cffi psycopg2-binary python-dotenv

  Note: curl_cffi is a required dependency of garminconnect — must be installed alongside it.

First run: you may be prompted for your Garmin Connect MFA code.
Tokens are saved to ~/.garminconnect/garmin_tokens.json and reused automatically on subsequent runs.

Environment variables (loaded from .env.local or shell):
  GARMIN_EMAIL     — your Garmin Connect login email
  GARMIN_PASSWORD  — your Garmin Connect login password
  DATABASE_URL     — Neon connection string (same one used by the Next.js app)
"""

import os
import sys
import hashlib
import argparse
import urllib.request
import urllib.error
from datetime import date, datetime, timedelta
from dotenv import load_dotenv

# Load .env.local from the project root (one level up from scripts/)
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

try:
    from garminconnect import Garmin, GarminConnectAuthenticationError
except ImportError:
    sys.exit("Missing dependency: pip install garminconnect")

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    sys.exit("Missing dependency: pip install psycopg2-binary")


# ─────────────────────────────────────────────
# Auth
# ─────────────────────────────────────────────

TOKEN_DIR = os.path.expanduser("~/.garminconnect")
# Actual token file: ~/.garminconnect/garmin_tokens.json  (created automatically on first login)

def get_client() -> Garmin:
    email    = os.environ["GARMIN_EMAIL"]
    password = os.environ["GARMIN_PASSWORD"]

    client = Garmin(email, password)
    try:
        # Will use cached tokens if they exist; logs in fresh if not
        client.login(TOKEN_DIR)
    except GarminConnectAuthenticationError as e:
        sys.exit(f"Garmin auth failed: {e}")
    return client


# ─────────────────────────────────────────────
# DB
# ─────────────────────────────────────────────

def get_db():
    url = os.environ["DATABASE_URL"]
    return psycopg2.connect(url)


# ─────────────────────────────────────────────
# Sync helpers
# ─────────────────────────────────────────────

def sync_tracker_snapshot(conn, client: Garmin, day: str):
    """
    Fetches HRV, sleep, and daily stats for `day` (YYYY-MM-DD) and upserts
    into tracker_snapshots. Uses ON CONFLICT (date) DO UPDATE so it's safe
    to re-run.

    NOTE: field names below are based on the garminconnect library's current
    response shape. If a key is missing, the value is silently set to None
    and the DB column is left NULL rather than crashing. Verify against
    actual responses at http://localhost:8000/docs or by printing raw output.
    """

    # ── HRV ──────────────────────────────────────────────────────────────
    hrv_ms = None
    try:
        hrv_data = client.get_hrv_data(day)
        # Shape: {"hrvSummary": {"lastNight": 45, ...}, ...}
        hrv_ms = (
            hrv_data.get("hrvSummary", {}).get("lastNightAvg")
            or hrv_data.get("hrvSummary", {}).get("lastNight5MinHigh")
            or hrv_data.get("hrvSummary", {}).get("weeklyAvg")
        )
    except Exception as e:
        print(f"  [warn] HRV fetch failed for {day}: {e}")

    # ── Sleep ─────────────────────────────────────────────────────────────
    sleep_hours = None
    sleep_score = None
    deep_sleep_secs = None
    light_sleep_secs = None
    rem_sleep_secs = None
    try:
        sleep_data = client.get_sleep_data(day)
        dto = sleep_data.get("dailySleepDTO", {})
        sleep_secs = dto.get("sleepTimeSeconds")
        if sleep_secs:
            sleep_hours = round(sleep_secs / 3600, 2)
        sleep_score    = dto.get("sleepScores", {}).get("overall", {}).get("value")
        deep_sleep_secs  = dto.get("deepSleepSeconds")
        light_sleep_secs = dto.get("lightSleepSeconds")
        rem_sleep_secs   = dto.get("remSleepSeconds")
    except Exception as e:
        print(f"  [warn] Sleep fetch failed for {day}: {e}")

    # ── Daily stats (steps, resting HR, body battery, stress) ────────────
    steps = None
    resting_hr = None
    body_battery_high = None
    body_battery_low  = None
    avg_stress = None
    try:
        stats = client.get_stats(day)
        steps             = stats.get("totalSteps")
        resting_hr        = stats.get("restingHeartRate")
        body_battery_high = stats.get("bodyBatteryHighestValue")
        body_battery_low  = stats.get("bodyBatteryLowestValue")
        avg_stress        = stats.get("averageStressLevel")
    except Exception as e:
        print(f"  [warn] Daily stats fetch failed for {day}: {e}")

    # ── Upsert ────────────────────────────────────────────────────────────
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO tracker_snapshots
                (date, hrv_ms, sleep_hours, sleep_score, resting_hr, steps,
                 deep_sleep_secs, light_sleep_secs, rem_sleep_secs,
                 body_battery_high, body_battery_low, avg_stress, synced_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (date) DO UPDATE SET
                hrv_ms            = EXCLUDED.hrv_ms,
                sleep_hours       = EXCLUDED.sleep_hours,
                sleep_score       = EXCLUDED.sleep_score,
                resting_hr        = EXCLUDED.resting_hr,
                steps             = EXCLUDED.steps,
                deep_sleep_secs   = EXCLUDED.deep_sleep_secs,
                light_sleep_secs  = EXCLUDED.light_sleep_secs,
                rem_sleep_secs    = EXCLUDED.rem_sleep_secs,
                body_battery_high = EXCLUDED.body_battery_high,
                body_battery_low  = EXCLUDED.body_battery_low,
                avg_stress        = EXCLUDED.avg_stress,
                synced_at         = NOW()
        """, (day, hrv_ms, sleep_hours, sleep_score, resting_hr, steps,
              deep_sleep_secs, light_sleep_secs, rem_sleep_secs,
              body_battery_high, body_battery_low, avg_stress))

    print(f"  tracker_snapshots [{day}] hrv={hrv_ms}ms  sleep={sleep_hours}h  score={sleep_score}  hr={resting_hr}  steps={steps}  bb={body_battery_low}→{body_battery_high}  stress={avg_stress}")


def sync_workouts(conn, client: Garmin, start: str, end: str):
    """
    Fetches all activities between `start` and `end` (YYYY-MM-DD) and upserts
    into the workouts table. Uses `terra_id` (repurposed as the Garmin activity
    ID dedup key) to avoid duplicate rows on re-run.

    Activity field names may vary — verify against actual responses and adjust
    the mappings below as needed.
    """
    try:
        activities = client.get_activities_by_date(start, end)
    except Exception as e:
        print(f"  [warn] Activities fetch failed ({start}→{end}): {e}")
        return

    if not activities:
        print(f"  workouts: no activities found between {start} and {end}")
        return

    inserted = 0
    skipped  = 0

    with conn.cursor() as cur:
        for act in activities:
            # ── Field mapping ──────────────────────────────────────────────
            # Exact keys differ slightly between activity types; use .get() throughout.
            activity_id   = str(act.get("activityId", ""))
            workout_type  = (
                act.get("activityType", {}).get("typeKey", "unknown").replace("_", " ").title()
            )
            started_at    = act.get("startTimeLocal") or act.get("startTimeGMT")
            duration_secs = act.get("duration")
            duration_mins = round(duration_secs / 60) if duration_secs else None
            distance_m    = act.get("distance")
            distance_km   = round(distance_m / 1000, 2) if distance_m else None
            calories      = act.get("calories") or act.get("activeCaloiries")
            avg_hr        = act.get("averageHR")
            max_hr        = act.get("maxHR")

            if not started_at or not activity_id:
                skipped += 1
                continue

            # Derive date from started_at
            act_date = started_at[:10]  # "YYYY-MM-DD"

            # ended_at: started_at + duration
            ended_at = None
            if started_at and duration_secs:
                try:
                    start_dt = datetime.fromisoformat(started_at)
                    ended_at = (start_dt + timedelta(seconds=duration_secs)).isoformat()
                except Exception:
                    pass

            cur.execute("""
                INSERT INTO workouts
                    (terra_id, workout_type, started_at, ended_at, duration_mins,
                     distance_km, calories_active, avg_hr, max_hr, source, date, synced_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'garmin', %s, NOW())
                ON CONFLICT (terra_id) DO NOTHING
            """, (
                activity_id, workout_type, started_at, ended_at, duration_mins,
                distance_km, calories, avg_hr, max_hr, act_date
            ))

            if cur.rowcount > 0:
                inserted += 1
                print(f"  workouts [{act_date}] {workout_type}  {duration_mins}min  {distance_km}km  avg_hr={avg_hr}")
            else:
                skipped += 1

    print(f"  workouts: {inserted} inserted, {skipped} skipped (already exist)")


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync Garmin data to Neon DB")
    parser.add_argument("--days", type=int, default=14,
                        help="How many days back to sync workouts (default: 14)")
    args = parser.parse_args()

    today     = date.today().isoformat()
    past_date = (date.today() - timedelta(days=args.days)).isoformat()

    print(f"Connecting to Garmin Connect...")
    client = get_client()
    print(f"Authenticated ✓")

    print(f"\nConnecting to Neon DB...")
    conn = get_db()
    print(f"Connected ✓")

    try:
        print(f"\n── Syncing tracker snapshot for today ({today}) ──")
        sync_tracker_snapshot(conn, client, today)

        print(f"\n── Syncing workouts ({past_date} → {today}) ──")
        sync_workouts(conn, client, past_date, today)

        conn.commit()
        print(f"\nDone ✓  All data committed to DB.")

        # Regenerate insights now that data is fresh
        app_url = os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
        print(f"\n── Regenerating insights ──")
        try:
            req = urllib.request.Request(
                f"{app_url}/api/insights/generate",
                method="POST",
                headers={"Content-Type": "application/json"},
                data=b"{}"
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                print(f"  Insights generated ✓  (status {resp.status})")
        except urllib.error.URLError as e:
            print(f"  [warn] Could not reach app to regenerate insights: {e}")
            print(f"  (start the app with 'npm run dev' and re-run sync, or run scripts/refresh_insights.sh)")

    except Exception as e:
        conn.rollback()
        print(f"\nError — rolled back: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()

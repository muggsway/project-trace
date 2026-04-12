"""
ara_agent.py
------------
Ara SDK app for Project Trace.

This agent runs on Ara's platform and handles bidirectional WhatsApp communication.
It has full access to the user's health data via direct Neon DB queries, and can
log journal entries on the user's behalf.

Setup:
  1. pip install -r scripts/requirements.txt
  2. Set ARA_API_KEY in .env.local (get from app.ara.so → Settings → System → API Key)
  3. Set DATABASE_URL in .env.local (your Neon connection string)
  4. Deploy: ara deploy scripts/ara_agent.py

The agent becomes available in your Ara session on WhatsApp automatically after deploy.

Secrets:
  DATABASE_URL is declared as a Secret — it gets synced to Ara's vault on deploy.
  Set it with: ara secrets set DATABASE_URL "your-neon-connection-string"
"""

import os
import json
import uuid
from datetime import datetime, timedelta, date, timezone
from dotenv import dotenv_values
from ara_sdk import App, Secret, runtime

_env = dotenv_values(".env.local")

app = App(
    "project-trace",
    runtime_profile=runtime(
        python_packages=["psycopg2-binary"],
        secrets=[Secret.from_dict({"DATABASE_URL": _env["DATABASE_URL"]})],
    ),
)

# DATABASE_URL is synced to Ara's secrets vault on deploy.
# At runtime it's available as os.environ["DATABASE_URL"].


# ─────────────────────────────────────────────
# DB helper
# ─────────────────────────────────────────────

def _get_conn():
    import psycopg2
    return psycopg2.connect(os.environ["DATABASE_URL"])


# ─────────────────────────────────────────────
# Tools
# ─────────────────────────────────────────────

@app.tool()
def get_health_context() -> dict:
    """
    Fetch the user's health data from Project Trace.
    Returns last 14 days of tracker snapshots (HRV, sleep, steps, resting HR),
    recent workouts, today's journal entries, and the latest generated insights.
    Always call this before answering any question about the user's health, fitness, or patterns.
    """
    result = {}
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        return {"error": "DATABASE_URL not available in runtime environment"}

    try:
        conn = _get_conn()
        cur = conn.cursor()

        # Tracker snapshots — last 14 days
        cur.execute("""
            SELECT date, hrv_ms, sleep_hours, sleep_score, resting_hr, steps,
                   avg_stress, body_battery_high, body_battery_low
            FROM tracker_snapshots
            ORDER BY date DESC
            LIMIT 14
        """)
        cols = [d[0] for d in cur.description]
        snapshots = [dict(zip(cols, row)) for row in cur.fetchall()]
        result["tracker"] = [
            {
                "date": str(s["date"]),
                "hrv_ms": s["hrv_ms"],
                "sleep_hours": s["sleep_hours"],
                "sleep_score": s["sleep_score"],
                "resting_hr": s["resting_hr"],
                "steps": s["steps"],
                "avg_stress": s["avg_stress"],
                "body_battery": f"{s['body_battery_low']}→{s['body_battery_high']}"
                    if s.get("body_battery_low") is not None else None,
            }
            for s in snapshots
        ]

        # Workouts — last 14 days
        cur.execute("""
            SELECT workout_type, started_at, duration_mins, distance_km,
                   calories_active, avg_hr, max_hr, date
            FROM workouts
            ORDER BY date DESC
            LIMIT 20
        """)
        cols = [d[0] for d in cur.description]
        result["workouts"] = [dict(zip(cols, row)) for row in cur.fetchall()]
        for w in result["workouts"]:
            if w.get("started_at"):
                w["started_at"] = str(w["started_at"])
            if w.get("date"):
                w["date"] = str(w["date"])

        # Today's journal entries (last 24h)
        cur.execute("""
            SELECT entry_type, description, quantity, logged_at
            FROM journal_entries
            WHERE logged_at >= NOW() - INTERVAL '24 hours'
              AND status = 'confirmed'
            ORDER BY logged_at DESC
            LIMIT 50
        """)
        cols = [d[0] for d in cur.description]
        entries = [dict(zip(cols, row)) for row in cur.fetchall()]
        result["journal_today"] = [
            {
                "time": e["logged_at"].strftime("%H:%M") if hasattr(e["logged_at"], "strftime") else str(e["logged_at"])[:16],
                "entry_type": e["entry_type"],
                "description": e["description"],
                "quantity": e["quantity"],
            }
            for e in entries
        ]

        # Latest insights
        cur.execute("""
            SELECT what_worked, what_was_average, warnings
            FROM insights_cache
            LIMIT 1
        """)
        row = cur.fetchone()
        if row:
            result["latest_insights"] = {
                "what_worked": row[0],
                "what_was_average": row[1],
                "warnings": row[2] if row[2] else [],
            }

        cur.close()
        conn.close()

    except Exception as e:
        result["error"] = f"DB fetch failed: {str(e)}"

    return result


@app.tool()
def log_health_entry(
    entry_type: str,
    description: str,
    quantity: str = None,
    logged_at: str = None,
) -> dict:
    """
    Log a health journal entry to Project Trace.

    entry_type must be one of: food, drink, supplement, symptom, mood, energy, workout
    description: what was logged, e.g. "black coffee", "iron supplement", "mild knee pain"
    quantity: optional amount, e.g. "1 cup", "400mg", "3 sets x 10 reps"
    logged_at: ISO 8601 timestamp — defaults to now if not provided

    Returns confirmation of what was logged.
    """
    valid_types = {"food", "drink", "supplement", "symptom", "mood", "energy", "workout"}
    if entry_type not in valid_types:
        return {"ok": False, "error": f"Invalid entry_type '{entry_type}'. Must be one of: {', '.join(valid_types)}"}

    now = datetime.now(timezone.utc).isoformat()
    entry_id = str(uuid.uuid4())
    ts = logged_at or now

    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO journal_entries
                (id, entry_type, description, quantity, logged_at, created_at, status, source)
            VALUES (%s, %s, %s, %s, %s, %s, 'confirmed', 'whatsapp')
        """, (entry_id, entry_type, description, quantity, ts, now))
        conn.commit()
        cur.close()
        conn.close()

        return {
            "ok": True,
            "logged": f"{entry_type}: {description}" + (f" ({quantity})" if quantity else ""),
            "logged_at": ts,
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.tool()
def get_todays_summary() -> dict:
    """
    Generate a quick summary of today's key health metrics.
    Useful when the user asks 'how am I doing today?' or 'what's my status?'.
    Returns today's HRV, sleep, steps, and any active warnings from the insights cache.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()

        today = date.today().isoformat()

        cur.execute("""
            SELECT hrv_ms, sleep_hours, sleep_score, resting_hr, steps, avg_stress
            FROM tracker_snapshots
            WHERE date = %s
        """, (today,))
        row = cur.fetchone()
        snapshot = None
        if row:
            snapshot = {
                "date": today,
                "hrv_ms": row[0],
                "sleep_hours": row[1],
                "sleep_score": row[2],
                "resting_hr": row[3],
                "steps": row[4],
                "avg_stress": row[5],
            }

        cur.execute("""
            SELECT workout_type, duration_mins, avg_hr
            FROM workouts
            WHERE date = %s
        """, (today,))
        workouts = [
            {"type": r[0], "duration_mins": r[1], "avg_hr": r[2]}
            for r in cur.fetchall()
        ]

        cur.execute("SELECT warnings FROM insights_cache LIMIT 1")
        ins = cur.fetchone()
        warnings = ins[0] if ins and ins[0] else []

        cur.close()
        conn.close()

        return {
            "today": today,
            "snapshot": snapshot,
            "workouts_today": workouts,
            "active_warnings": warnings,
        }
    except Exception as e:
        return {"error": str(e)}


# ─────────────────────────────────────────────
# Agent
# ─────────────────────────────────────────────

@app.agent(
    entrypoint=True,
    skills=["get_health_context", "log_health_entry", "get_todays_summary"],
)
def health_agent(input: dict) -> str:
    """
    Project Trace health assistant. Answers questions about the user's health data
    and logs journal entries on their behalf via WhatsApp.
    """
    message = str(input.get("message") or "")
    today = date.today().isoformat()

    return f"""You are Trace, a personal health assistant for the user. You have access to their health tracking data from Project Trace — a fitness app that syncs Garmin watch data and tracks food, supplements, symptoms, workouts, and mood.

Today is {today}.

Your tools:
- get_health_context: fetches last 14 days of tracker data, workouts, today's journal, and latest AI insights. Call this before answering health questions.
- get_todays_summary: quick snapshot of today only. Use when the user asks how they're doing today.
- log_health_entry: logs a journal entry. Use whenever the user mentions food, drinks, supplements, symptoms, mood, energy, or workouts.

Rules:
- You're on WhatsApp — keep responses short (2-4 sentences max). Plain text only, no markdown.
- Be specific: reference actual values from their data, not generic advice.
- If the user logs something, confirm it briefly then answer any question they had.
- If you don't have enough data to answer confidently, say so and suggest they run a Garmin sync.

User message: {message}"""

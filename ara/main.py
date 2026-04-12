"""
Project Trace — Daily Summary Agent
Runs every day at 9 PM ET, generates an end-of-day health summary using Claude,
and sends it to the user via WhatsApp (Twilio).
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import urllib.request
import urllib.error
from datetime import date

import psycopg2
from dotenv import load_dotenv

from ara_sdk import App, Secret, runtime

ROOT = pathlib.Path(__file__).resolve().parent
load_dotenv(ROOT / ".env", override=False)


def _env(key: str) -> str:
    val = str(os.getenv(key) or "").strip()
    if not val:
        raise ValueError(f"Missing required env var: {key}")
    return val


app = App(
    "project-trace-daily-summary",
    runtime_profile=runtime(
        secrets=[
            Secret.from_dict({
                "ANTHROPIC_API_KEY":   _env("ANTHROPIC_API_KEY"),
                "DATABASE_URL":        _env("DATABASE_URL"),
                "TWILIO_ACCOUNT_SID":  _env("TWILIO_ACCOUNT_SID"),
                "TWILIO_AUTH_TOKEN":   _env("TWILIO_AUTH_TOKEN"),
                "TWILIO_WHATSAPP_TO":  _env("TWILIO_WHATSAPP_TO"),
            })
        ]
    ),
)


# ── Tools ─────────────────────────────────────────────────────────────────────

@app.tool()
def fetch_todays_data() -> dict:
    """Query Neon DB for today's journal entries, tracker snapshot, and workouts."""
    today = date.today().isoformat()
    conn = psycopg2.connect(_env("DATABASE_URL"))
    cur = conn.cursor()

    cur.execute(
        "SELECT category, content FROM journal_entries WHERE DATE(logged_at) = %s ORDER BY logged_at",
        (today,),
    )
    entries = [{"category": r[0], "content": r[1]} for r in cur.fetchall()]

    cur.execute(
        "SELECT hrv_ms, hrv_avg_14d, sleep_hours, sleep_avg_14d, steps, resting_hr "
        "FROM tracker_snapshots WHERE date = %s LIMIT 1",
        (today,),
    )
    row = cur.fetchone()
    snapshot = (
        {
            "hrv_ms": row[0], "hrv_avg_14d": row[1],
            "sleep_hours": row[2], "sleep_avg_14d": row[3],
            "steps": row[4], "resting_hr": row[5],
        }
        if row else None
    )

    cur.execute(
        "SELECT workout_type, duration_mins, avg_hr FROM workouts WHERE DATE(started_at) = %s",
        (today,),
    )
    workouts = [{"workout_type": r[0], "duration_mins": r[1], "avg_hr": r[2]} for r in cur.fetchall()]

    cur.close()
    conn.close()

    return {"date": today, "entries": entries, "snapshot": snapshot, "workouts": workouts}


@app.tool()
def generate_summary(data: dict) -> dict:
    """Call Claude to generate a concise end-of-day health summary."""
    payload = json.dumps({
        "model": "claude-sonnet-4-6",
        "max_tokens": 600,
        "messages": [
            {
                "role": "user",
                "content": (
                    "You are Project Trace's health insight engine.\n"
                    "Given today's health data, generate a concise end-of-day summary.\n\n"
                    f"Data:\n{json.dumps(data, indent=2)}\n\n"
                    "Return ONLY a valid JSON object with these keys:\n"
                    "  what_worked: string (1-2 sentences, positive observations)\n"
                    "  what_was_average: string (1-2 sentences, neutral observations)\n"
                    "  warnings: array of 0-2 short strings (empty array if none)\n\n"
                    "Be specific — reference actual numbers. Keep it brief, this is a WhatsApp message."
                ),
            }
        ],
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        method="POST",
        headers={
            "x-api-key": _env("ANTHROPIC_API_KEY"),
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read())

    text = body["content"][0]["text"]
    # Extract JSON even if wrapped in markdown fences
    match = re.search(r"\{.*\}", text, re.DOTALL)
    return json.loads(match.group()) if match else {"what_worked": text, "what_was_average": "", "warnings": []}


@app.tool()
def send_whatsapp(summary: dict, date_str: str) -> dict:
    """Format the summary and send it via Twilio WhatsApp."""
    import base64

    warnings_block = ""
    if summary.get("warnings"):
        bullets = "\n".join(f"• {w}" for w in summary["warnings"])
        warnings_block = f"\n\n⚠️ *Watch out*\n{bullets}"

    body = (
        f"📊 *Project Trace — {date_str}*\n\n"
        f"✅ *What worked well*\n{summary.get('what_worked', '')}\n\n"
        f"📈 *What was average*\n{summary.get('what_was_average', '')}"
        f"{warnings_block}\n\n"
        "_Powered by Project Trace_"
    )

    account_sid = _env("TWILIO_ACCOUNT_SID")
    auth_token  = _env("TWILIO_AUTH_TOKEN")
    to          = _env("TWILIO_WHATSAPP_TO")

    credentials = base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode()
    payload = json.dumps({
        "From": "whatsapp:+14155238886",
        "To":   f"whatsapp:{to}",
        "Body": body,
    }).encode()

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    req = urllib.request.Request(
        url,
        data=urllib.parse.urlencode({
            "From": "whatsapp:+14155238886",
            "To":   f"whatsapp:{to}",
            "Body": body,
        }).encode(),
        method="POST",
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())

    return {"sid": result.get("sid"), "status": result.get("status")}


# ── Scheduled agent — fires daily at 9 PM ET ──────────────────────────────────

@app.schedule(cron="0 21 * * *", timezone="America/New_York")
@app.agent(
    entrypoint=True,
    skills=["fetch_todays_data", "generate_summary", "send_whatsapp"],
)
def daily_summary_agent(input: dict) -> str:
    return (
        "Fetch today's health data from the database using fetch_todays_data. "
        "Then pass the result to generate_summary to get the summary dict and date. "
        "Then call send_whatsapp with the summary dict and the date string. "
        "Run all three tools in sequence."
    )

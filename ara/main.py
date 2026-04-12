"""
Project Trace — Daily Summary Agent
Runs every day at 9 PM ET (or every 15 min for testing).
Fetches today's health data from Neon, generates a summary via Claude,
and sends it to the user via Twilio WhatsApp.
"""

from __future__ import annotations

import os
import pathlib

from dotenv import load_dotenv
from ara_sdk import App, Secret, invoke, runtime, schedule

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
                "ANTHROPIC_API_KEY":  _env("ANTHROPIC_API_KEY"),
                "DATABASE_URL":       _env("DATABASE_URL"),
                "TWILIO_ACCOUNT_SID": _env("TWILIO_ACCOUNT_SID"),
                "TWILIO_AUTH_TOKEN":  _env("TWILIO_AUTH_TOKEN"),
                "TWILIO_WHATSAPP_TO": _env("TWILIO_WHATSAPP_TO"),
            })
        ]
    ),
)


# ── Single orchestrator tool (all imports local, no top-level deps) ────────────

@app.tool()
def run_daily_summary() -> dict:
    """
    Full pipeline: fetch today's health data → Claude summary → WhatsApp.
    All steps run in sequence. Returns ok/error dict.
    """
    import base64
    import json
    import os as _os
    import re
    import urllib.error
    import urllib.parse
    import urllib.request
    from datetime import date

    def _api_key(key: str) -> str:
        return str(_os.getenv(key) or "").strip()

    today = date.today().isoformat()

    # ── Step 1: Fetch data from Neon via psycopg2 ─────────────────────────────
    try:
        import psycopg2  # noqa: PLC0415

        conn = psycopg2.connect(_api_key("DATABASE_URL"))
        cur = conn.cursor()

        cur.execute(
            "SELECT entry_type, description, quantity FROM journal_entries WHERE DATE(logged_at) = %s ORDER BY logged_at",
            (today,),
        )
        entries = [{"type": r[0], "description": r[1], "quantity": r[2]} for r in cur.fetchall()]

        cur.execute(
            "SELECT hrv_ms, sleep_hours, sleep_score, steps, resting_hr "
            "FROM tracker_snapshots WHERE date = %s LIMIT 1",
            (today,),
        )
        row = cur.fetchone()
        snapshot = (
            {"hrv_ms": row[0], "sleep_hours": row[1], "sleep_score": row[2],
             "steps": row[3], "resting_hr": row[4]}
            if row else None
        )

        cur.execute(
            "SELECT workout_type, duration_mins, avg_hr FROM workouts WHERE DATE(started_at) = %s",
            (today,),
        )
        workouts = [{"workout_type": r[0], "duration_mins": r[1], "avg_hr": r[2]} for r in cur.fetchall()]

        cur.close()
        conn.close()

        health_data = {"date": today, "entries": entries, "snapshot": snapshot, "workouts": workouts}

    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "step": "fetch_data", "error": str(exc)}

    # ── Step 2: Generate summary via Claude ───────────────────────────────────
    try:
        payload = json.dumps({
            "model": "claude-sonnet-4-6",
            "max_tokens": 600,
            "messages": [{
                "role": "user",
                "content": (
                    "You are Project Trace's health insight engine.\n"
                    "Given today's health data, generate a concise end-of-day summary.\n\n"
                    f"Data:\n{json.dumps(health_data, indent=2)}\n\n"
                    "Return ONLY valid JSON with:\n"
                    "  what_worked: string (1-2 sentences, positives)\n"
                    "  what_was_average: string (1-2 sentences, neutral)\n"
                    "  warnings: array of 0-2 short strings (empty array if none)\n\n"
                    "Reference actual numbers. Be brief — this is a WhatsApp message."
                ),
            }],
        }).encode()

        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=payload,
            method="POST",
            headers={
                "x-api-key": _api_key("ANTHROPIC_API_KEY"),
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read())

        text = body["content"][0]["text"]
        match = re.search(r"\{.*\}", text, re.DOTALL)
        summary = json.loads(match.group()) if match else {
            "what_worked": text, "what_was_average": "", "warnings": []
        }

    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "step": "generate_summary", "error": str(exc)}

    # ── Step 3: Send via Twilio WhatsApp ──────────────────────────────────────
    try:
        warnings_block = ""
        if summary.get("warnings"):
            bullets = "\n".join(f"• {w}" for w in summary["warnings"])
            warnings_block = f"\n\n⚠️ *Watch out*\n{bullets}"

        date_label = date.today().strftime("%A, %B %-d")
        body_text = (
            f"📊 *Project Trace — {date_label}*\n\n"
            f"✅ *What worked well*\n{summary.get('what_worked', '')}\n\n"
            f"📈 *What was average*\n{summary.get('what_was_average', '')}"
            f"{warnings_block}\n\n"
            "_Powered by Project Trace_"
        )

        account_sid = _api_key("TWILIO_ACCOUNT_SID")
        auth_token  = _api_key("TWILIO_AUTH_TOKEN")
        to          = _api_key("TWILIO_WHATSAPP_TO")

        credentials = base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode()
        params = urllib.parse.urlencode({
            "From": "whatsapp:+14155238886",
            "To":   f"whatsapp:{to}",
            "Body": body_text,
        }).encode()

        req = urllib.request.Request(
            f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
            data=params,
            method="POST",
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())

        return {"ok": True, "sid": result.get("sid"), "status": result.get("status")}

    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "step": "send_whatsapp", "error": str(exc)}


# ── Schedule: directly invokes the tool (no LLM in the loop) ──────────────────

DAILY_SCHEDULE = schedule.cron(
    id="project-trace-daily-9pm-et",
    expr="*/15 * * * *",   # every 15 min for testing; change to "0 21 * * *" for 9 PM ET
    timezone="America/New_York",
    run=invoke.tool("run_daily_summary", args={}),
)


@app.agent(
    entrypoint=True,
    schedules=[DAILY_SCHEDULE],
    skills=["run_daily_summary"],
)
def summary_agent(input: dict) -> str:
    return "Call run_daily_summary to send today's Project Trace health summary via WhatsApp."

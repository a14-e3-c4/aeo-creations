"""
File-based data store for aeo.creations — users, plans, projects, usage.

Replace with Supabase/Postgres for production.
All data lives in backend/data/ as JSON files.
"""

import json
import hashlib
import secrets
import time
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# ── File helpers ──────────────────────────────────────────────────────────────

def _read(filename: str) -> dict:
    p = DATA_DIR / filename
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write(filename: str, data: dict) -> None:
    p = DATA_DIR / filename
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# ── Plans ─────────────────────────────────────────────────────────────────────

def get_plans() -> dict:
    return _read("plans.json").get("plans", {})


def get_plan(plan_id: str) -> Optional[dict]:
    return get_plans().get(plan_id)


def plan_ids() -> List[str]:
    return list(get_plans().keys())


# ── Users ─────────────────────────────────────────────────────────────────────

def _hash_password(password: str, salt: str = "") -> str:
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
    return f"{salt}:{hashed}"


def _verify_password(stored: str, password: str) -> bool:
    parts = stored.split(":")
    if len(parts) != 2:
        return False
    salt, expected_hash = parts
    test_hash = hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
    return secrets.compare_digest(test_hash, expected_hash)


def create_user(email: str, password: str, display_name: str = "") -> dict:
    users = _read("users.json")

    # Check duplicate
    for uid, user in users.items():
        if user.get("email", "").lower() == email.lower():
            raise ValueError("Email already registered")

    uid = secrets.token_hex(16)
    now = datetime.utcnow().isoformat()
    users[uid] = {
        "id": uid,
        "email": email.lower().strip(),
        "password_hash": _hash_password(password),
        "display_name": display_name or email.split("@")[0],
        "avatar_url": None,
        "plan": "free",
        "credits_remaining": get_plans().get("free", {}).get("credits_per_month", 50),
        "credits_used_this_month": 0,
        "billing_cycle_start": now,
        "created_at": now,
        "last_login": now,
        "is_admin": False,
        "is_active": True,
        "mock_checkout_completed": False,
    }
    _write("users.json", users)
    return _sanitize_user(users[uid])


def authenticate_user(email: str, password: str) -> Optional[dict]:
    users = _read("users.json")
    for uid, user in users.items():
        if user.get("email", "").lower() == email.lower():
            if _verify_password(user["password_hash"], password):
                user["last_login"] = datetime.utcnow().isoformat()
                _write("users.json", users)
                return _sanitize_user(user)
    return None


def get_user(user_id: str) -> Optional[dict]:
    users = _read("users.json")
    user = users.get(user_id)
    if user:
        _refresh_credits_if_needed(user)
        _write("users.json", users)
        return _sanitize_user(user)
    return None


def update_user(user_id: str, updates: dict) -> Optional[dict]:
    users = _read("users.json")
    if user_id not in users:
        return None
    allowed = {"display_name", "avatar_url", "plan", "is_admin", "mock_checkout_completed"}
    for key in allowed:
        if key in updates:
            users[user_id][key] = updates[key]
    _write("users.json", users)
    return _sanitize_user(users[user_id])


def set_user_plan(user_id: str, plan_id: str) -> Optional[dict]:
    """Change a user's plan and reset their credits."""
    plan = get_plan(plan_id)
    if not plan:
        return None
    users = _read("users.json")
    if user_id not in users:
        return None
    users[user_id]["plan"] = plan_id
    users[user_id]["credits_remaining"] = plan["credits_per_month"]
    users[user_id]["credits_used_this_month"] = 0
    users[user_id]["billing_cycle_start"] = datetime.utcnow().isoformat()
    _write("users.json", users)
    return _sanitize_user(users[user_id])


def _sanitize_user(user: dict) -> dict:
    """Remove sensitive fields before returning to client."""
    safe = dict(user)
    safe.pop("password_hash", None)
    return safe


def _refresh_credits_if_needed(user: dict) -> None:
    """Reset credits if billing cycle has rolled over (30 days)."""
    cycle_start = user.get("billing_cycle_start", "")
    if not cycle_start:
        return
    try:
        start = datetime.fromisoformat(cycle_start)
    except Exception:
        return
    if datetime.utcnow() - start > timedelta(days=30):
        plan = get_plan(user.get("plan", "free"))
        if plan:
            user["credits_remaining"] = plan["credits_per_month"]
            user["credits_used_this_month"] = 0
            user["billing_cycle_start"] = datetime.utcnow().isoformat()


# ── Projects ──────────────────────────────────────────────────────────────────

def create_project(owner_id: str, title: str, topic: str = "", platform: str = "",
                   metadata: dict = None) -> dict:
    projects = _read("projects.json")
    pid = secrets.token_hex(8)
    now = datetime.utcnow().isoformat()
    projects[pid] = {
        "id": pid,
        "owner_id": owner_id,
        "title": title,
        "topic": topic,
        "platform": platform,
        "status": "draft",
        "scenes": [],
        "video_url": None,
        "metadata": metadata or {},
        "created_at": now,
        "updated_at": now,
    }
    _write("projects.json", projects)
    return projects[pid]


def get_project(project_id: str) -> Optional[dict]:
    return _read("projects.json").get(project_id)


def get_user_projects(owner_id: str) -> List[dict]:
    projects = _read("projects.json")
    user_projects = [
        p for p in projects.values() if p.get("owner_id") == owner_id
    ]
    user_projects.sort(key=lambda p: p.get("created_at", ""), reverse=True)
    return user_projects


def update_project(project_id: str, updates: dict) -> Optional[dict]:
    projects = _read("projects.json")
    if project_id not in projects:
        return None
    allowed = {"title", "status", "scenes", "video_url", "metadata", "topic", "platform"}
    for key in allowed:
        if key in updates:
            projects[project_id][key] = updates[key]
    projects[project_id]["updated_at"] = datetime.utcnow().isoformat()
    _write("projects.json", projects)
    return projects[project_id]


def delete_project(project_id: str) -> bool:
    projects = _read("projects.json")
    if project_id in projects:
        del projects[project_id]
        _write("projects.json", projects)
        return True
    return False


# ── Usage tracking ────────────────────────────────────────────────────────────

def _usage_month_key() -> str:
    """Return current billing month key like '2026-09'."""
    now = datetime.utcnow()
    return f"{now.year}-{now.month:02d}"


def record_usage(user_id: str, action: str, model: str, status: str,
                 credits_cost: int = 1, metadata: dict = None) -> dict:
    """Record a single usage event for a user."""
    usage = _read("usage.json")
    month = _usage_month_key()

    if month not in usage:
        usage[month] = {}
    if user_id not in usage[month]:
        usage[month][user_id] = {"total_credits": 0, "events": []}

    event = {
        "id": secrets.token_hex(8),
        "user_id": user_id,
        "action": action,
        "model": model,
        "status": status,
        "credits_cost": credits_cost,
        "metadata": metadata or {},
        "timestamp": datetime.utcnow().isoformat(),
    }
    usage[month][user_id]["events"].append(event)
    usage[month][user_id]["total_credits"] += credits_cost
    _write("usage.json", usage)

    # Also update user's credit balance
    users = _read("users.json")
    if user_id in users:
        _refresh_credits_if_needed(users[user_id])
        if status == "ok":
            users[user_id]["credits_remaining"] = max(
                0, users[user_id].get("credits_remaining", 0) - credits_cost
            )
            users[user_id]["credits_used_this_month"] = (
                users[user_id].get("credits_used_this_month", 0) + credits_cost
            )
        _write("users.json", users)

    return event


def get_user_usage(user_id: str, months_back: int = 1) -> dict:
    """Get aggregated usage for a user over recent months."""
    usage = _read("usage.json")
    result = {"months": {}}

    for i in range(months_back):
        dt = datetime.utcnow() - timedelta(days=30 * i)
        key = f"{dt.year}-{dt.month:02d}"
        month_data = usage.get(key, {}).get(user_id, {"total_credits": 0, "events": []})

        actions = {}
        for ev in month_data.get("events", []):
            act = ev.get("action", "unknown")
            if act not in actions:
                actions[act] = {"count": 0, "credits": 0}
            actions[act]["count"] += 1
            actions[act]["credits"] += ev.get("credits_cost", 0)

        result["months"][key] = {
            "total_credits": month_data.get("total_credits", 0),
            "event_count": len(month_data.get("events", [])),
            "by_action": actions,
            "events": month_data.get("events", [])[-50:],  # last 50 events
        }

    return result


def get_user_usage_summary(user_id: str) -> dict:
    """Get a concise usage summary for dashboard display."""
    users = _read("users.json")
    user = users.get(user_id, {})
    plan = get_plan(user.get("plan", "free"))
    month = _usage_month_key()
    usage = _read("usage.json")
    month_data = usage.get(month, {}).get(user_id, {"total_credits": 0, "events": []})

    return {
        "plan": plan,
        "credits_remaining": user.get("credits_remaining", 0),
        "credits_used": user.get("credits_used_this_month", 0),
        "credits_total": plan.get("credits_per_month", 0) if plan else 0,
        "billing_cycle_start": user.get("billing_cycle_start"),
        "events_this_month": len(month_data.get("events", [])),
        "by_action": _aggregate_actions(month_data.get("events", [])),
    }


def _aggregate_actions(events: list) -> dict:
    actions = {}
    for ev in events:
        act = ev.get("action", "unknown")
        if act not in actions:
            actions[act] = 0
        actions[act] += 1
    return actions


def check_generation_limit(user_id: str, action_type: str, amount: int = 1) -> dict:
    """
    Check if a user can perform a generation action.
    Returns { allowed: bool, reason: str, remaining: int }
    """
    users = _read("users.json")
    user = users.get(user_id, {})
    if not user:
        return {"allowed": False, "reason": "User not found", "remaining": 0}

    _refresh_credits_if_needed(user)
    plan = get_plan(user.get("plan", "free"))
    if not plan:
        return {"allowed": False, "reason": "Invalid plan", "remaining": 0}

    credits = user.get("credits_remaining", 0)
    if credits < amount:
        return {
            "allowed": False,
            "reason": f"Not enough credits. You have {credits}, need {amount}. Upgrade your plan for more.",
            "remaining": credits,
        }

    # Check plan-specific limits
    month = _usage_month_key()
    usage = _read("usage.json")
    month_data = usage.get(month, {}).get(user_id, {"events": []})
    events = month_data.get("events", [])

    limits = plan.get("limits", {})

    # Check monthly event limits
    if action_type == "image":
        limit = limits.get("images_per_month", -1)
        if limit > 0:
            used = sum(1 for e in events if e.get("action") == "image" and e.get("status") == "ok")
            if used + amount > limit:
                return {"allowed": False, "reason": f"Monthly image limit reached ({limit}). Upgrade to Creator for more.", "remaining": max(0, limit - used)}

    elif action_type == "video":
        limit = limits.get("videos_per_month", -1)
        if limit > 0:
            used = sum(1 for e in events if e.get("action") in ("video", "assemble") and e.get("status") == "ok")
            if used + amount > limit:
                return {"allowed": False, "reason": f"Monthly video limit reached ({limit}). Upgrade to Creator for more.", "remaining": max(0, limit - used)}

    elif action_type == "voiceover":
        limit = limits.get("voiceover_minutes_per_month", -1)
        if limit > 0:
            used_minutes = sum(
                e.get("metadata", {}).get("duration_seconds", 0) / 60
                for e in events
                if e.get("action") == "voiceover" and e.get("status") == "ok"
            )
            if used_minutes + (amount * 0.1) > limit:  # rough estimate
                return {"allowed": False, "reason": f"Monthly voiceover limit reached ({limit}min). Upgrade for more.", "remaining": max(0, int(limit - used_minutes))}

    return {"allowed": True, "reason": "", "remaining": credits - amount}


# ── Admin ─────────────────────────────────────────────────────────────────────

def update_plan_limits(plan_id: str, updates: dict) -> Optional[dict]:
    """Admin: update limits for a plan."""
    plans = _read("plans.json")
    if plan_id not in plans.get("plans", {}):
        return None
    plans["plans"][plan_id].update(updates)
    _write("plans.json", plans)
    return plans["plans"][plan_id]


def get_all_users_summary() -> List[dict]:
    """Admin: get summary of all users."""
    users = _read("users.json")
    month = _usage_month_key()
    usage = _read("usage.json")

    summaries = []
    for uid, user in users.items():
        month_data = usage.get(month, {}).get(uid, {"total_credits": 0, "events": []})
        summaries.append({
            "id": uid,
            "email": user.get("email"),
            "display_name": user.get("display_name"),
            "plan": user.get("plan"),
            "credits_remaining": user.get("credits_remaining"),
            "credits_used_this_month": user.get("credits_used_this_month", 0),
            "events_this_month": len(month_data.get("events", [])),
            "created_at": user.get("created_at"),
            "last_login": user.get("last_login"),
            "is_active": user.get("is_active", True),
        })
    return summaries

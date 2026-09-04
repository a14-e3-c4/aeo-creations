"""
File-based data store for aeo.creations — users, plans, projects, usage.

This is suitable for local development and single-instance demos. For production,
replace it with Supabase/Postgres so concurrent requests, scaling, backups and
transactions are handled by a real database.
"""

import json
import hashlib
import secrets
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, List

DATA_DIR = Path(__file__).parent / "data"
DEFAULT_PLANS_FILE = Path(__file__).parent / "default_plans.json"
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
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(p)


# ── Plans ─────────────────────────────────────────────────────────────────────

def get_plans() -> dict:
    """Load runtime plans, falling back to version-controlled defaults."""
    runtime = _read("plans.json").get("plans")
    if runtime:
        return runtime
    try:
        defaults = json.loads(DEFAULT_PLANS_FILE.read_text(encoding="utf-8"))
        return defaults.get("plans", {})
    except Exception:
        return {}


def get_plan(plan_id: str) -> Optional[dict]:
    return get_plans().get(plan_id)


def plan_ids() -> List[str]:
    return list(get_plans().keys())


# ── Password hashing ─────────────────────────────────────────────────────────
# PBKDF2-HMAC-SHA256 is intentionally implemented with only Python stdlib so
# deployment does not need another dependency. Existing legacy SHA-256 hashes
# are still accepted once and transparently upgraded after a successful login.
PASSWORD_ITERATIONS = 310_000


def _hash_password(password: str, salt: str = "") -> str:
    salt_bytes = bytes.fromhex(salt) if salt else secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt_bytes, PASSWORD_ITERATIONS
    )
    return f"pbkdf2_sha256:{PASSWORD_ITERATIONS}:{salt_bytes.hex()}:{derived.hex()}"


def _verify_password(stored: str, password: str) -> tuple[bool, bool]:
    """Return (valid, needs_upgrade)."""
    parts = stored.split(":")
    if len(parts) == 4 and parts[0] == "pbkdf2_sha256":
        try:
            iterations = int(parts[1])
            salt = bytes.fromhex(parts[2])
            expected = bytes.fromhex(parts[3])
            actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
            return secrets.compare_digest(actual, expected), iterations != PASSWORD_ITERATIONS
        except (ValueError, TypeError):
            return False, False

    # Legacy format: salt:sha256(salt + password). Keep compatibility and
    # transparently migrate successful logins to PBKDF2.
    if len(parts) == 2:
        salt, expected_hash = parts
        test_hash = hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
        return secrets.compare_digest(test_hash, expected_hash), True

    return False, False


# ── Users ─────────────────────────────────────────────────────────────────────

def create_user(email: str, password: str, display_name: str = "") -> dict:
    users = _read("users.json")
    email = email.lower().strip()
    if not email or "@" not in email:
        raise ValueError("Please enter a valid email address")

    # Check duplicate
    for user in users.values():
        if user.get("email", "").lower() == email:
            raise ValueError("Email already registered")

    uid = secrets.token_hex(16)
    now = datetime.utcnow().isoformat()
    free_plan = get_plan("free") or {}
    users[uid] = {
        "id": uid,
        "email": email,
        "password_hash": _hash_password(password),
        "display_name": display_name.strip() or email.split("@")[0],
        "avatar_url": None,
        "plan": "free",
        "credits_remaining": free_plan.get("credits_per_month", 50),
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
    normalized = email.lower().strip()
    for uid, user in users.items():
        if user.get("email", "").lower() == normalized:
            valid, needs_upgrade = _verify_password(user.get("password_hash", ""), password)
            if valid:
                if needs_upgrade:
                    user["password_hash"] = _hash_password(password)
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
    user_projects = [p for p in projects.values() if p.get("owner_id") == owner_id]
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
    now = datetime.utcnow()
    return f"{now.year}-{now.month:02d}"


def record_usage(user_id: str, action: str, model: str, status: str,
                 credits_cost: int = 1, metadata: dict = None) -> dict:
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
    usage = _read("usage.json")
    result = {"months": {}}
    for i in range(max(1, months_back)):
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
            "events": month_data.get("events", [])[-50:],
        }
    return result


def get_user_usage_summary(user_id: str) -> dict:
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
        actions[act] = actions.get(act, 0) + 1
    return actions


def check_generation_limit(user_id: str, action_type: str, amount: int = 1) -> dict:
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

    month = _usage_month_key()
    usage = _read("usage.json")
    month_data = usage.get(month, {}).get(user_id, {"events": []})
    events = month_data.get("events", [])
    limits = plan.get("limits", {})

    if action_type == "image":
        limit = limits.get("images_per_month", -1)
        if limit > 0:
            used = sum(1 for e in events if e.get("action") == "image" and e.get("status") == "ok")
            if used + amount > limit:
                return {"allowed": False, "reason": f"Monthly image limit reached ({limit}). Upgrade your plan for more.", "remaining": max(0, limit - used)}
    elif action_type == "video":
        limit = limits.get("videos_per_month", -1)
        if limit > 0:
            used = sum(1 for e in events if e.get("action") in ("video", "assemble") and e.get("status") == "ok")
            if used + amount > limit:
                return {"allowed": False, "reason": f"Monthly video limit reached ({limit}). Upgrade your plan for more.", "remaining": max(0, limit - used)}
    elif action_type == "voiceover":
        limit = limits.get("voiceover_minutes_per_month", -1)
        if limit > 0:
            used_minutes = sum(
                e.get("metadata", {}).get("duration_seconds", 0) / 60
                for e in events
                if e.get("action") == "voiceover" and e.get("status") == "ok"
            )
            if used_minutes + (amount * 0.1) > limit:
                return {"allowed": False, "reason": f"Monthly voiceover limit reached ({limit}min). Upgrade for more.", "remaining": max(0, int(limit - used_minutes))}

    return {"allowed": True, "reason": "", "remaining": credits - amount}


# ── Admin ─────────────────────────────────────────────────────────────────────

def update_plan_limits(plan_id: str, updates: dict) -> Optional[dict]:
    plans = _read("plans.json")
    if plan_id not in plans.get("plans", {}):
        return None
    plans["plans"][plan_id].update(updates)
    _write("plans.json", plans)
    return plans["plans"][plan_id]


def get_all_users_summary() -> List[dict]:
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

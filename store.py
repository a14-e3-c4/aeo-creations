"""Production Supabase store with a safe local-development fallback.

backend.main imports `store`; this top-level module is therefore the production
adapter without requiring a rewrite of the existing generation code.
"""
from __future__ import annotations
import os, secrets
from datetime import datetime, timedelta
from typing import Optional, List
import requests
from backend import store as file_store

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)


def _headers(prefer="return=representation"):
    return {"apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}", "Content-Type": "application/json", "Prefer": prefer}


def _request(method, table, *, params=None, json_body=None, prefer="return=representation", timeout=15):
    if not USE_SUPABASE: return None
    r = requests.request(method, f"{SUPABASE_URL}/rest/v1/{table}", headers=_headers(prefer), params=params, json=json_body, timeout=timeout)
    if not r.ok: raise RuntimeError(f"Supabase {method} {table} failed: HTTP {r.status_code} {r.text[:300]}")
    return r.json() if r.content else []


def _rpc(fn, payload):
    if not USE_SUPABASE: raise RuntimeError("Supabase is not configured")
    r = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/{fn}", headers=_headers(), json=payload, timeout=15)
    if not r.ok: raise RuntimeError(f"Supabase RPC {fn} failed: HTTP {r.status_code} {r.text[:300]}")
    return r.json() if r.content else None


def get_plans() -> dict:
    if not USE_SUPABASE: return file_store.get_plans()
    rows = _request("GET", "app_plans", params={"select": "*", "order": "sort_order.asc"})
    if not rows: return file_store.get_plans()
    return {r["id"]: {k:v for k,v in r.items() if k != "sort_order"} for r in rows}


def get_plan(plan_id): return get_plans().get(plan_id)
def plan_ids(): return list(get_plans().keys())


def _sanitize(row):
    row = dict(row); row.pop("password_hash", None); row.pop("password_salt", None); return row


def _user(row):
    return {"id":row["user_id"],"email":row["email"],"password_hash":row["password_hash"],"display_name":row.get("display_name") or row["email"].split("@")[0],"avatar_url":row.get("avatar_url"),"plan":row.get("plan","free"),"credits_remaining":row.get("credits_remaining",0),"credits_used_this_month":row.get("credits_used_this_month",0),"billing_cycle_start":row.get("billing_cycle_start"),"created_at":row.get("created_at"),"last_login":row.get("last_login"),"is_admin":bool(row.get("is_admin",False)),"is_active":bool(row.get("is_active",True)),"mock_checkout_completed":bool(row.get("mock_checkout_completed",False))}


def create_user(email: str, password: str, display_name: str = ""):
    if not USE_SUPABASE: return file_store.create_user(email,password,display_name)
    email=email.lower().strip()
    if not email or "@" not in email: raise ValueError("Please enter a valid email address")
    if _request("GET","app_users",params={"email":f"eq.{email}","select":"user_id","limit":1}): raise ValueError("Email already registered")
    plan=get_plan("free") or {"credits_per_month":50}; now=datetime.utcnow().isoformat(); uid=secrets.token_hex(16)
    row={"user_id":uid,"email":email,"password_hash":file_store._hash_password(password),"display_name":display_name.strip() or email.split("@")[0],"plan":"free","credits_remaining":plan.get("credits_per_month",50),"credits_used_this_month":0,"billing_cycle_start":now,"created_at":now,"last_login":now,"is_admin":False,"is_active":True,"mock_checkout_completed":False}
    return _sanitize(_user(_request("POST","app_users",json_body=row)[0]))


def authenticate_user(email: str, password: str):
    if not USE_SUPABASE: return file_store.authenticate_user(email,password)
    rows=_request("GET","app_users",params={"email":f"eq.{email.lower().strip()}","select":"*","limit":1})
    if not rows: return None
    row=rows[0]; valid,upgrade=file_store._verify_password(row.get("password_hash",""),password)
    if not valid: return None
    updates={"last_login":datetime.utcnow().isoformat()}
    if upgrade: updates["password_hash"]=file_store._hash_password(password)
    _request("PATCH","app_users",params={"user_id":f"eq.{row['user_id']}"},json_body=updates); row.update(updates)
    return _sanitize(_user(row))


def get_user(user_id: str):
    if not USE_SUPABASE: return file_store.get_user(user_id)
    rows=_request("GET","app_users",params={"user_id":f"eq.{user_id}","select":"*","limit":1})
    if not rows: return None
    row=rows[0]
    try:
        start=datetime.fromisoformat(row.get("billing_cycle_start",""))
        if datetime.utcnow()-start>timedelta(days=30):
            plan=get_plan(row.get("plan","free"))
            if plan:
                updates={"credits_remaining":plan.get("credits_per_month",0),"credits_used_this_month":0,"billing_cycle_start":datetime.utcnow().isoformat()}
                _request("PATCH","app_users",params={"user_id":f"eq.{user_id}"},json_body=updates); row.update(updates)
    except Exception: pass
    return _sanitize(_user(row))


def update_user(user_id, updates):
    if not USE_SUPABASE: return file_store.update_user(user_id,updates)
    allowed={"display_name","avatar_url","plan","is_admin","mock_checkout_completed"}; clean={k:v for k,v in updates.items() if k in allowed}
    rows=_request("PATCH","app_users",params={"user_id":f"eq.{user_id}"},json_body=clean)
    return _sanitize(_user(rows[0])) if rows else None


def set_user_plan(user_id, plan_id):
    if not USE_SUPABASE: return file_store.set_user_plan(user_id,plan_id)
    plan=get_plan(plan_id)
    if not plan: return None
    rows=_request("PATCH","app_users",params={"user_id":f"eq.{user_id}"},json_body={"plan":plan_id,"credits_remaining":plan.get("credits_per_month",0),"credits_used_this_month":0,"billing_cycle_start":datetime.utcnow().isoformat()})
    return _sanitize(_user(rows[0])) if rows else None


def create_project(owner_id,title,topic="",platform="",metadata=None):
    if not USE_SUPABASE: return file_store.create_project(owner_id,title,topic,platform,metadata)
    now=datetime.utcnow().isoformat(); row={"id":secrets.token_hex(8),"owner_id":owner_id,"title":title,"topic":topic,"platform":platform,"status":"draft","scenes":[],"video_url":None,"metadata":metadata or {},"created_at":now,"updated_at":now}
    return _request("POST","projects",json_body=row)[0]

def get_project(project_id):
    if not USE_SUPABASE: return file_store.get_project(project_id)
    rows=_request("GET","projects",params={"id":f"eq.{project_id}","select":"*","limit":1}); return rows[0] if rows else None

def get_user_projects(owner_id):
    if not USE_SUPABASE: return file_store.get_user_projects(owner_id)
    return _request("GET","projects",params={"owner_id":f"eq.{owner_id}","select":"*","order":"created_at.desc"})

def update_project(project_id,updates):
    if not USE_SUPABASE: return file_store.update_project(project_id,updates)
    allowed={"title","status","scenes","video_url","metadata","topic","platform"}; clean={k:v for k,v in updates.items() if k in allowed}; clean["updated_at"]=datetime.utcnow().isoformat(); rows=_request("PATCH","projects",params={"id":f"eq.{project_id}"},json_body=clean); return rows[0] if rows else None

def delete_project(project_id):
    if not USE_SUPABASE: return file_store.delete_project(project_id)
    return bool(_request("DELETE","projects",params={"id":f"eq.{project_id}","select":"id"}))


def check_generation_limit(user_id,action_type,amount=1):
    if not USE_SUPABASE: return file_store.check_generation_limit(user_id,action_type,amount)
    try:
        result=_rpc("check_credit_availability",{"p_user_id":user_id,"p_action":action_type,"p_amount":amount})
        return result if isinstance(result,dict) else (result[0] if result else {"allowed":False,"reason":"Credit check failed","remaining":0})
    except Exception:
        u=get_user(user_id); rem=u.get("credits_remaining",0) if u else 0; return {"allowed":rem>=amount,"reason":"Not enough credits" if rem<amount else "","remaining":rem}


def reserve_credits(user_id,action,amount,idempotency_key):
    if not USE_SUPABASE:
        check=check_generation_limit(user_id,action,amount); return {"allowed":check.get("allowed",False),"reservation_id":None,**check}
    result=_rpc("reserve_credits",{"p_user_id":user_id,"p_action":action,"p_amount":amount,"p_idempotency_key":idempotency_key})
    return result if isinstance(result,dict) else (result[0] if result else {"allowed":False,"reason":"Credit reservation failed","remaining":0})

def finalize_reservation(reservation_id,actual_cost=None):
    if not USE_SUPABASE or not reservation_id: return {"ok":True}
    result=_rpc("finalize_credit_reservation",{"p_reservation_id":reservation_id,"p_actual_cost":actual_cost}); return result if isinstance(result,dict) else {"ok":True}

def refund_reservation(reservation_id,reason="generation_failed"):
    if not USE_SUPABASE or not reservation_id: return {"ok":True}
    result=_rpc("refund_credit_reservation",{"p_reservation_id":reservation_id,"p_reason":reason}); return result if isinstance(result,dict) else {"ok":True}

def record_usage(user_id,action,model,status,credits_cost=1,metadata=None):
    if not USE_SUPABASE: return file_store.record_usage(user_id,action,model,status,credits_cost,metadata)
    rows=_request("POST","credit_ledger",json_body={"user_id":user_id,"action":action,"model":model,"status":status,"credits_cost":credits_cost,"metadata":metadata or {},"created_at":datetime.utcnow().isoformat()}); return rows[0] if rows else {}

def get_user_usage(user_id,months_back=1):
    if not USE_SUPABASE: return file_store.get_user_usage(user_id,months_back)
    since=(datetime.utcnow()-timedelta(days=31*max(1,months_back))).isoformat(); events=_request("GET","credit_ledger",params={"user_id":f"eq.{user_id}","created_at":f"gte.{since}","select":"*","order":"created_at.desc","limit":500}); return {"months":{"current":{"total_credits":sum(e.get("credits_cost",0) for e in events),"event_count":len(events),"by_action":{},"events":events[-50:]}}}

def get_user_usage_summary(user_id):
    if not USE_SUPABASE: return file_store.get_user_usage_summary(user_id)
    u=get_user(user_id) or {}; p=get_plan(u.get("plan","free")); usage=get_user_usage(user_id,1); events=usage["months"]["current"]["events"]; by={}
    for e in events: by[e.get("action","unknown")]=by.get(e.get("action","unknown"),0)+1
    return {"plan":p,"credits_remaining":u.get("credits_remaining",0),"credits_used":u.get("credits_used_this_month",0),"credits_total":p.get("credits_per_month",0) if p else 0,"billing_cycle_start":u.get("billing_cycle_start"),"events_this_month":len(events),"by_action":by}

def get_all_users_summary():
    if not USE_SUPABASE: return file_store.get_all_users_summary()
    return _request("GET","app_users",params={"select":"user_id,email,display_name,plan,credits_remaining,credits_used_this_month,created_at,last_login,is_admin,is_active","order":"created_at.desc"})

def update_plan_limits(plan_id,updates):
    if not USE_SUPABASE: return file_store.update_plan_limits(plan_id,updates)
    allowed={"name","price_monthly","price_yearly","credits_per_month","max_scenes_per_video","max_duration_seconds","voiceover_enabled","caption_styles","export_quality","watermark","priority_queue","api_access","custom_branding","features","limits"}; clean={k:v for k,v in updates.items() if k in allowed}; rows=_request("PATCH","app_plans",params={"id":f"eq.{plan_id}"},json_body=clean); return rows[0] if rows else None

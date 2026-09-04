"""Production wrapper around the existing FastAPI app.

The existing routes are preserved. This wrapper adds production-only behavior
when Render is configured to start `backend.production:app`:
- atomic Supabase credit reservation/refund around billable generation routes
- real Paystack transaction initialization + verification + signed webhook
- server-side price/plan validation and idempotent payment fulfillment

Without production environment variables, local/demo behavior remains intact.
"""
from __future__ import annotations
import hashlib, hmac, json, os, uuid
import requests
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send, Message
from backend.main import app
import store

PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY", "").strip()
PAYSTACK_BASE_URL = "https://api.paystack.co"
PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", "").rstrip("/")
PAYSTACK_CURRENCY = os.getenv("PAYSTACK_CURRENCY", "USD").upper()

# Internal product credit costs. Provider charges never come from the browser.
BILLABLE_COSTS = {
    "/api/generate": ("video", 2),
    "/api/generate-hf-image": ("image", 1),
    "/api/modal-generate": ("image", 2),
    "/api/generate-ai-video": ("video", 10),
    "/api/generate-kling": ("video", 10),
    "/api/generate-kling-image": ("image", 2),
    "/api/generate-json2video": ("video", 8),
    "/api/generate-rewind": ("video", 10),
    "/api/generate-openrouter": ("video", 12),
    "/api/generate-pixverse": ("video", 10),
    "/api/generate-ngrok-video": ("video", 6),
    "/generate-video": ("video", 6),
    "/api/create-video/generate-hook": ("script", 1),
    "/api/create-video/generate-script": ("script", 2),
    "/api/create-video/generate-scene-image": ("image", 1),
    "/api/create-video/assemble": ("video", 4),
    "/api/generate-voiceover": ("voiceover", 2),
}


class CreditMiddleware:
    """Enforce authenticated, atomic credit reservations before generation."""
    def __init__(self, app_: ASGIApp): self.app = app_

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope.get("type") != "http" or scope.get("method") == "OPTIONS":
            await self.app(scope, receive, send); return
        pricing = BILLABLE_COSTS.get(scope.get("path", ""))
        if not pricing:
            await self.app(scope, receive, send); return

        headers = {k.decode().lower(): v.decode() for k,v in scope.get("headers", [])}
        auth = headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            await self._error(send, 401, "Authentication required"); return
        try:
            from backend.main import _verify_token
            payload = _verify_token(auth[7:])
            user = store.get_user(payload.get("user_id")) if payload else None
        except Exception:
            user = None
        if not user:
            await self._error(send, 401, "Authentication required"); return

        action, amount = pricing
        key = headers.get("idempotency-key") or uuid.uuid4().hex
        try:
            reservation = store.reserve_credits(user["id"], action, amount, key)
        except Exception:
            if store.USE_SUPABASE:
                await self._error(send, 503, "Credit service temporarily unavailable"); return
            reservation = {"allowed": True, "reservation_id": None}
        if not reservation.get("allowed"):
            await self._error(send, 402, reservation.get("reason", "Insufficient credits"), {"remaining": reservation.get("remaining", 0)}); return

        response_status = 500; response_body = bytearray()
        async def capture(message: Message):
            nonlocal response_status
            if message["type"] == "http.response.start": response_status = int(message["status"])
            elif message["type"] == "http.response.body": response_body.extend(message.get("body", b""))
            await send(message)
        try:
            await self.app(scope, receive, capture)
            failed = response_status >= 400
            if not failed and response_body:
                try:
                    body = json.loads(response_body.decode())
                    failed = bool(body.get("error")) or body.get("status") in {"failed", "error"}
                except Exception: pass
            if failed: store.refund_reservation(reservation.get("reservation_id"), f"http_{response_status}")
            else: store.finalize_reservation(reservation.get("reservation_id"), amount)
        except Exception:
            store.refund_reservation(reservation.get("reservation_id"), "unhandled_exception"); raise

    async def _error(self, send, status, detail, extra=None):
        payload={"detail":detail}; payload.update(extra or {}); data=json.dumps(payload).encode()
        await send({"type":"http.response.start","status":status,"headers":[(b"content-type",b"application/json")]})
        await send({"type":"http.response.body","body":data})


app.add_middleware(CreditMiddleware)


def _require_user(request):
    from backend.main import _require_user as require_user
    return require_user(request)


@app.post("/api/payments/paystack/initialize")
async def initialize_paystack(request: Request):
    if not PAYSTACK_SECRET_KEY: raise HTTPException(503, "Paystack is not configured on the server")
    user=_require_user(request); body=await request.json()
    plan_id=str(body.get("plan_id", "")); cycle=str(body.get("billing_cycle", "monthly"))
    if cycle not in {"monthly","yearly"}: raise HTTPException(400,"Invalid billing cycle")
    plan=store.get_plan(plan_id)
    if not plan or plan_id == "free": raise HTTPException(400,"Select a paid plan")
    price=float(plan.get("price_yearly" if cycle=="yearly" else "price_monthly",0))
    if price <= 0: raise HTTPException(400,"Plan has no payable price")
    amount_minor=int(round(price*100)); reference=f"aeo_{uuid.uuid4().hex}"
    metadata={"user_id":user["id"],"plan_id":plan_id,"billing_cycle":cycle}
    payload={"email":user["email"],"amount":str(amount_minor),"currency":PAYSTACK_CURRENCY,"reference":reference,"metadata":json.dumps(metadata)}
    if PUBLIC_APP_URL: payload["callback_url"]=f"{PUBLIC_APP_URL}/?payment=complete"
    try:
        resp=requests.post(f"{PAYSTACK_BASE_URL}/transaction/initialize",json=payload,headers={"Authorization":f"Bearer {PAYSTACK_SECRET_KEY}","Content-Type":"application/json"},timeout=20); data=resp.json()
    except Exception as exc: raise HTTPException(502,f"Payment provider unavailable: {str(exc)[:120]}")
    if resp.status_code>=400 or not data.get("status"): raise HTTPException(502,data.get("message","Unable to initialize payment"))
    if store.USE_SUPABASE:
        store._request("POST","payment_transactions",json_body={"user_id":user["id"],"reference":reference,"plan_id":plan_id,"billing_cycle":cycle,"amount_minor":amount_minor,"currency":PAYSTACK_CURRENCY,"status":"initialized","metadata":metadata})
    return {"status":"ok","authorization_url":data["data"]["authorization_url"],"access_code":data["data"].get("access_code"),"reference":reference}


@app.get("/api/payments/paystack/verify/{reference}")
async def verify_paystack(reference: str, request: Request):
    if not PAYSTACK_SECRET_KEY: raise HTTPException(503,"Paystack is not configured on the server")
    user=_require_user(request)
    if not reference or len(reference)>100: raise HTTPException(400,"Invalid reference")
    try:
        resp=requests.get(f"{PAYSTACK_BASE_URL}/transaction/verify/{reference}",headers={"Authorization":f"Bearer {PAYSTACK_SECRET_KEY}"},timeout=15); data=resp.json()
    except Exception as exc: raise HTTPException(502,f"Payment provider unavailable: {str(exc)[:120]}")
    if resp.status_code>=400 or not data.get("status"): raise HTTPException(502,data.get("message","Unable to verify payment"))
    tx=data.get("data",{})
    if tx.get("status")!="success": return {"status":"pending","reference":reference}
    if not store.USE_SUPABASE: return {"status":"success","reference":reference,"note":"Persistent payment fulfillment requires Supabase production mode"}
    rows=store._request("GET","payment_transactions",params={"reference":f"eq.{reference}","select":"*","limit":1})
    if not rows or rows[0]["user_id"]!=user["id"]: raise HTTPException(404,"Payment not found")
    if int(tx.get("amount",-1))!=int(rows[0]["amount_minor"]): raise HTTPException(400,"Payment amount mismatch")
    await _fulfill_payment(reference,tx)
    return {"status":"success","reference":reference}


async def _fulfill_payment(reference, tx):
    if not store.USE_SUPABASE: return
    rows=store._request("GET","payment_transactions",params={"reference":f"eq.{reference}","select":"*","limit":1})
    if not rows: return
    payment=rows[0]
    if payment.get("status")=="success": return
    plan=store.get_plan(payment["plan_id"])
    expected=int(round(float(plan.get("price_yearly" if payment["billing_cycle"]=="yearly" else "price_monthly",0))*100))
    if int(tx.get("amount",-1))!=expected: return
    if str(tx.get("currency",PAYSTACK_CURRENCY)).upper()!=str(payment.get("currency",PAYSTACK_CURRENCY)).upper(): return
    store._request("PATCH","payment_transactions",params={"reference":f"eq.{reference}"},json_body={"status":"success","paystack_transaction_id":tx.get("id"),"gateway_response":tx.get("gateway_response","")[:500],"paid_at":tx.get("paid_at") or None})
    store.set_user_plan(payment["user_id"],payment["plan_id"])


@app.post("/api/payments/paystack/webhook")
async def paystack_webhook(request: Request):
    if not PAYSTACK_SECRET_KEY: return JSONResponse({"status":"disabled"},status_code=503)
    raw=await request.body(); signature=request.headers.get("x-paystack-signature","")
    expected=hmac.new(PAYSTACK_SECRET_KEY.encode(),raw,hashlib.sha512).hexdigest()
    if not signature or not hmac.compare_digest(signature,expected): raise HTTPException(401,"Invalid webhook signature")
    try: event=json.loads(raw.decode())
    except Exception: raise HTTPException(400,"Invalid JSON")
    if event.get("event")=="charge.success":
        tx=event.get("data",{}); reference=tx.get("reference")
        if reference: await _fulfill_payment(reference,tx)
    return {"status":"ok"}

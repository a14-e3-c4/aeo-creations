# Production setup

This branch keeps the existing UI and AI provider integrations while adding a production path for persistent data, server-side credit enforcement, and real Paystack checkout.

## 1. Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/001_production.sql` in the Supabase SQL editor.
3. Run `supabase/migrations/002_security.sql`.
4. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the backend only.
5. Never expose the service-role key as `VITE_*` and never commit it.

The production store automatically uses Supabase when those two variables are present. Local development falls back to the existing JSON store when they are absent.

## 2. Paystack

1. Start with Paystack Test Mode.
2. Set `PAYSTACK_SECRET_KEY` on the backend only.
3. Set `PAYSTACK_CURRENCY` to the currency configured for the Paystack integration.
4. Set `PUBLIC_APP_URL` to the public frontend URL.
5. Configure this webhook URL in Paystack:
   `https://YOUR_PUBLIC_APP_URL/api/payments/paystack/webhook`
6. Test successful, failed, abandoned and repeated webhook deliveries before switching to live mode.

The backend calculates the payable amount from the server-side plan table. The browser cannot choose its own price. Successful payments are verified against the stored amount/currency and fulfilled idempotently.

## 3. Render

The production start command is:

`uvicorn backend.production:app --host 0.0.0.0 --port $PORT`

Keep all existing AI provider keys in Render's secret environment variables. Do not paste them into source files.

## 4. Credit protection

Production generation endpoints reserve credits atomically before expensive work. Successful requests finalize the reservation; HTTP/provider failures refund it. An `Idempotency-Key` can be supplied by the client to prevent duplicate reservations on retries.

Credit prices are centralized in `backend/production.py` and can be changed without modifying the AI provider implementations.

## 5. Important launch note

The existing provider integrations and their polling implementations are deliberately preserved. The `generation_jobs` table is included as the persistence foundation for the next queue-worker migration; the current provider-specific polling code is still request/poll based. Do not advertise guaranteed background job durability until a queue worker is deployed.

For payments, use test mode first and only switch to live mode after the full checkout/webhook/fulfillment flow has been tested. Paystack's documentation recommends server-side initialization, server-side verification, amount verification, and signed webhook validation.

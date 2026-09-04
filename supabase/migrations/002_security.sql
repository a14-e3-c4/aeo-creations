-- Lock production tables down. The backend uses the Supabase service-role key,
-- which bypasses RLS. The browser never receives that key.

alter table public.app_plans enable row level security;
alter table public.app_users enable row level security;
alter table public.projects enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.generation_jobs enable row level security;

revoke all on public.app_plans from anon, authenticated;
revoke all on public.app_users from anon, authenticated;
revoke all on public.projects from anon, authenticated;
revoke all on public.credit_reservations from anon, authenticated;
revoke all on public.credit_ledger from anon, authenticated;
revoke all on public.payment_transactions from anon, authenticated;
revoke all on public.generation_jobs from anon, authenticated;

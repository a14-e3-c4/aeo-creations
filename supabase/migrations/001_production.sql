-- aeo.creations production schema. Run in Supabase SQL Editor before enabling production mode.
create extension if not exists pgcrypto;

create table if not exists public.app_plans (
 id text primary key, name text not null, price_monthly numeric(12,2) not null default 0, price_yearly numeric(12,2) not null default 0,
 credits_per_month integer not null default 0, max_scenes_per_video integer not null default 5, max_duration_seconds integer not null default 30,
 voiceover_enabled boolean not null default true, caption_styles jsonb not null default '[]', export_quality text not null default '720p',
 watermark boolean not null default true, priority_queue boolean not null default false, api_access boolean not null default false, custom_branding boolean not null default false,
 features jsonb not null default '[]', limits jsonb not null default '{}', sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

insert into public.app_plans(id,name,price_monthly,price_yearly,credits_per_month,max_scenes_per_video,max_duration_seconds,voiceover_enabled,caption_styles,export_quality,watermark,priority_queue,api_access,custom_branding,features,limits,sort_order)
values
('free','Free',0,0,50,5,30,true,'["clean","minimal"]','720p',true,false,false,false,'["50 credits per month","AI scripts and hooks","AI images","Ken Burns video creation","Basic voiceover and captions","720p exports with watermark"]','{"images_per_month":40,"videos_per_month":10,"voiceover_minutes_per_month":10,"storage_mb":500,"projects":3}',0),
('creator','Creator',9,90,500,12,120,true,'["clean","bold","highlight","minimal"]','1080p',false,true,false,true,'["500 credits per month","1080p exports","No watermark","All caption styles","Priority generation","Custom branding","Longer videos and more scenes"]','{"images_per_month":400,"videos_per_month":100,"voiceover_minutes_per_month":120,"storage_mb":5000,"projects":25}',1),
('pro','Pro',24,240,2000,30,600,true,'["clean","bold","highlight","minimal"]','4K',false,true,true,true,'["2,000 credits per month","4K exports","No watermark","All caption styles","Highest priority generation","Custom branding","API access","Up to 10-minute videos"]','{"images_per_month":2000,"videos_per_month":500,"voiceover_minutes_per_month":600,"storage_mb":25000,"projects":100}',2)
on conflict (id) do update set name=excluded.name,price_monthly=excluded.price_monthly,price_yearly=excluded.price_yearly,credits_per_month=excluded.credits_per_month,max_scenes_per_video=excluded.max_scenes_per_video,max_duration_seconds=excluded.max_duration_seconds,voiceover_enabled=excluded.voiceover_enabled,caption_styles=excluded.caption_styles,export_quality=excluded.export_quality,watermark=excluded.watermark,priority_queue=excluded.priority_queue,api_access=excluded.api_access,custom_branding=excluded.custom_branding,features=excluded.features,limits=excluded.limits,sort_order=excluded.sort_order,updated_at=now();

create table if not exists public.app_users (
 user_id text primary key, email text unique not null, password_hash text not null, display_name text not null default '', avatar_url text,
 plan text not null default 'free' references public.app_plans(id), credits_remaining integer not null default 0, credits_used_this_month integer not null default 0,
 billing_cycle_start timestamptz not null default now(), created_at timestamptz not null default now(), last_login timestamptz not null default now(),
 is_admin boolean not null default false, is_active boolean not null default true, mock_checkout_completed boolean not null default false
);

create table if not exists public.projects (
 id text primary key, owner_id text not null references public.app_users(user_id) on delete cascade, title text not null, topic text not null default '', platform text not null default '',
 status text not null default 'draft', scenes jsonb not null default '[]', video_url text, metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.credit_reservations (
 id uuid primary key default gen_random_uuid(), user_id text not null references public.app_users(user_id) on delete cascade, action text not null,
 amount integer not null check (amount>0), idempotency_key text unique not null, status text not null default 'reserved' check(status in('reserved','finalized','refunded')),
 created_at timestamptz not null default now(), finalized_at timestamptz, refund_reason text
);
create table if not exists public.credit_ledger (
 id uuid primary key default gen_random_uuid(), user_id text not null references public.app_users(user_id) on delete cascade, action text not null, model text not null default '',
 status text not null, credits_cost integer not null default 0, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table if not exists public.payment_transactions (
 id uuid primary key default gen_random_uuid(), user_id text not null references public.app_users(user_id) on delete cascade, reference text unique not null,
 plan_id text not null references public.app_plans(id), billing_cycle text not null check(billing_cycle in('monthly','yearly')), amount_minor integer not null check(amount_minor>=0),
 currency text not null default 'USD', status text not null default 'initialized' check(status in('initialized','success','failed','reversed')), paystack_transaction_id bigint,
 gateway_response text, metadata jsonb not null default '{}', created_at timestamptz not null default now(), paid_at timestamptz
);
create table if not exists public.generation_jobs (
 id uuid primary key default gen_random_uuid(), user_id text not null references public.app_users(user_id) on delete cascade, project_id text references public.projects(id) on delete set null,
 provider_job_id text, job_type text not null, status text not null default 'queued' check(status in('queued','processing','completed','failed','cancelled')),
 reservation_id uuid references public.credit_reservations(id) on delete set null, request jsonb not null default '{}', result jsonb not null default '{}', error text,
 created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz
);
create index if not exists projects_owner_idx on public.projects(owner_id,created_at desc);
create index if not exists ledger_user_idx on public.credit_ledger(user_id,created_at desc);
create index if not exists jobs_user_idx on public.generation_jobs(user_id,created_at desc);
create index if not exists payments_user_idx on public.payment_transactions(user_id,created_at desc);

create or replace function public.check_credit_availability(p_user_id text,p_action text,p_amount integer) returns jsonb language plpgsql security definer set search_path=public as $$
declare u public.app_users%rowtype;
begin
 select * into u from public.app_users where user_id=p_user_id for update;
 if not found then return jsonb_build_object('allowed',false,'reason','User not found','remaining',0); end if;
 if u.billing_cycle_start+interval '30 days'<=now() then update public.app_users set credits_remaining=(select credits_per_month from public.app_plans where id=u.plan),credits_used_this_month=0,billing_cycle_start=now() where user_id=p_user_id returning * into u; end if;
 if p_amount<=0 or u.credits_remaining<p_amount then return jsonb_build_object('allowed',false,'reason',format('Not enough credits. You have %s, need %s.',u.credits_remaining,p_amount),'remaining',u.credits_remaining); end if;
 return jsonb_build_object('allowed',true,'reason','','remaining',u.credits_remaining);
end; $$;

create or replace function public.reserve_credits(p_user_id text,p_action text,p_amount integer,p_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public as $$
declare u public.app_users%rowtype; r public.credit_reservations%rowtype;
begin
 select * into r from public.credit_reservations where idempotency_key=p_idempotency_key limit 1;
 if found then return jsonb_build_object('allowed',true,'reservation_id',r.id,'remaining',(select credits_remaining from public.app_users where user_id=p_user_id),'reused',true); end if;
 select * into u from public.app_users where user_id=p_user_id for update;
 if not found then return jsonb_build_object('allowed',false,'reason','User not found','remaining',0); end if;
 if u.billing_cycle_start+interval '30 days'<=now() then update public.app_users set credits_remaining=(select credits_per_month from public.app_plans where id=u.plan),credits_used_this_month=0,billing_cycle_start=now() where user_id=p_user_id returning * into u; end if;
 if p_amount<=0 or u.credits_remaining<p_amount then return jsonb_build_object('allowed',false,'reason','Insufficient credits','remaining',u.credits_remaining); end if;
 update public.app_users set credits_remaining=credits_remaining-p_amount,credits_used_this_month=credits_used_this_month+p_amount where user_id=p_user_id returning * into u;
 insert into public.credit_reservations(user_id,action,amount,idempotency_key) values(p_user_id,p_action,p_amount,p_idempotency_key) returning * into r;
 return jsonb_build_object('allowed',true,'reservation_id',r.id,'remaining',u.credits_remaining,'reused',false);
end; $$;

create or replace function public.finalize_credit_reservation(p_reservation_id uuid,p_actual_cost integer default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.credit_reservations%rowtype; extra integer:=0;
begin
 select * into r from public.credit_reservations where id=p_reservation_id for update;
 if not found then return jsonb_build_object('ok',false,'reason','Reservation not found'); end if;
 if r.status<>'reserved' then return jsonb_build_object('ok',true,'status',r.status); end if;
 if p_actual_cost is not null and p_actual_cost>r.amount then extra:=p_actual_cost-r.amount; update public.app_users set credits_remaining=greatest(0,credits_remaining-extra),credits_used_this_month=credits_used_this_month+extra where user_id=r.user_id; end if;
 update public.credit_reservations cr set status='finalized',finalized_at=now() where cr.id=p_reservation_id;
 return jsonb_build_object('ok',true,'status','finalized','extra_charged',extra);
end; $$;

create or replace function public.refund_credit_reservation(p_reservation_id uuid,p_reason text default 'generation_failed') returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.credit_reservations%rowtype;
begin
 select * into r from public.credit_reservations where id=p_reservation_id for update;
 if not found then return jsonb_build_object('ok',false,'reason','Reservation not found'); end if;
 if r.status<>'reserved' then return jsonb_build_object('ok',true,'status',r.status); end if;
 update public.app_users set credits_remaining=credits_remaining+r.amount,credits_used_this_month=greatest(0,credits_used_this_month-r.amount) where user_id=r.user_id;
 update public.credit_reservations cr set status='refunded',finalized_at=now(),refund_reason=p_reason where cr.id=p_reservation_id;
 return jsonb_build_object('ok',true,'status','refunded','amount',r.amount);
end; $$;

revoke all on function public.check_credit_availability(text,text,integer) from public,anon,authenticated;
revoke all on function public.reserve_credits(text,text,integer,text) from public,anon,authenticated;
revoke all on function public.finalize_credit_reservation(uuid,integer) from public,anon,authenticated;
revoke all on function public.refund_credit_reservation(uuid,text) from public,anon,authenticated;

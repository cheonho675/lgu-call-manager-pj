create extension if not exists pgcrypto;

create table if not exists public.call_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  caller_number text,
  receiver_number text,
  inner_number text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null,
  caller_number text,
  receiver_number text,
  inner_number text,
  status text not null default 'ringing',
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  handled boolean not null default false,
  memo text not null default '',
  source text not null default 'lgu',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists calls_dedupe_key_unique
on public.calls (dedupe_key);

create index if not exists calls_status_created_at_idx
on public.calls (status, created_at desc);

create index if not exists calls_handled_created_at_idx
on public.calls (handled, created_at desc);

create index if not exists call_events_created_at_idx
on public.call_events (created_at desc);

alter table public.call_events enable row level security;
alter table public.calls enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.call_events to service_role;
grant select, insert, update, delete on public.calls to service_role;

-- Keep writes server-side through SUPABASE_SERVICE_ROLE_KEY for now.
-- When you add Supabase Auth for the admin site, create read/update policies for authenticated users.

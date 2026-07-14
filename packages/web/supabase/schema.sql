-- MERIDIAN web dashboard storage (run in Supabase SQL Editor)

create table if not exists public.users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  name text,
  created_at timestamptz not null default now()
);

create table if not exists public.api_keys (
  id text primary key,
  user_id text not null references public.users (id) on delete cascade,
  name text not null,
  prefix text not null,
  hash text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists api_keys_user_id_idx on public.api_keys (user_id);

create table if not exists public.waitlist (
  email text primary key,
  joined_at timestamptz not null default now()
);

-- Serverless API uses SUPABASE_SERVICE_ROLE_KEY; RLS optional for direct client access.
alter table public.users enable row level security;
alter table public.api_keys enable row level security;
alter table public.waitlist enable row level security;

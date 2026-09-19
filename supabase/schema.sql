-- Daniel OS schema.
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- Every table carries user_id and has Row Level Security ON. RLS is the reason
-- a leaked anon key is not a data breach: the key only ever lets you read rows
-- that belong to the logged-in user. Ricky may ask about this on Day 1.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- tasks
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  status      text not null default 'open'
              check (status in ('open','doing','done')),
  priority    int  not null default 3 check (priority between 1 and 5),
  project_id  uuid,
  due_on      date,
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);

-- ------------------------------------------------------------- projects
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  status     text not null default 'active'
             check (status in ('active','paused','done')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------- blockers
create table if not exists public.blockers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  description text not null,
  owner       text,
  needed_by   date,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------- metrics
create table if not exists public.metrics (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  label      text not null,
  value      numeric not null,
  unit       text,
  as_of      date not null default current_date,
  created_at timestamptz not null default now()
);

-- ------------------------------------------- events (usage + activity analytics)
-- Day 1 requires "usage and activity analytics capturing page views and actions".
-- Page views and actions both land here, separated by kind.
create table if not exists public.events (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete set null,
  kind       text not null check (kind in ('page_view','action')),
  name       text not null,
  path       text,
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_user_time_idx on public.events (user_id, created_at desc);

-- ------------------------------------------------- integration_tokens + logs
-- Google returns a short-lived access token at sign-in. It is stored per user,
-- server-side only, and is never sent to the browser.
create table if not exists public.integration_tokens (
  user_id       uuid not null references auth.users(id) on delete cascade,
  provider      text not null,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (user_id, provider)
);

-- Day 1 "definition of shipped": logs exist and show the last failure honestly.
create table if not exists public.integration_log (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete set null,
  provider   text not null,
  ok         boolean not null,
  status     int,
  message    text,
  created_at timestamptz not null default now()
);
create index if not exists integration_log_recent_idx
  on public.integration_log (user_id, provider, created_at desc);

-- ------------------------------------------------------------------- RLS
alter table public.tasks              enable row level security;
alter table public.projects           enable row level security;
alter table public.blockers           enable row level security;
alter table public.metrics            enable row level security;
alter table public.events             enable row level security;
alter table public.integration_tokens enable row level security;
alter table public.integration_log    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tasks','projects','blockers','metrics','events',
                           'integration_tokens','integration_log']
  loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- Seed a couple of real rows so the dashboard is never empty on first login.
-- Runs for whoever is signed in when you execute it in the SQL editor.

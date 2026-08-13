create extension if not exists pgcrypto;

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists admin_sessions_expires_at_idx
  on public.admin_sessions (expires_at);

alter table public.admin_sessions enable row level security;
alter table public.admin_sessions force row level security;

revoke all on table public.admin_sessions from anon, authenticated;
grant all on table public.admin_sessions to service_role;

comment on table public.admin_sessions is
  'Server-managed administrator sessions. token_hash is SHA-256; raw tokens are never stored.';

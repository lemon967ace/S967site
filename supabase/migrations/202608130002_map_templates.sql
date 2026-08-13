create extension if not exists pgcrypto;

create table if not exists public.map_templates (
  id uuid primary key default gen_random_uuid(),
  name_ko text not null check (char_length(btrim(name_ko)) between 1 and 100 and name_ko !~ '[[:cntrl:]]'),
  name_en text not null check (char_length(btrim(name_en)) between 1 and 100 and name_en !~ '[[:cntrl:]]'),
  name_ja text not null check (char_length(btrim(name_ja)) between 1 and 100 and name_ja !~ '[[:cntrl:]]'),
  name_ru text not null check (char_length(btrim(name_ru)) between 1 and 100 and name_ru !~ '[[:cntrl:]]'),
  template_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists map_templates_created_at_id_idx
  on public.map_templates (created_at, id);

alter table public.map_templates enable row level security;
alter table public.map_templates force row level security;

revoke all on table public.map_templates from anon, authenticated;
grant all on table public.map_templates to service_role;

comment on table public.map_templates is
  'Canonical fixed-map templates. Browser clients must use the dedicated Edge Functions.';

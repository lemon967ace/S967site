alter table public.map_templates
  add column if not exists is_default boolean not null default false;

create unique index if not exists map_templates_single_default_idx
  on public.map_templates ((is_default))
  where is_default = true;

create or replace function public.set_map_template_default(p_template_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  lock table public.map_templates in share row exclusive mode;

  if p_template_id is not null and not exists (
    select 1 from public.map_templates where id = p_template_id
  ) then
    return false;
  end if;

  update public.map_templates
  set is_default = false
  where is_default = true
    and (p_template_id is null or id <> p_template_id);

  if p_template_id is not null then
    update public.map_templates
    set is_default = true
    where id = p_template_id
      and is_default = false;
  end if;

  return true;
end;
$$;

revoke all on function public.set_map_template_default(uuid) from public, anon, authenticated;
grant execute on function public.set_map_template_default(uuid) to service_role;

comment on function public.set_map_template_default(uuid) is
  'Atomically selects one default map template, or clears the default when passed NULL.';

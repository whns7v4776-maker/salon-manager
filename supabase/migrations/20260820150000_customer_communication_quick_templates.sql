create table if not exists public.customer_communication_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  body text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_communication_templates_title_length
    check (char_length(trim(title)) between 2 and 80),
  constraint customer_communication_templates_body_length
    check (char_length(trim(body)) between 2 and 500)
);

create unique index if not exists customer_communication_templates_workspace_title_idx
  on public.customer_communication_templates (workspace_id, lower(trim(title)));

create index if not exists customer_communication_templates_workspace_updated_idx
  on public.customer_communication_templates (workspace_id, updated_at desc);

drop trigger if exists set_updated_at_customer_communication_templates
  on public.customer_communication_templates;
create trigger set_updated_at_customer_communication_templates
before update on public.customer_communication_templates
for each row execute function public.set_updated_at();

alter table public.customer_communication_templates enable row level security;

drop policy if exists customer_communication_templates_owner_select
  on public.customer_communication_templates;
create policy customer_communication_templates_owner_select
on public.customer_communication_templates
for select
using (workspace_id = public.current_workspace_id());

drop policy if exists customer_communication_templates_owner_mutate
  on public.customer_communication_templates;
create policy customer_communication_templates_owner_mutate
on public.customer_communication_templates
for all
using (
  workspace_id = public.current_workspace_id()
  and public.workspace_access_allowed()
)
with check (
  workspace_id = public.current_workspace_id()
  and public.workspace_access_allowed()
);

create or replace function public.list_owner_customer_communication_templates()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_not_allowed';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', template.id,
          'title', template.title,
          'body', template.body,
          'createdAt', template.created_at,
          'updatedAt', template.updated_at
        )
        order by template.updated_at desc, template.created_at desc
      )
      from public.customer_communication_templates as template
      where template.workspace_id = v_workspace_id
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.save_owner_customer_communication_template(
  p_title text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_template public.customer_communication_templates%rowtype;
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_not_allowed';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 0));

  if char_length(v_title) < 2 or char_length(v_title) > 80 then
    raise exception 'invalid_communication_template_title';
  end if;

  if char_length(v_body) < 2 or char_length(v_body) > 500 then
    raise exception 'invalid_communication_template_body';
  end if;

  select template.*
  into v_template
  from public.customer_communication_templates as template
  where template.workspace_id = v_workspace_id
    and lower(trim(template.title)) = lower(v_title)
  limit 1;

  if v_template.id is null then
    if (
      select count(*)
      from public.customer_communication_templates as template
      where template.workspace_id = v_workspace_id
    ) >= 20 then
      raise exception 'communication_template_limit_reached';
    end if;

    insert into public.customer_communication_templates (
      workspace_id,
      title,
      body,
      created_by
    )
    values (
      v_workspace_id,
      v_title,
      v_body,
      auth.uid()
    )
    returning * into v_template;
  else
    update public.customer_communication_templates
    set title = v_title,
        body = v_body,
        created_by = auth.uid()
    where id = v_template.id
      and workspace_id = v_workspace_id
    returning * into v_template;
  end if;

  return jsonb_build_object(
    'id', v_template.id,
    'title', v_template.title,
    'body', v_template.body,
    'createdAt', v_template.created_at,
    'updatedAt', v_template.updated_at
  );
end;
$$;

revoke all on function public.list_owner_customer_communication_templates()
  from public;
revoke all on function public.save_owner_customer_communication_template(text, text)
  from public;

grant execute on function public.list_owner_customer_communication_templates()
  to authenticated;
grant execute on function public.save_owner_customer_communication_template(text, text)
  to authenticated;

alter table public.customer_communication_templates
  add column if not exists icon text not null default 'bookmark';

alter table public.customer_communication_templates
  drop constraint if exists customer_communication_templates_icon_allowed;
alter table public.customer_communication_templates
  add constraint customer_communication_templates_icon_allowed
  check (
    icon in (
      'bookmark',
      'megaphone',
      'pricetag',
      'gift',
      'calendar',
      'umbrella',
      'storefront',
      'heart',
      'sparkles',
      'notifications'
    )
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
          'icon', template.icon,
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
  p_body text,
  p_icon text,
  p_template_id uuid
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
  v_icon text := lower(trim(coalesce(p_icon, '')));
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

  if v_icon not in (
    'bookmark',
    'megaphone',
    'pricetag',
    'gift',
    'calendar',
    'umbrella',
    'storefront',
    'heart',
    'sparkles',
    'notifications'
  ) then
    raise exception 'invalid_communication_template_icon';
  end if;

  if p_template_id is not null then
    select template.*
    into v_template
    from public.customer_communication_templates as template
    where template.id = p_template_id
      and template.workspace_id = v_workspace_id
    limit 1;

    if v_template.id is null then
      raise exception 'communication_template_not_found';
    end if;
  else
    select template.*
    into v_template
    from public.customer_communication_templates as template
    where template.workspace_id = v_workspace_id
      and lower(trim(template.title)) = lower(v_title)
    limit 1;
  end if;

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
      icon,
      created_by
    )
    values (
      v_workspace_id,
      v_title,
      v_body,
      v_icon,
      auth.uid()
    )
    returning * into v_template;
  else
    update public.customer_communication_templates
    set title = v_title,
        body = v_body,
        icon = v_icon,
        created_by = auth.uid()
    where id = v_template.id
      and workspace_id = v_workspace_id
    returning * into v_template;
  end if;

  return jsonb_build_object(
    'id', v_template.id,
    'title', v_template.title,
    'body', v_template.body,
    'icon', v_template.icon,
    'createdAt', v_template.created_at,
    'updatedAt', v_template.updated_at
  );
end;
$$;

create or replace function public.delete_owner_customer_communication_template(
  p_template_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_deleted_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_not_allowed';
  end if;

  delete from public.customer_communication_templates
  where id = p_template_id
    and workspace_id = v_workspace_id;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count = 1;
end;
$$;

revoke all on function public.delete_owner_customer_communication_template(uuid)
  from public;
grant execute on function public.delete_owner_customer_communication_template(uuid)
  to authenticated;
revoke all on function public.save_owner_customer_communication_template(text, text, text, uuid)
  from public;
grant execute on function public.save_owner_customer_communication_template(text, text, text, uuid)
  to authenticated;

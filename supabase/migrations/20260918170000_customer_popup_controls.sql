-- Popup delivery is independent from push delivery. No push queue is touched.
alter table public.customer_communications
  add column if not exists reminder_all_customers boolean not null default false,
  add column if not exists reminder_cancelled_at timestamptz;
create table public.customer_communication_reminder_dismissals (
  communication_id uuid not null references public.customer_communications(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (communication_id, customer_id)
);
alter table public.customer_communication_reminder_dismissals enable row level security;
revoke all on public.customer_communication_reminder_dismissals from public, anon, authenticated;

create function public.save_owner_customer_popup_v1(
  p_title text, p_body text, p_targets jsonb, p_all_customers boolean,
  p_request_key text, p_starts_local timestamp, p_ends_local timestamp
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  w uuid := public.current_workspace_id();
  c uuid;
  n integer;
begin
  if auth.uid() is null or w is null or not public.workspace_access_allowed() then raise exception 'workspace_not_allowed'; end if;
  if p_request_key is null or length(p_request_key) not between 8 and 128 then raise exception 'invalid_send_request_key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(w::text || ':' || p_request_key,0));
  select id into c from public.customer_communications where workspace_id=w and send_request_key=p_request_key;
  if c is not null then return jsonb_build_object('communicationId',c); end if;
  if p_title is null or p_body is null or length(trim(p_title)) not between 2 and 80 or length(trim(p_body)) not between 2 and 500 then raise exception 'invalid_communication_text'; end if;
  if p_starts_local is null or p_ends_local is null or p_ends_local <= p_starts_local or (p_ends_local at time zone 'Europe/Rome') <= now() then raise exception 'invalid_reminder_period'; end if;
  if p_targets is null or jsonb_typeof(p_targets)<>'array' or jsonb_array_length(p_targets)>500 then raise exception 'invalid_targets'; end if;
  insert into public.customer_communications(workspace_id,kind,title,body,created_by,send_request_key,reminder_starts_at,reminder_ends_at,reminder_all_customers)
  values(w,'custom',trim(p_title),trim(p_body),auth.uid(),p_request_key,p_starts_local at time zone 'Europe/Rome',p_ends_local at time zone 'Europe/Rome',coalesce(p_all_customers,false)) returning id into c;
  insert into public.customer_communication_recipients(communication_id,customer_id,delivery_status)
  select c,u.id,'unavailable' from public.customers u where u.workspace_id=w and
    (coalesce(p_all_customers,false) or exists(select 1 from jsonb_array_elements(p_targets) t where
      t->>'id'=u.id::text or
      (nullif(trim(t->>'email'),'') is not null and lower(trim(t->>'email'))=lower(trim(u.email::text))) or
      (length(regexp_replace(coalesce(t->>'phone',''),'\D','','g'))>=9 and right(regexp_replace(t->>'phone','\D','','g'),10)=right(regexp_replace(coalesce(u.phone,''),'\D','','g'),10))))
  on conflict do nothing;
  get diagnostics n = row_count;
  if n=0 and not coalesce(p_all_customers,false) then raise exception 'no_recipients'; end if;
  update public.customer_communications set requested_count=n,matched_count=n where id=c;
  return jsonb_build_object('communicationId',c,'matchedCount',n,'queuedCount',0);
end $$;
revoke all on function public.save_owner_customer_popup_v1(text,text,jsonb,boolean,text,timestamp,timestamp) from public;
grant execute on function public.save_owner_customer_popup_v1(text,text,jsonb,boolean,text,timestamp,timestamp) to authenticated;

create function public.cancel_owner_customer_popup_v1(p_communication_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.workspace_access_allowed() then raise exception 'workspace_not_allowed'; end if;
  update public.customer_communications set reminder_cancelled_at=coalesce(reminder_cancelled_at,now())
    where id=p_communication_id and workspace_id=public.current_workspace_id() and reminder_starts_at is not null;
  if not found then raise exception 'popup_not_found'; end if;
end $$;
revoke all on function public.cancel_owner_customer_popup_v1(uuid) from public;
grant execute on function public.cancel_owner_customer_popup_v1(uuid) to authenticated;

create function public.dismiss_public_customer_popup_v1(p_communication_id uuid,p_salon_code text,p_customer_email citext default null,p_customer_phone text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare
  w uuid;
  e text := nullif(lower(trim(p_customer_email::text)),'');
  p text := nullif(right(regexp_replace(coalesce(p_customer_phone,''),'\D','','g'),10),'');
  n integer;
begin
  if e is null and p is null then return false; end if;
  select id into w from public.workspaces where slug=lower(trim(p_salon_code));
  insert into public.customer_communication_reminder_dismissals(communication_id,customer_id)
  select c.id,u.id from public.customer_communications c join public.customers u on u.workspace_id=c.workspace_id
  where c.id=p_communication_id and c.workspace_id=w and c.reminder_starts_at is not null
    and (c.reminder_all_customers or exists(select 1 from public.customer_communication_recipients r where r.communication_id=c.id and r.customer_id=u.id))
    and (e is null or lower(trim(u.email::text))=e)
    and (p is null or right(regexp_replace(coalesce(u.phone,''),'\D','','g'),10)=p)
  on conflict (communication_id,customer_id) do update set dismissed_at=excluded.dismissed_at;
  get diagnostics n = row_count;
  return n>0;
end $$;
revoke all on function public.dismiss_public_customer_popup_v1(uuid,text,citext,text) from public;
grant execute on function public.dismiss_public_customer_popup_v1(uuid,text,citext,text) to anon,authenticated;

create or replace function public.claim_public_customer_daily_reminder(
  p_salon_code text, p_customer_email citext default null, p_customer_phone text default null
) returns table (communication_id uuid, title text, body text, ends_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_workspace uuid;
  v_email text := nullif(lower(trim(p_customer_email::text)), '');
  v_phone text := nullif(right(regexp_replace(coalesce(p_customer_phone,''), '\D+', '', 'g'),10),'');
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_candidate record;
  v_claimed integer;
begin
  if v_email is null and v_phone is null then return; end if;
  select id into v_workspace from public.workspaces where slug = lower(trim(p_salon_code));
  if v_workspace is null then return; end if;
  -- Serialize the matching recipient set (also covers matching duplicate customer rows).
  perform pg_advisory_xact_lock(hashtextextended(v_workspace::text, 731));
  for v_candidate in
    select distinct c.id, coalesce(c.reminder_title, c.title) as title, coalesce(c.reminder_body, c.body) as body, c.reminder_ends_at, c.created_at
    from public.customer_communications c
    join public.customers u on u.workspace_id=v_workspace
    where c.workspace_id=v_workspace and c.kind='custom'
      and c.reminder_cancelled_at is null
      and (c.reminder_all_customers or exists(select 1 from public.customer_communication_recipients r where r.communication_id=c.id and r.customer_id=u.id))
      and not exists(select 1 from public.customer_communication_reminder_dismissals x where x.communication_id=c.id and x.customer_id=u.id)
      and c.reminder_starts_at <= now() and c.reminder_ends_at > now()
      and (v_email is null or lower(trim(u.email::text))=v_email)
      and (v_phone is null or right(regexp_replace(coalesce(u.phone,''),'\D+','','g'),10)=v_phone)
      and not exists (select 1 from public.customer_communication_reminder_days d
        where d.communication_id=c.id and d.customer_id=u.id and d.shown_day=v_today)
    order by c.created_at, c.id
  loop
    -- Materialize inbox membership for newly registered customers, without push delivery.
    insert into public.customer_communication_recipients(communication_id,customer_id,delivery_status)
    select v_candidate.id,u.id,'unavailable' from public.customers u
    where u.workspace_id=v_workspace
      and exists(select 1 from public.customer_communications c where c.id=v_candidate.id and c.reminder_all_customers)
      and (v_email is null or lower(trim(u.email::text))=v_email)
      and (v_phone is null or right(regexp_replace(coalesce(u.phone,''),'\D+','','g'),10)=v_phone)
    on conflict do nothing;
    insert into public.customer_communication_reminder_days(communication_id,customer_id,shown_day)
    select v_candidate.id, u.id, v_today
    from public.customer_communication_recipients r
    join public.customers u on u.id=r.customer_id and u.workspace_id=v_workspace
    where r.communication_id=v_candidate.id
      and (v_email is null or lower(trim(u.email::text))=v_email)
      and (v_phone is null or right(regexp_replace(coalesce(u.phone,''),'\D+','','g'),10)=v_phone)
    on conflict do nothing;
    get diagnostics v_claimed = row_count;
    if v_claimed > 0 then
      return query select v_candidate.id, v_candidate.title, v_candidate.body, v_candidate.reminder_ends_at;
      return;
    end if;
  end loop;
end $$;
revoke all on function public.claim_public_customer_daily_reminder(text,citext,text) from public;
grant execute on function public.claim_public_customer_daily_reminder(text,citext,text) to anon, authenticated;


notify pgrst, 'reload schema';

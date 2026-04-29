create or replace function public.find_public_customer_by_credentials(
  p_salon_code text,
  p_customer_email text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_phone text := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_workspace record;
  v_match record;
  v_portal_match record;
  v_portal_match_count integer := 0;
  v_backfilled_customer_id uuid;
begin
  if v_salon_code = '' then
    return null;
  end if;

  if v_customer_email is null and v_customer_phone is null then
    return null;
  end if;

  select
    portal.workspace_id,
    coalesce(portal.clienti, '[]'::jsonb) as clienti
  into v_workspace
  from public.client_portals as portal
  where portal.salon_code = v_salon_code
    and portal.subscription_status = 'active'
  limit 1;

  if v_workspace.workspace_id is null then
    return null;
  end if;

  with ranked_matches as (
    select
      customer.id,
      customer.full_name,
      customer.phone,
      customer.email,
      customer.instagram,
      customer.note,
      customer.source,
      customer.viewed_by_salon,
      case
        when v_customer_email is not null
          and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
        then true
        else false
      end as same_email,
      case
        when v_customer_phone is not null
          and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
        then true
        else false
      end as same_phone,
      (
        case
          when v_customer_email is not null
            and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
          then 2
          else 0
        end
        +
        case
          when v_customer_phone is not null
            and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
          then 2
          else 0
        end
      ) as score
    from public.customers as customer
    where customer.workspace_id = v_workspace.workspace_id
      and (
        (v_customer_email is not null and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text)
        or (
          v_customer_phone is not null
          and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
        )
      )
  ),
  best_match as (
    select *
    from ranked_matches
    where score > 0
    order by score desc, viewed_by_salon asc, id desc
    limit 1
  )
  select
    best_match.*,
    (
      select count(*)
      from ranked_matches
      where ranked_matches.score = best_match.score
    ) as same_score_count
  into v_match
  from best_match;

  if v_match.id is null then
    with portal_ranked_matches as (
      select
        item,
        coalesce(nullif(trim(item ->> 'nome'), ''), '') as full_name,
        coalesce(nullif(trim(item ->> 'telefono'), ''), '') as phone,
        coalesce(nullif(lower(trim(item ->> 'email')), ''), '') as email,
        coalesce(nullif(trim(item ->> 'instagram'), ''), '') as instagram,
        coalesce(nullif(trim(item ->> 'nota'), ''), '') as note,
        case
          when lower(coalesce(item ->> 'fonte', '')) = 'frontend' then 'frontend'
          else 'salone'
        end as source,
        coalesce((item ->> 'viewedBySalon')::boolean, false) as viewed_by_salon,
        case
          when v_customer_email is not null
            and lower(trim(coalesce(item ->> 'email', ''))) = v_customer_email::text
          then true
          else false
        end as same_email,
        case
          when v_customer_phone is not null
            and right(regexp_replace(coalesce(item ->> 'telefono', ''), '\D+', '', 'g'), 10) = v_customer_phone
          then true
          else false
        end as same_phone,
        (
          case
            when v_customer_email is not null
              and lower(trim(coalesce(item ->> 'email', ''))) = v_customer_email::text
            then 2
            else 0
          end
          +
          case
            when v_customer_phone is not null
              and right(regexp_replace(coalesce(item ->> 'telefono', ''), '\D+', '', 'g'), 10) = v_customer_phone
            then 2
            else 0
          end
        ) as score
      from jsonb_array_elements(v_workspace.clienti) as item
    ),
    best_portal_match as (
      select *
      from portal_ranked_matches
      where score > 0
      order by score desc, viewed_by_salon asc
      limit 1
    )
    select
      best_portal_match.*,
      (
        select count(*)
        from portal_ranked_matches
        where portal_ranked_matches.score = best_portal_match.score
      ) as same_score_count
    into v_portal_match
    from best_portal_match;

    if v_portal_match.full_name <> '' then
      v_portal_match_count := coalesce(v_portal_match.same_score_count, 0);

      if v_portal_match_count = 1 then
        begin
          insert into public.customers (
            workspace_id,
            full_name,
            phone,
            email,
            instagram,
            note,
            source,
            viewed_by_salon,
            max_future_appointments,
            max_future_appointments_mode,
            max_daily_appointments
          )
          values (
            v_workspace.workspace_id,
            v_portal_match.full_name,
            nullif(v_portal_match.phone, ''),
            nullif(v_portal_match.email, '')::citext,
            nullif(v_portal_match.instagram, ''),
            coalesce(v_portal_match.note, ''),
            v_portal_match.source,
            coalesce(v_portal_match.viewed_by_salon, false),
            case when v_portal_match.source = 'frontend' then 4 else null end,
            case when v_portal_match.source = 'frontend' then 'monthly' else null end,
            case when v_portal_match.source = 'frontend' then 1 else null end
          )
          returning id into v_backfilled_customer_id;
        exception
          when unique_violation then
            v_backfilled_customer_id := null;
        end;
      end if;

      return jsonb_build_object(
        'id', coalesce(v_backfilled_customer_id, gen_random_uuid()),
        'nome', v_portal_match.full_name,
        'telefono', coalesce(v_portal_match.phone, ''),
        'email', coalesce(v_portal_match.email, ''),
        'instagram', coalesce(v_portal_match.instagram, ''),
        'nota', coalesce(v_portal_match.note, ''),
        'fonte', v_portal_match.source,
        'viewedBySalon', coalesce(v_portal_match.viewed_by_salon, false),
        'sameEmail', coalesce(v_portal_match.same_email, false),
        'samePhone', coalesce(v_portal_match.same_phone, false),
        'score', coalesce(v_portal_match.score, 0),
        'sameScoreCount', v_portal_match_count
      );
    end if;

    return null;
  end if;

  return jsonb_build_object(
    'id', v_match.id,
    'nome', coalesce(v_match.full_name, ''),
    'telefono', coalesce(v_match.phone, ''),
    'email', coalesce(v_match.email::text, ''),
    'instagram', coalesce(v_match.instagram, ''),
    'nota', coalesce(v_match.note, ''),
    'fonte',
      case
        when v_match.source = 'frontend' then 'frontend'
        else 'salone'
      end,
    'viewedBySalon', coalesce(v_match.viewed_by_salon, false),
    'sameEmail', coalesce(v_match.same_email, false),
    'samePhone', coalesce(v_match.same_phone, false),
    'score', coalesce(v_match.score, 0),
    'sameScoreCount', coalesce(v_match.same_score_count, 0)
  );
end;
$$;

grant execute on function public.find_public_customer_by_credentials(text, text, text) to anon, authenticated;

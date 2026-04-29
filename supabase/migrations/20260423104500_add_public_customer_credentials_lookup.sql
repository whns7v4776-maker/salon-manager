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
begin
  if v_salon_code = '' then
    return null;
  end if;

  if v_customer_email is null and v_customer_phone is null then
    return null;
  end if;

  select
    portal.workspace_id
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

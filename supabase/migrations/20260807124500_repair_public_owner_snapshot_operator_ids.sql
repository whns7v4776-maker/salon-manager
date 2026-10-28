-- The lightweight public catalog reads operators from owner_app_snapshots.
-- Reconcile that public copy with canonical operators by workspace + name,
-- while leaving all historical booking records untouched.

with repaired as (
  select snapshot.id,
    jsonb_set(
      snapshot.payload,
      '{operatori}',
      (
        select coalesce(
          jsonb_agg(
            case
              when canonical.id is null then item.value
              else jsonb_set(item.value, '{id}', to_jsonb(canonical.id::text), true)
            end
            order by item.ordinality
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(coalesce(snapshot.payload -> 'operatori', '[]'::jsonb))
          with ordinality as item(value, ordinality)
        left join lateral (
          select operator.id
          from public.operators as operator
          where operator.workspace_id = snapshot.workspace_id
            and lower(trim(operator.name)) =
              lower(trim(coalesce(item.value ->> 'nome', item.value ->> 'name', '')))
          order by operator.updated_at desc nulls last, operator.created_at desc
          limit 1
        ) as canonical on true
      ),
      true
    ) as payload
  from public.owner_app_snapshots as snapshot
)
update public.owner_app_snapshots as snapshot
set payload = repaired.payload
from repaired
where repaired.id = snapshot.id
  and snapshot.payload is distinct from repaired.payload;

notify pgrst, 'reload schema';

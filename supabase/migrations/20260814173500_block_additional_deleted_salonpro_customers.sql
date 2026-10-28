insert into public.customer_deletion_tombstones (
  workspace_id,
  customer_id,
  normalized_name
)
values
  ('d84f3211-d20f-45a3-9d7f-f551400690fd', '9d373f9e-7a14-4f79-8ba7-1546a0ab8a15', 'rosa bon'),
  ('d84f3211-d20f-45a3-9d7f-f551400690fd', '98fa7bec-fffc-468e-9fd5-bee8deb9fd6f', 'isabella rossi'),
  ('d84f3211-d20f-45a3-9d7f-f551400690fd', 'fb32ea35-9cea-44b4-8812-4d1e1f44e42c', 'bea c.')
on conflict (workspace_id, normalized_name)
do update set customer_id = excluded.customer_id;

delete from public.customers
where workspace_id = 'd84f3211-d20f-45a3-9d7f-f551400690fd'
  and id in (
    '9d373f9e-7a14-4f79-8ba7-1546a0ab8a15',
    '98fa7bec-fffc-468e-9fd5-bee8deb9fd6f',
    'fb32ea35-9cea-44b4-8812-4d1e1f44e42c'
  );

update public.owner_app_snapshots as snapshot
set payload = jsonb_set(
  coalesce(snapshot.payload, '{}'::jsonb),
  '{clienti}',
  public.filter_deleted_snapshot_customers(
    snapshot.workspace_id,
    coalesce(snapshot.payload -> 'clienti', '[]'::jsonb)
  ),
  true
)
where snapshot.workspace_id = 'd84f3211-d20f-45a3-9d7f-f551400690fd';

update public.client_portals as portal
set clienti = public.filter_deleted_snapshot_customers(
  portal.workspace_id,
  coalesce(portal.clienti, '[]'::jsonb)
)
where portal.workspace_id = 'd84f3211-d20f-45a3-9d7f-f551400690fd';

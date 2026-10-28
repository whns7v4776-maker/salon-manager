alter table public.workspaces
  add column if not exists activity_category text not null default '',
  add column if not exists street_line text not null default '',
  add column if not exists city text not null default '',
  add column if not exists postal_code text not null default '';

update public.workspaces as w
set
  activity_category = coalesce(
    nullif(trim(w.activity_category), ''),
    nullif(trim(cp.activity_category), ''),
    ''
  ),
  street_line = coalesce(
    nullif(trim(w.street_line), ''),
    nullif(trim(concat_ws(' ', cp.street_type, cp.street_name, cp.street_number)), ''),
    ''
  ),
  city = coalesce(
    nullif(trim(w.city), ''),
    nullif(trim(cp.city), ''),
    ''
  ),
  postal_code = coalesce(
    nullif(trim(w.postal_code), ''),
    nullif(trim(cp.postal_code), ''),
    ''
  )
from public.client_portals as cp
where cp.workspace_id = w.id
  and (
    trim(w.activity_category) = '' or
    trim(w.street_line) = '' or
    trim(w.city) = '' or
    trim(w.postal_code) = ''
  );

update public.workspaces as w
set
  activity_category = coalesce(
    nullif(trim(w.activity_category), ''),
    nullif(trim(os.payload #>> '{workspace,activityCategory}'), ''),
    ''
  ),
  street_line = coalesce(
    nullif(trim(w.street_line), ''),
    nullif(
      trim(
        concat_ws(
          ' ',
          coalesce(os.payload #>> '{workspace,streetType}', ''),
          coalesce(os.payload #>> '{workspace,streetName}', ''),
          coalesce(os.payload #>> '{workspace,streetNumber}', '')
        )
      ),
      ''
    ),
    ''
  ),
  city = coalesce(
    nullif(trim(w.city), ''),
    nullif(trim(os.payload #>> '{workspace,city}'), ''),
    ''
  ),
  postal_code = coalesce(
    nullif(trim(w.postal_code), ''),
    nullif(trim(os.payload #>> '{workspace,postalCode}'), ''),
    ''
  )
from public.owner_app_snapshots as os
where os.workspace_id = w.id
  and (
    trim(w.activity_category) = '' or
    trim(w.street_line) = '' or
    trim(w.city) = '' or
    trim(w.postal_code) = ''
  );

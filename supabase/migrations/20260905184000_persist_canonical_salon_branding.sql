-- Keep branding beside the other canonical profile fields, not only in caches.
-- NULL leaves legacy salons unchanged until their next explicit profile save.
alter table public.workspaces
  add column if not exists salon_name_font_variant text,
  add column if not exists salon_name_display_style text,
  add column if not exists salon_branding_updated_at timestamptz;

grant update (salon_name_font_variant, salon_name_display_style)
  on public.workspaces to authenticated;

create or replace function public.stamp_salon_branding_v1()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.salon_name_font_variant is distinct from old.salon_name_font_variant
    or new.salon_name_display_style is distinct from old.salon_name_display_style then
    new.salon_branding_updated_at := clock_timestamp();
  end if;
  return new;
end;
$$;
create trigger stamp_salon_branding_v1
before update of salon_name_font_variant, salon_name_display_style on public.workspaces
for each row execute function public.stamp_salon_branding_v1();

create or replace function public.protect_salon_branding_projection_v1()
returns trigger language plpgsql security definer set search_path = public as $$
declare w public.workspaces%rowtype;
begin
  select * into w from public.workspaces where id = new.workspace_id;
  if w.salon_branding_updated_at is null then return new; end if;
  if tg_table_name = 'client_portals' then
    new.salon_name_font_variant := w.salon_name_font_variant;
    new.salon_name_display_style := w.salon_name_display_style;
  else
    new.payload := jsonb_set(coalesce(new.payload, '{}'::jsonb), '{workspace}',
      coalesce(new.payload -> 'workspace', '{}'::jsonb) || jsonb_build_object(
        'salonNameFontVariant', w.salon_name_font_variant,
        'salonNameDisplayStyle', w.salon_name_display_style,
        'salonBrandingUpdatedAt', w.salon_branding_updated_at
      ), true);
  end if;
  return new;
end;
$$;
create trigger protect_salon_branding_projection_v1
before insert or update on public.client_portals
for each row execute function public.protect_salon_branding_projection_v1();
create trigger protect_salon_branding_projection_v1
before insert or update on public.owner_app_snapshots
for each row execute function public.protect_salon_branding_projection_v1();

-- Propagate a confirmed edit immediately; do not wait for full catalog publish.
create or replace function public.publish_salon_branding_v1()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.salon_branding_updated_at is distinct from old.salon_branding_updated_at then
    update public.client_portals set
      salon_name_font_variant = new.salon_name_font_variant,
      salon_name_display_style = new.salon_name_display_style
    where workspace_id = new.id;
  end if;
  return new;
end;
$$;
create trigger publish_salon_branding_v1
after update of salon_name_font_variant, salon_name_display_style on public.workspaces
for each row execute function public.publish_salon_branding_v1();

revoke all on function public.stamp_salon_branding_v1() from public, anon, authenticated;
revoke all on function public.protect_salon_branding_projection_v1() from public, anon, authenticated;
revoke all on function public.publish_salon_branding_v1() from public, anon, authenticated;

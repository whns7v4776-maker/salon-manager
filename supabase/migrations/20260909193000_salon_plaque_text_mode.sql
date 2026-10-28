begin;
alter table public.salon_logo_plaques
  add column display_mode text not null default 'logo' check (display_mode in ('text','logo')),
  add column text_font text not null default 'manrope';
create or replace function public.get_salon_logo_plaque_v1(p_workspace_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('path',case when display_mode='logo' then approved_path else null end,
    'mode',display_mode,'font',text_font,'finish',finish,'updatedAt',updated_at)
  from public.salon_logo_plaques where workspace_id=p_workspace_id
    and (display_mode='text' or approved_path is not null);
$$;
commit;

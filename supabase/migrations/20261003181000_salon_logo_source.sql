alter table salon_logo_plaques add column approved_source text not null default 'unknown' check(approved_source in ('unknown','upload','ai'));
-- Original uploads without an AI job are identifiable. Ambiguous existing artwork stays untouched.
update salon_logo_plaques set approved_source='upload' where display_mode='logo' and approved_path is not null and job_id is null and state='idle' and draft_path is null;
create or replace function public.get_salon_logo_plaque_v1(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('path',case when display_mode='logo' then approved_path else null end,
 'mode',display_mode,'font',text_font,'finish',finish,'source',approved_source,'updatedAt',updated_at)
 from salon_logo_plaques where workspace_id=p_workspace_id and (display_mode='text' or approved_path is not null);
$$;

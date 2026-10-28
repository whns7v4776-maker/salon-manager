create or replace function public.handle_client_portal_public_snapshot_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_sqlstate text;
  v_sqlerrm text;
begin
  v_workspace_id := coalesce(new.workspace_id, old.workspace_id);

  if v_workspace_id is null then
    return coalesce(new, old);
  end if;

  begin
    perform public.sync_client_portal_appointments(v_workspace_id);
  exception
    when others then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_sqlerrm = message_text;

      if v_sqlstate in ('XX002', '57014')
        or position('pg_toast_' in lower(coalesce(v_sqlerrm, ''))) > 0
        or position('heap tid from index tuple' in lower(coalesce(v_sqlerrm, ''))) > 0
        or position('statement timeout' in lower(coalesce(v_sqlerrm, ''))) > 0 then
        raise log 'Skip sync_client_portal_appointments for workspace % due to %: %',
          v_workspace_id,
          v_sqlstate,
          v_sqlerrm;
      else
        raise;
      end if;
  end;

  begin
    perform public.sync_client_portal_booking_requests(v_workspace_id);
  exception
    when others then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_sqlerrm = message_text;

      if v_sqlstate in ('XX002', '57014')
        or position('pg_toast_' in lower(coalesce(v_sqlerrm, ''))) > 0
        or position('heap tid from index tuple' in lower(coalesce(v_sqlerrm, ''))) > 0
        or position('statement timeout' in lower(coalesce(v_sqlerrm, ''))) > 0 then
        raise log 'Skip sync_client_portal_booking_requests for workspace % due to %: %',
          v_workspace_id,
          v_sqlstate,
          v_sqlerrm;
      else
        raise;
      end if;
  end;

  return coalesce(new, old);
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_cast cast_entry
    join pg_type source_type on source_type.oid = cast_entry.castsource
    join pg_type target_type on target_type.oid = cast_entry.casttarget
    join pg_namespace target_namespace on target_namespace.oid = target_type.typnamespace
    where source_type.typname = 'text'
      and target_namespace.nspname = 'public'
      and target_type.typname = 'request_origin'
  ) then
    create cast (text as public.request_origin) with inout as assignment;
  end if;
end;
$$;

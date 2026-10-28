do $$
begin
  raise log 'Skipping direct reindex of pg_toast.pg_toast_712320_index in migrations; handled separately if needed.';
end;
$$;
notify pgrst, 'reload schema';

delete from public.customers
where id = '61523512-2674-473e-8976-b6684e716acc'
  and workspace_id = 'c3e6bd83-aed6-4a2f-b3a7-b88a82ec8f98'
  and lower(trim(coalesce(full_name, ''))) = 'codex verifica 1717'
  and lower(trim(coalesce(email::text, ''))) = 'codex.verifica.1717@example.com';

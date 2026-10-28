-- Private, durable copies of sandbox PDFs. Never expose these through public URLs.
alter table public.cash_fiscal_sandbox
 add column if not exists archived_at timestamptz,
 add column if not exists void_archived_at timestamptz;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fiscal-documents','fiscal-documents',false,10485760,array['application/pdf'])
on conflict(id) do nothing;
-- No authenticated storage policies: downloads go through the authenticated,
-- workspace-scoped fiscal endpoint. No automatic retention/deletion job.

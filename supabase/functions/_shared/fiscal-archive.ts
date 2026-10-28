const tester = 'd84f3211-d20f-45a3-9d7f-f551400690fd';
/** Persist once, then read the private copy even after provider access expires. */
export async function archivedFiscalPdf(db: any, client: {pdf:(id:string)=>Promise<Uint8Array>} | undefined, row: any, isVoid = false): Promise<Uint8Array> {
 if (row.workspace_id !== tester || !/^[a-f0-9-]{36}$/i.test(row.id)) throw Error('workspace');
 const ready = isVoid ? row.void_status === 'ready' : row.status === 'ready';
 const id = isVoid ? row.void_id : row.provider_id;
 if (!ready || !id) throw Error('not_ready');
 const path = `${row.workspace_id}/${row.id}/${isVoid ? 'annullamento' : 'ricevuta'}.pdf`;
 const bucket = db.storage.from('fiscal-documents');
 const stored = await bucket.download(path);
 let bytes: Uint8Array;
 if (stored.data && !stored.error) bytes = new Uint8Array(await stored.data.arrayBuffer());
 else {
  if (!client) throw Error('archive_unavailable');
  bytes = await client.pdf(id);
  if (new TextDecoder().decode(bytes.slice(0,5)) !== '%PDF-') throw Error('invalid_pdf');
  const upload = await bucket.upload(path,bytes,{contentType:'application/pdf',upsert:false});
  // A concurrent worker may already have persisted the same immutable document.
  if (upload.error) {
   const existing = await bucket.download(path);
   if (existing.error || !existing.data) throw Error('archive_write');
   bytes = new Uint8Array(await existing.data.arrayBuffer());
  }
 }
 const field = isVoid ? 'void_archived_at' : 'archived_at';
 if (!row[field]) {
  const updated = await db.from('cash_fiscal_sandbox').update({[field]:new Date().toISOString()}).eq('workspace_id',tester).eq('id',row.id);
  if (updated.error) throw Error('database');
 }
 return bytes;
}

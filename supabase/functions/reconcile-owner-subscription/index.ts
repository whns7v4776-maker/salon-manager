import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { reconcileStoreWorkspace } from '../_shared/store-reconciliation.ts';
const headers = { 'content-type':'application/json', 'access-control-allow-origin':'*', 'access-control-allow-headers':'authorization, apikey, content-type, x-client-info' };
Deno.serve(async request => {
  if (request.method==='OPTIONS') return new Response('ok',{headers});
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  const url=Deno.env.get('SUPABASE_URL')!; const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return reply({error:'unauthorized'},401);
  const {data:{user},error}=await admin.auth.getUser(token);
  if(error||!user)return reply({error:'unauthorized'},401);
  const body=await request.json().catch(()=>null);
  if(!body?.workspaceId)return reply({error:'workspace_required'},400);
  const {data:workspace,error:lookup}=await admin.from('workspaces').select('id,owner_email').eq('id',body.workspaceId).maybeSingle();
  if(lookup||!workspace||workspace.owner_email.toLowerCase()!==user.email?.toLowerCase())return reply({error:'workspace_not_authorized'},403);
  try { return reply(await reconcileStoreWorkspace(admin,workspace.id)); }
  catch { return reply({error:'store_verification_unavailable'},503); }
});

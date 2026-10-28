import {createClient} from '@supabase/supabase-js';
import {supabase,supabaseUrl,supabaseAnonKey} from './supabase';

/** Native has no browser Origin. Verify the owner with a separate, memory-only auth client. */
export async function verifyCashOwnerPassword(password:string,expectedEmail:string) {
  const identity=await supabase.auth.getUser();
  const user=identity.data.user;
  if(identity.error||!user?.email||user.email.toLowerCase()!==expectedEmail.trim().toLowerCase())
    throw new Error('Accedi con l’account del titolare per usare questo sblocco.');
  if(!password)throw new Error('Inserisci la password del titolare.');
  const [workspace,access]=await Promise.all([supabase.rpc('current_workspace_id'),supabase.rpc('workspace_access_allowed')]);
  if(workspace.error||!workspace.data||access.error||!access.data)throw new Error('Accesso al salone non disponibile.');
  const membership=await supabase.from('workspace_members').select('user_id').eq('workspace_id',workspace.data).eq('user_id',user.id).eq('role','owner').maybeSingle();
  if(membership.error||!membership.data)throw new Error('Lo sblocco è riservato al titolare del salone.');
  const verifier=createClient(supabaseUrl,supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'salonpro-native-cash-verifier'}});
  try {
    const result=await verifier.auth.signInWithPassword({email:user.email,password});
    if(result.error||result.data.user?.id!==user.id)throw new Error('Password del titolare non valida.');
  } finally {
    await verifier.auth.signOut({scope:'local'}).catch(()=>undefined);
  }
}

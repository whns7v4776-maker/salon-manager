import { supabase } from './supabase';
export type CustomerMoveNotice = { name:string;phone:string;email:string;message:string;reason:string };
const listeners=new Set<(notice:CustomerMoveNotice)=>void>();
export const subscribeCustomerMoveNotice=(listener:(notice:CustomerMoveNotice)=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export async function checkMovedCustomerNotification({workspaceId,customerId,name,phone,email,service,date,time,salonName}:{workspaceId:string;customerId?:string;name:string;phone:string;email:string;service:string;date:string;time:string;salonName:string}) {
 let reason='Il consenso alle notifiche non è stato verificato.';
 try {
 if(customerId){
  const {data,error}=await supabase.from('customers').select('notification_permission,notification_permission_checked_at').eq('workspace_id',workspaceId).eq('id',customerId).maybeSingle();
  if(!error&&data){
   const checked=Date.parse(data.notification_permission_checked_at??'');
   if(data.notification_permission==='granted'&&Number.isFinite(checked)&&Date.now()-checked<72*3600000){
    const digits=phone.replace(/\D/g,'').slice(-10);
    const targets=[];
    if(email.trim())targets.push(supabase.from('push_devices').select('id').eq('workspace_id',workspaceId).eq('recipient_kind','client').eq('is_active',true).eq('customer_email',email.trim().toLowerCase()).limit(1));
    if(digits)targets.push(supabase.from('push_devices').select('id').eq('workspace_id',workspaceId).eq('recipient_kind','client').eq('is_active',true).eq('customer_phone',digits).limit(1));
    const results=await Promise.all(targets);
    if(results.some(result=>!result.error&&result.data?.length))return;
    reason='Il consenso è consentito, ma non risulta un dispositivo push attivo verificabile. Avvisa il cliente con un altro canale.';
   } else
   reason=data.notification_permission==='denied'?'Il cliente ha negato il consenso alle notifiche.':data.notification_permission==='undetermined'?'Il cliente non ha ancora autorizzato le notifiche.':data.notification_permission==='granted'?'Il consenso risulta consentito, ma la verifica non è recente.':'Il consenso alle notifiche non è stato verificato.';
  }
 }
 } catch {
  reason='Non è stato possibile verificare le notifiche del cliente. Avvisalo con un altro canale.';
 }
 const formatted=/^\d{4}-\d{2}-\d{2}$/.test(date)?date.split('-').reverse().join('/'):date;
 const message=`Ciao ${name}, ${salonName} ha aggiornato il tuo appuntamento per ${service}: ${formatted} alle ${time}. Contattaci se il nuovo orario non va bene.`;
 listeners.forEach(listener=>listener({name,phone,email,message,reason}));
}

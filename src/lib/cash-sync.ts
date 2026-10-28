import { supabase } from './supabase';
export type CashRow = {id:string;workspace_id:string;appointment_id:string|null;description:string;amount:number;payment_method:'cash'|'card'|'bank_transfer'|null;card_label:string|null;created_at:string;booking_voided?:boolean};
// Keyset pagination avoids the API's 1000-row cap and offset shifts during inserts.
export async function fetchCashRows(workspaceId:string) {
 const rows:CashRow[]=[]; let after:string|undefined;
 for (;;) {
  // The optional cancellation marker is absent on older servers; '*' keeps OTA
  // compatible without silently treating cancelled booking balances as money due.
  let query=supabase.from('cash_movements').select('*').eq('workspace_id',workspaceId).order('id').limit(500);
  if(after)query=query.gt('id',after);
  const {data,error}=await query;
  if(error)return {data:[] as CashRow[],error};
  rows.push(...(data as CashRow[]).filter(row=>row.booking_voided!==true));
  if(data.length<500)return {data:rows,error:null};
  after=data[data.length-1].id;
 }
}

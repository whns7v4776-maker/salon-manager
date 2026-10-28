/** Keep database implementation details out of customer feedback. */
export function customerDeletionErrorMessage(error:unknown):string {
 const value=typeof error==='string'?error:error&&typeof error==='object'?String((error as {message?:unknown}).message??''):'';
 const detail=error&&typeof error==='object'?String((error as {details?:unknown}).details??''):'';
 const message=`${value} ${detail}`;
 if(/customer_has_service_packages|Il pacchetto è nominativo|pacchetti nominativi/i.test(message))return 'Questo cliente ha pacchetti nominativi collegati. Non può essere eliminato definitivamente perché devono restare associati al suo storico. Puoi usare “Inibisci” per impedirgli nuove prenotazioni.';
 if(/customer_has_retained_history|foreign key|23503|storico di fedeltà/i.test(message))return 'Questo cliente ha movimenti fedeltà, ordini o operazioni di pagamento collegati. Non può essere eliminato definitivamente perché lo storico deve restare integro. Puoi usare “Inibisci” per impedirgli nuove prenotazioni.';
 if(/owner_session_required|JWT|session.*expired/i.test(message))return 'La sessione è scaduta. Rientra nel salone e riprova.';
 if(/workspace_access_denied/i.test(message))return 'Non hai accesso all’eliminazione in questo salone. Verifica il profilo e l’abbonamento.';
 if(/customer_not_found|customer_id_invalid/i.test(message))return 'Il cliente non è più presente nella rubrica. Aggiorna la pagina e riprova.';
 if(/customer_registration_required|customer_registration_pending/i.test(message))return 'Il server ha bloccato l’eliminazione durante la verifica delle prenotazioni. Il cliente non è stato eliminato. Aggiorna e riprova.';
 if(!value.trim()||/^[a-z0-9_]+$|PGRST|SQLSTATE|constraint|syntax error|permission denied|relation .*does not exist|column .*does not exist|function .*does not exist|invalid input syntax/i.test(value))return 'Non è stato possibile completare l’operazione. Il cliente non è stato eliminato. Riprova tra poco.';
 return value.trim();
}
export function customerFeedbackMessage(message:string):string {
 if(/customer_has_|customer_registration_|Il pacchetto è nominativo|foreign key|constraint|syntax error|permission denied|SQLSTATE|PGRST|^[a-z0-9_]+$/i.test(message))return customerDeletionErrorMessage(message);
 return message;
}

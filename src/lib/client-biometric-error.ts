export function clientBiometricError(error: string): string {
  switch (error) {
    case 'not_enrolled': return 'Configura Face ID o un’impronta nelle impostazioni del telefono, poi torna qui e riprova.';
    case 'not_available': return 'Face ID o impronta non sono disponibili. Controlla che siano configurati sul telefono e che SalonPro abbia il permesso di usarli.';
    case 'lockout': return 'Il telefono ha bloccato temporaneamente la verifica biometrica dopo troppi tentativi. Sbloccalo con il codice e riprova.';
    case 'passcode_not_set': return 'Imposta prima un codice di sblocco nelle impostazioni del telefono, poi configura Face ID o impronta.';
    case 'authentication_failed': return 'Il telefono non ti ha riconosciuto. Riprova la verifica con Face ID o impronta.';
    case 'user_cancel': case 'user_fallback': return 'Verifica annullata. L’accesso biometrico non è stato attivato: puoi riprovare quando vuoi.';
    case 'system_cancel': case 'app_cancel': return 'La verifica è stata interrotta. Torna nell’app e riprova.';
    case 'timeout': return 'Tempo per la verifica scaduto. Riprova.';
    default: return 'Il telefono non ha completato la verifica. Controlla le impostazioni di Face ID o impronta e riprova.';
  }
}

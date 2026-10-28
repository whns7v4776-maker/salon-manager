# Archivio ricevute — 28 settembre 2026

- Disponibile solo al workspace tester già autorizzato. Modalità A-Cube sandbox, nessun abbonamento o emissione reale.
- Sezione autonoma sotto Ricevute fiscali; ultimo anno preselezionato, filtri, ricerca e 8 risultati per pagina. Tutti gli anni mantiene paginazione e intestazioni annuali.
- Excel dedicato: Panoramica, Documenti, Annullamenti, Invii email. Anno selezionato completo, non solo la pagina o il filtro di ricerca.
- ZIP con tutti i PDF pronti dell'anno selezionato (o tutti gli anni), cartelle annuali Ricevute/Annullamenti. File mancanti segnalati nello ZIP e nell'interfaccia; nessuna falsa conferma di completezza. Limite 100 MB sul dispositivo con invito a esportare un anno alla volta.
- Copie PDF immutabili nel bucket privato fiscal-documents. Nessuna policy diretta anon/authenticated; accesso mediante endpoint autenticato e limitato al workspace. Gli originali restano disponibili dopo annullamento.
- Il worker copia anche i documenti pronti preesistenti. Download delle copie già archiviate disponibile senza token A-Cube valido. Non è conservazione fiscale a norma.
- La tabella resta un registro di collaudo, separato dai movimenti e dagli incassi reali. Un pagamento rifiutato non conta come documento emesso. “Affidata al servizio email” non significa consegnata.
- Nessun documento di test è pubblicato nell'area di un cliente reale; email solo al tester. L'accesso ai documenti fiscali di produzione resta subordinato all'attivazione futura del servizio e alla relativa identità cliente.

Verifiche: TypeScript, 10 test Deno (archivio, invio, pagamento/rimborso), test Excel con riapertura XLSX, test ZIP inclusi file mancanti e cambio anno Europe/Rome. Safari: apertura archivio, filtro annullamenti, export Excel e ZIP. Download reale: 5 originali e 2 annullamenti validi. Excel aperto in Microsoft Excel per verifica visiva. Nessuna nuova build nativa.

# Controlli di espansione

Per i nuovi controlli espandi/riduci usare `PremiumExpandButton` con `salon` e
`compact`, come nelle card Ricevute fiscali e Pagamento alla prenotazione.
La freccia, il fondo arrotondato, la risposta al tap e lo stato accessibile
restano quelli del componente condiviso. Il pulsante deve essere fratello
(e non figlio) dell'eventuale intestazione cliccabile, per evitare doppi toggle.
Mantenere le etichette di accessibilità distinte tra apertura e chiusura.

Le card indipendenti consecutive mantengono 16 px di separazione; gli editor
integrati nei popup non aggiungono un margine esterno dedicato alla pagina.

# Deploy web frontend cliente

## Obiettivo
Pubblicare il frontend cliente via web mantenendo la stessa UI dell'app Expo.

## Stack scelto
- Frontend: Expo Router + React Native Web
- Hosting consigliato: Vercel
- Output: static web export (`dist/`)
- Node consigliato: 22

## Stato del progetto
Il repository è già preparato per Vercel tramite `vercel.json`.

## URL pubblico cliente
Dopo il primo deploy, copia l'URL pubblico generato da Vercel e impostalo in `app.json` dentro:

```json
{
  "expo": {
    "extra": {
      "publicClientBaseUrl": "https://TUO-DOMINIO.vercel.app"
    }
  }
}
```

Il QR e il link condiviso useranno automaticamente:
- `https://TUO-DOMINIO.vercel.app/join/CODICE`

## Passi di deploy
1. Crea un account Vercel.
2. Importa questo progetto.
3. Lascia questi valori:
   - Build command: `npx expo export -p web`
   - Output directory: `dist`
  - Node.js: `22`
4. Pubblica.
5. Prendi l'URL generato.
6. Inserisci quell'URL in `app.json` come `publicClientBaseUrl`.
7. Esegui una nuova build dell'app mobile.

## Nota operativa
- Il backoffice non mostra più i pulsanti pubblici per aprire il frontend cliente.
- L'anteprima frontend resta disponibile solo nel pannello admin nascosto.
- Il cliente entra via link/QR su `/join/[code]` e viene instradato al salone corretto.

export const clientiIniziali = [
  { id: '1', nome: 'Giulia Rossi', telefono: '3331234567', nota: 'Taglio + piega' },
  { id: '2', nome: 'Marco Bianchi', telefono: '3347654321', nota: 'Taglio uomo' },
  { id: '3', nome: 'Sara Verdi', telefono: '3359876543', nota: 'Colore e trattamento' },
];

export const appuntamentiIniziali = [
  {
    id: '1',
    ora: '09:00',
    cliente: 'Giulia Rossi',
    servizio: 'Taglio + piega',
    prezzo: 35,
    incassato: false,
    completato: false,
  },
  {
    id: '2',
    ora: '11:00',
    cliente: 'Marco Bianchi',
    servizio: 'Taglio uomo',
    prezzo: 20,
    incassato: false,
    completato: false,
  },
  {
    id: '3',
    ora: '15:30',
    cliente: 'Sara Verdi',
    servizio: 'Colore e trattamento',
    prezzo: 60,
    incassato: false,
    completato: false,
  },
];

export const movimentiIniziali = [
  { id: '1', descrizione: 'Taglio + piega', importo: 35 },
  { id: '2', descrizione: 'Taglio uomo', importo: 20 },
  { id: '3', descrizione: 'Colore', importo: 60 },
];

export const serviziIniziali = [
  { id: '1', nome: 'Taglio donna', prezzo: 25 },
  { id: '2', nome: 'Taglio uomo', prezzo: 18 },
  { id: '3', nome: 'Piega', prezzo: 20 },
  { id: '4', nome: 'Colore', prezzo: 45 },
];
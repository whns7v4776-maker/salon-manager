/** Muted section headers; never changes controls or their selected state. */
export function premiumSectionAccent(night: boolean, section: string | number) {
 const index = typeof section === 'number' ? section : /promo|premi|regal|indic|periodo|messaggio/i.test(section) ? 3 : /prezzo|importo|durata|orari|tempistic|emess/i.test(section) ? 2 : /future|accettaz|prenota(?!zioni giornaliere)|online|cliente|vantaggi|destinatar/i.test(section) ? 0 : 1;
 // No sage green: bronze, slate, mauve and warm grey, kept very light so headers never read as heavy blocks.
 const rgb = ['140,112,72', '110,130,160', '160,120,145', '130,120,105'][index % 4];
 return { backgroundColor: `rgba(${rgb},${night ? '.06' : '.05'})`, borderColor: `rgba(${rgb},${night ? '.18' : '.18'})`, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 };
}

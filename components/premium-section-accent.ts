/** Muted section headers; never changes controls or their selected state. */
export function premiumSectionAccent(night: boolean, section: string | number) {
 const index = typeof section === 'number' ? section : /promo|premi|regal|indic|periodo|messaggio/i.test(section) ? 3 : /prezzo|importo|durata|orari|tempistic|emess/i.test(section) ? 2 : /future|accettaz|prenota(?!zioni giornaliere)|online|cliente|vantaggi|destinatar/i.test(section) ? 0 : 1;
 const rgb = ['124,166,134', '130,165,191', '194,158,112', '177,135,160'][index % 4];
 return { backgroundColor: `rgba(${rgb},${night ? '.07' : '.08'})`, borderColor: `rgba(${rgb},${night ? '.17' : '.16'})`, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 };
}

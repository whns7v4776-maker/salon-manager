export type BadgeMode = 'visits' | 'spend' | 'both' | 'either' | 'bookings';
export type BadgeTierId = 'frequente' | 'premium' | 'top_premium';
export type BadgeTierRule = { id: BadgeTierId; label: string; mode: BadgeMode; visits: number; spendCents: number; bookings: number };
export type CustomerBadgePolicy = { windowMonths: number; cancellationThreshold: number; noShowThreshold: number; tiers: BadgeTierRule[] };
export const defaultCustomerBadgePolicy = (): CustomerBadgePolicy => ({
 windowMonths: 12, cancellationThreshold: 5, noShowThreshold: 3,
 tiers: [
  { id: 'frequente', label: 'Frequente', mode: 'visits', visits: 10, spendCents: 20000, bookings: 10 },
  { id: 'premium', label: 'Premium', mode: 'both', visits: 20, spendCents: 50000, bookings: 20 },
  { id: 'top_premium', label: 'Top Premium', mode: 'both', visits: 40, spendCents: 150000, bookings: 40 },
 ],
});
export const badgeModes: { id: BadgeMode; label: string }[] = [
 { id: 'visits', label: 'Visite' }, { id: 'spend', label: 'Spesa' }, { id: 'both', label: 'Visite e spesa' },
 { id: 'either', label: 'Visite o spesa' }, { id: 'bookings', label: 'Prenotazioni' },
];
export function validateCustomerBadgePolicy(config: CustomerBadgePolicy): string | null {
 if (![0,6,12,24,36].includes(config.windowMonths)) return 'Scegli un periodo valido.';
 if (![config.cancellationThreshold,config.noShowThreshold].every(n=>Number.isInteger(n)&&n>=1&&n<=1000)) return 'Le soglie degli indicatori devono essere tra 1 e 1000.';
 if(config.tiers.length!==3)return 'Sono necessari tre livelli.';
 const ids=['frequente','premium','top_premium'];
 for (const [index,rule] of config.tiers.entries()) {
  if(rule.id!==ids[index]||!rule.label.trim()||rule.label.trim().length>32||!badgeModes.some(mode=>mode.id===rule.mode))return 'Controlla il nome e il criterio di ogni livello.';
  if(![rule.visits,rule.bookings].every(n=>Number.isInteger(n)&&n>=1&&n<=10000)||!Number.isInteger(rule.spendCents)||rule.spendCents<100||rule.spendCents>100000000)return 'Usa soglie da 1 a 10.000 visite/prenotazioni e da 1 a 1.000.000 €.';
 }
 return null;
}
export function describeBadgeRule(rule?: BadgeTierRule | null) {
 if(!rule)return 'Livello iniziale: le soglie dei livelli successivi non sono ancora raggiunte.';
 const visits=`almeno ${rule.visits} visite completate`;
 const spend=`almeno ${(rule.spendCents/100).toLocaleString('it-IT',{style:'currency',currency:'EUR'})} incassati sui servizi conclusi`;
 if(rule.mode==='visits')return visits;
 if(rule.mode==='spend')return spend;
 if(rule.mode==='bookings')return `almeno ${rule.bookings} prenotazioni confermate o in attesa nel periodo`;
 return `${visits} ${rule.mode==='both'?'e':'oppure'} ${spend}`;
}

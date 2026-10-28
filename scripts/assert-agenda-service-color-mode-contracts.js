const fs = require('fs');
const path = require('path');

const root = path.resolve('.');
const agendaSource = fs.readFileSync(
  path.join(root, 'app/(tabs)/agenda.tsx'),
  'utf8',
);

const fail = (message) => {
  throw new Error(`Contratto colori servizi Agenda violato: ${message}`);
};

const sourceBetween = (startMarker, endMarker) => {
  const start = agendaSource.indexOf(startMarker);
  const end = agendaSource.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end <= start) {
    fail(`sezione sorgente non trovata: ${startMarker}`);
  }
  return agendaSource.slice(start, end);
};

const onlineNonCompositionPredicate =
  /\.filter\(\s*\(item\)\s*=>[\s\S]{0,90}?item\.disponibileOnline\s*!==\s*false\s*&&\s*item\.soloComposizione\s*!==\s*true/;

const activeLaneServicesSource = sourceBetween(
  'const activeAgendaLaneServices = useMemo',
  'const activeAgendaLaneRoleKeySet = useMemo',
);

if (!onlineNonCompositionPredicate.test(activeLaneServicesSource)) {
  fail(
    'le corsie autorevoli devono includere solo servizi catalogo online e non solo-composizione',
  );
}

if (!/!item\.compositionId\?\.trim\(\)/.test(activeLaneServicesSource)) {
  fail('le corsie autorevoli non devono duplicare i servizi tecnici di composizione');
}

if (!/return \[\.\.\.activeCatalogServices, \.\.\.agendaCompositionLaunchers\];/.test(activeLaneServicesSource)) {
  fail('le composizioni attive devono continuare a partecipare alle corsie autorevoli');
}

const activeRoleSetSource = sourceBetween(
  'const activeAgendaLaneRoleKeySet = useMemo',
  'const activeAgendaLaneCapacityKeySet = useMemo',
);
if (!/activeAgendaLaneServices\s*\.map\(\(item\)\s*=>\s*normalizeSalonCapacityRoleKey\(item\.mestiereRichiesto \?\? ["']["']\)/.test(activeRoleSetSource)) {
  fail('i mestieri mono/multi devono derivare dalle corsie autorevoli attive');
}

const agendaColorModeSource = sourceBetween(
  'const agendaPreferRoleCardColors = activeAgendaLaneRoleKeySet.size > 1;',
  'const getAgendaServiceAccent = useCallback',
);
if (!agendaColorModeSource.startsWith(
  'const agendaPreferRoleCardColors = activeAgendaLaneRoleKeySet.size > 1;',
)) {
  fail('la modalita colore Agenda deve usare il set mestieri delle corsie attive');
}

const serviceBadgeAccentSource = sourceBetween(
  'const getAgendaServiceBadgeAccent = useCallback',
  'const getAgendaServiceIdentityColor = useCallback',
);
if (!/preferRoleColor:\s*false/.test(serviceBadgeAccentSource)) {
  fail(
    'il tema del badge servizio deve continuare a risolvere il colore specifico del servizio',
  );
}

const serviceIdentityResolverSource = sourceBetween(
  'const getAgendaServiceIdentityColor = useCallback',
  'const getAgendaCustomerIdentityKey = useCallback',
);
if (
  !/hasCustomServiceColor[\s\S]*?return getAgendaServiceBadgeAccent\([\s\S]*?\)\.baseColor;/.test(
    serviceIdentityResolverSource,
  )
) {
  fail(
    'quando esiste una palette servizio, il trattino deve usare il baseColor dello stesso tema del frontend',
  );
}
if (!/getServiceColorIdentityKey\([\s\S]*?getStableServiceIdentityColor\(identityId\)/.test(serviceIdentityResolverSource)) {
  fail(
    'un servizio senza override deve usare il risolutore identita stabile condiviso',
  );
}
if (!/resolveAgendaColorSourceService\(matchedService\)/.test(serviceIdentityResolverSource)) {
  fail('i componenti derivati devono ereditare il colore del servizio sorgente');
}

const automaticColorSource = sourceBetween(
  'const applyAutomaticAgendaServiceColors = useCallback',
  'const canPlaceAppointmentAtSlot = useCallback',
);

if (!/disponibileOnline\?: boolean;/.test(automaticColorSource)) {
  fail('la strategia automatica deve ricevere lo stato online del servizio');
}

if (!onlineNonCompositionPredicate.test(automaticColorSource)) {
  fail(
    'la strategia automatica deve usare lo stesso filtro online/non-composizione della modalita Agenda',
  );
}

if (!/new Set\(\s*normalizedServices\s*\.map\(\(item\)\s*=>\s*normalizeRoleName\(item\.mestiereRichiesto\)\)/.test(automaticColorSource)) {
  fail('la strategia automatica deve derivare i mestieri dai servizi gia filtrati');
}

const multiRoleStart = automaticColorSource.indexOf(
  'if (distinctRoles.length > 1)',
);
if (multiRoleStart < 0) {
  fail('ramo automatico multi-mestiere non trovato');
}

const multiRoleSource = automaticColorSource.slice(multiRoleStart);
if (!automaticColorSource.includes('reconcileAutomaticServiceColorOverrides')) {
  fail(
    'la strategia deve mantenere anche in multi-mestiere gli accenti secondari dei servizi',
  );
}
if (!multiRoleSource.includes('reconcileAutomaticRoleColorOverrides')) {
  fail('il ramo multi-mestiere deve continuare ad assegnare i colori mestiere');
}

const renderAppointmentSource = sourceBetween(
  'const renderWeekAppointmentContent = useCallback',
  'const quickBookingEligibleOperatorIds = useMemo',
);

if (!/const serviceIdentityColor\s*=\s*getAgendaServiceIdentityColor\(/.test(renderAppointmentSource)) {
  fail('il trattino servizio deve essere risolto da getAgendaServiceIdentityColor');
}

const requiredAccentLayouts = [
  'weekAppointmentPremiumNativeInlineServiceAccent',
  'weekAppointmentPremiumMobileServiceAccent',
  'weekAppointmentPremiumWebReducedServiceAccent',
  'weekAppointmentPremiumWebEssentialServiceAccent',
  'weekAppointmentPremiumWebServiceAccent',
];

requiredAccentLayouts.forEach((styleName) => {
  const stylePattern = new RegExp(
    `styles\\.${styleName}[\\s\\S]{0,420}?backgroundColor:\\s*serviceIdentityColor`,
  );
  if (!stylePattern.test(renderAppointmentSource)) {
    fail(`il layout ${styleName} non usa il colore identita servizio`);
  }
});

const identityColorApplications =
  renderAppointmentSource.match(/backgroundColor:\s*serviceIdentityColor/g) ?? [];
if (identityColorApplications.length < 9) {
  fail(
    `non tutti i layout del trattino usano il risolutore condiviso (${identityColorApplications.length}/9)`,
  );
}

if (!renderAppointmentSource.includes('getAgendaServiceIdentityColor,')) {
  fail('il renderer deve reagire agli aggiornamenti del risolutore colore');
}

const getActiveAgendaRoles = (services, compositionLaunchers = []) =>
  new Set(
    [
      ...services.filter(
        (item) =>
          item.disponibileOnline !== false &&
          item.soloComposizione !== true &&
          !item.compositionId,
      ),
      ...compositionLaunchers,
    ]
      .map((item) => item.mestiereRichiesto.trim().toLowerCase())
      .filter(Boolean),
  );

const transitionCatalog = [
  {
    mestiereRichiesto: 'Hair Stylist',
    disponibileOnline: true,
    soloComposizione: false,
  },
  {
    mestiereRichiesto: 'Barber',
    disponibileOnline: false,
    soloComposizione: false,
  },
  {
    mestiereRichiesto: 'Nails',
    disponibileOnline: true,
    soloComposizione: true,
  },
];

if (getActiveAgendaRoles(transitionCatalog).size > 1) {
  fail('un mestiere offline o solo-composizione non deve rendere multi il salone');
}
transitionCatalog[1].disponibileOnline = true;
if (getActiveAgendaRoles(transitionCatalog).size <= 1) {
  fail('un secondo mestiere online deve rendere multi il salone');
}
transitionCatalog[1].disponibileOnline = false;
if (getActiveAgendaRoles(transitionCatalog).size > 1) {
  fail('archiviando il secondo mestiere il salone deve tornare mono');
}
if (
  getActiveAgendaRoles(transitionCatalog, [
    {
      mestiereRichiesto: 'Barber',
      disponibileOnline: false,
      soloComposizione: false,
    },
  ]).size <= 1
) {
  fail('una composizione attiva deve continuare a rendere visibile il proprio mestiere');
}

console.log('Contratti mono/multi e trattino colori servizi Agenda verificati.');

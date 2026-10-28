import assert from 'node:assert/strict';
import {
  getServiceColorIdentityKey,
  getStableServiceIdentityColor,
  reconcileAutomaticRoleColorOverrides,
  reconcileAutomaticServiceColorOverrides,
  resolveServiceColorSource,
} from '../src/lib/service-accents';

const baseServices = [
  {
    id: 'service-piega',
    nome: 'Piega',
    mestiereRichiesto: 'Hair Stylist',
    disponibileOnline: true,
  },
  {
    id: 'service-colore',
    nome: 'Colore',
    mestiereRichiesto: 'Hair Stylist',
    disponibileOnline: true,
  },
];

const mapSignature = (value: Record<string, string>) =>
  JSON.stringify(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );

const initialServiceColors = reconcileAutomaticServiceColorOverrides({
  services: baseServices,
  overrides: {},
});
const reorderedServiceColors = reconcileAutomaticServiceColorOverrides({
  services: [...baseServices].reverse(),
  overrides: {},
});
assert.equal(
  mapSignature(initialServiceColors),
  mapSignature(reorderedServiceColors),
  "l'ordine del catalogo non deve cambiare l'assegnazione iniziale",
);
assert.notEqual(
  initialServiceColors.piega,
  initialServiceColors.colore,
  'in mono-mestiere i servizi devono restare distinguibili',
);

const expandedServices = [
  ...baseServices,
  {
    id: 'service-taglio',
    nome: 'Taglio',
    mestiereRichiesto: 'Hair Stylist',
    disponibileOnline: true,
  },
];
const expandedColors = reconcileAutomaticServiceColorOverrides({
  services: expandedServices,
  overrides: initialServiceColors,
});
assert.equal(expandedColors.piega, initialServiceColors.piega);
assert.equal(expandedColors.colore, initialServiceColors.colore);
assert.equal(
  new Set([expandedColors.piega, expandedColors.colore, expandedColors.taglio])
    .size,
  3,
  'un nuovo servizio non deve ricolorare quelli esistenti',
);

const archivedColors = reconcileAutomaticServiceColorOverrides({
  services: expandedServices.map((service) =>
    service.id === 'service-colore'
      ? { ...service, disponibileOnline: false }
      : service,
  ),
  overrides: expandedColors,
});
assert.equal(
  archivedColors.colore,
  expandedColors.colore,
  "l'archivio deve conservare il colore per il ripristino e lo storico",
);
const restoredColors = reconcileAutomaticServiceColorOverrides({
  services: expandedServices,
  overrides: archivedColors,
});
assert.equal(restoredColors.colore, expandedColors.colore);

const multiRoleServices = [
  ...expandedServices,
  {
    id: 'service-barba',
    nome: 'Barba',
    mestiereRichiesto: 'Barber',
    disponibileOnline: true,
  },
];
const multiServiceColors = reconcileAutomaticServiceColorOverrides({
  services: multiRoleServices,
  overrides: restoredColors,
});
assert.equal(multiServiceColors.piega, restoredColors.piega);
assert.ok(
  multiServiceColors.barba,
  "in multi-mestiere deve esistere anche l'accento secondario del servizio",
);

const roleColors = reconcileAutomaticRoleColorOverrides({
  services: multiRoleServices,
  overrides: {},
});
const reorderedRoleColors = reconcileAutomaticRoleColorOverrides({
  services: [...multiRoleServices].reverse(),
  overrides: {},
});
assert.equal(mapSignature(roleColors), mapSignature(reorderedRoleColors));
assert.notEqual(
  roleColors['hair stylist'],
  roleColors.barber,
  'mestieri attivi diversi devono restare distinguibili',
);

const lineageServices = [
  ...baseServices,
  {
    id: 'component-initial',
    nome: 'Colore iniziale',
    mestiereRichiesto: 'Hair Stylist',
    compositionSourceServiceId: 'service-colore',
  },
  {
    id: 'component-final',
    nome: 'Colore finale',
    mestiereRichiesto: 'Hair Stylist',
    compositionSourceServiceId: 'component-initial',
  },
];
const root = lineageServices[1];
const derived = lineageServices[3];
assert.equal(
  resolveServiceColorSource({ service: derived, services: lineageServices }).id,
  root.id,
  'una catena di componenti deve risalire al servizio radice',
);
assert.equal(
  getServiceColorIdentityKey({ service: derived, services: lineageServices }),
  getServiceColorIdentityKey({ service: root, services: lineageServices }),
);
assert.equal(
  getStableServiceIdentityColor(
    getServiceColorIdentityKey({ service: derived, services: lineageServices }),
  ),
  getStableServiceIdentityColor(
    getServiceColorIdentityKey({ service: root, services: lineageServices }),
  ),
  'card e trattino del componente devono condividere il colore sorgente',
);

const orphanComponent = {
  id: 'component-orphan',
  nome: 'Componente storico',
  mestiereRichiesto: 'Hair Stylist',
  compositionSourceServiceId: 'deleted-source-service',
};
assert.equal(
  getServiceColorIdentityKey({
    service: orphanComponent,
    services: [orphanComponent],
  }),
  'deleted-source-service',
  "un componente orfano deve conservare l'identita cromatica della sorgente eliminata",
);

console.log('Unified service, role and composition color contracts: OK');

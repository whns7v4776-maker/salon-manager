import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { reconcileAutomaticServiceColorOverrides } from '../src/lib/service-accents.ts';

const monoServices = [
  {
    id: 'service-piega',
    nome: 'Piega',
    mestiereRichiesto: 'Hair Stylist',
    disponibileOnline: true,
  },
  {
    id: 'service-taglio',
    nome: 'Taglio',
    mestiereRichiesto: 'Hair Stylist',
    disponibileOnline: true,
  },
  {
    id: 'service-balayage',
    nome: 'Balayage',
    mestiereRichiesto: 'Hair Stylist',
    disponibileOnline: true,
  },
  {
    id: 'service-colore',
    nome: 'Colore',
    mestiereRichiesto: 'Hair Stylist',
    disponibileOnline: true,
  },
  {
    id: 'service-offline',
    nome: 'Offline storico',
    mestiereRichiesto: 'Barber',
    disponibileOnline: false,
  },
  {
    id: 'service-composition-only',
    nome: 'Tecnico composizione',
    mestiereRichiesto: 'Barber',
    disponibileOnline: true,
    soloComposizione: true,
  },
];

const flattenedOverrides = {
  piega: '#69B3FF',
  taglio: '#69B3FF',
  balayage: '#59DAD0',
  colore: '#69B3FF',
  'offline storico': '#F784B8',
};

const repairedMonoOverrides = reconcileAutomaticServiceColorOverrides({
  services: monoServices,
  overrides: flattenedOverrides,
});
const activeMonoColors = ['piega', 'taglio', 'balayage', 'colore'].map(
  (key) => repairedMonoOverrides[key]?.toLowerCase(),
);
assert.equal(
  new Set(activeMonoColors).size,
  activeMonoColors.length,
  'Mono-mestiere deve assegnare un colore distinto a ogni servizio online.',
);
assert.equal(
  repairedMonoOverrides.balayage,
  '#59DAD0',
  'Un colore gia unico non deve essere riscritto.',
);
assert.equal(
  repairedMonoOverrides['offline storico'],
  '#F784B8',
  'I servizi archiviati non devono influenzare o perdere la palette.',
);
assert.deepEqual(
  reconcileAutomaticServiceColorOverrides({
    services: monoServices,
    overrides: repairedMonoOverrides,
  }),
  repairedMonoOverrides,
  'La riconciliazione mono-mestiere deve essere stabile e idempotente.',
);

const restoredMultiRoleServices = monoServices.map((service) =>
  service.id === 'service-offline'
    ? { ...service, disponibileOnline: true }
    : service,
);
const repairedMultiRoleOverrides = reconcileAutomaticServiceColorOverrides({
  services: restoredMultiRoleServices,
  overrides: repairedMonoOverrides,
});
const activeMultiRoleColors = restoredMultiRoleServices
  .filter(
    (service) =>
      service.disponibileOnline !== false && service.soloComposizione !== true,
  )
  .map(
    (service) =>
      repairedMultiRoleOverrides[service.nome.trim().toLowerCase()]?.toLowerCase(),
  );
assert.equal(
  new Set(activeMultiRoleColors).size,
  activeMultiRoleColors.length,
  'Anche con piu mestieri ogni servizio online deve mantenere un accento distinto.',
);
assert.strictEqual(
  reconcileAutomaticServiceColorOverrides({
    services: restoredMultiRoleServices,
    overrides: repairedMultiRoleOverrides,
  }),
  repairedMultiRoleOverrides,
  'La palette multi-mestiere riparata deve restare stabile e idempotente.',
);

const clientScreenSource = fs.readFileSync(
  path.resolve('app/cliente-screen.tsx'),
  'utf8',
);
assert.match(
  clientScreenSource,
  /const frontendPreferRoleCardColors = useMemo\([\s\S]*?service\.disponibileOnline !== false &&[\s\S]*?service\.soloComposizione !== true[\s\S]*?\.size > 1/,
  'Il frontend cliente deve derivare la modalita dai soli servizi online reali, escludendo quelli tecnici di composizione.',
);

console.log('Contratti transizione automatica colori mono/multi verificati.');

import assert from 'node:assert/strict';
import {
  buildCustomerIdentityColorMap,
  getCustomerIdentityColor,
} from '../src/lib/customer-identity-colors';

const stableCustomers = [
  { identityKey: 'id:edoardo', displayName: 'Edoardo Nardi' },
  { identityKey: 'id:francesco', displayName: 'Francesco Rossi' },
  { identityKey: 'id:sara', displayName: 'Sara Bianchi' },
];
const ghostCustomer = {
  identityKey: 'id:deleted-ludovica',
  displayName: 'Ludovica Viola',
};

const baseline = buildCustomerIdentityColorMap(stableCustomers);
const withGhost = buildCustomerIdentityColorMap([
  ghostCustomer,
  ...stableCustomers.slice().reverse(),
]);
const afterRemoval = buildCustomerIdentityColorMap(stableCustomers.slice().reverse());

stableCustomers.forEach(({ identityKey }) => {
  assert.equal(
    withGhost.get(identityKey),
    baseline.get(identityKey),
    `${identityKey} must not change color when a ghost customer appears.`,
  );
  assert.equal(
    afterRemoval.get(identityKey),
    baseline.get(identityKey),
    `${identityKey} must not change color after another customer is removed or reordered.`,
  );
});

assert.equal(
  getCustomerIdentityColor('id:edoardo', 'Edoardo Nardi'),
  getCustomerIdentityColor('id:edoardo', 'Edoardo Verdi'),
  'A name correction must not recolor the same canonical customer identity.',
);
assert.notEqual(
  getCustomerIdentityColor('id:mario-rossi-one', 'Mario Rossi'),
  getCustomerIdentityColor('id:mario-rossi-two', 'Marco Riva'),
  'Matching initials must not force distinct customers onto the same color.',
);

console.log('Customer identity color stability contracts: OK');

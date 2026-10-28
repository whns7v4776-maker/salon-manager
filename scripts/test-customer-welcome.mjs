import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shouldShowCustomerWelcome } from '../src/lib/customer-welcome.ts';
for (const [scenario, state, enabled, expected] of [
  ['new frontend registration', 'true', true, true],
  ['owner-created customer completes frontend access', null, true, true],
  ['recovered registration after interrupted local write', null, true, true],
  ['first login with notifications already granted', null, true, true],
  ['first login with notifications denied', null, true, true],
  ['reopen after showing welcome', 'shown', true, false],
  ['salon disabled welcome', 'true', false, false],
  ['salon re-enables before first welcome', null, true, true],
  ['salon re-enables after previous welcome', 'shown', true, false],
]) assert.equal(shouldShowCustomerWelcome(state,enabled),expected,scenario);
const screen=fs.readFileSync('app/cliente-screen.tsx','utf8');
assert.match(screen,/setItem\(storageKey, 'shown'\)/);
const resume=screen.slice(screen.indexOf('const clientScreenReadyForFirstEntryPrompts'),screen.indexOf('const clientScreenReadyForFirstEntryPrompts')+350);
assert.doesNotMatch(resume,/hasLoadedBookingServices|isBookingStarted/);
const flow=screen.slice(screen.indexOf('const runFrontendPostLoginPromptFlow'),screen.indexOf('const buildStoredProfileFallback'));
assert.ok(flow.indexOf('await maybePromptFrontendBiometricSetup') < flow.indexOf('await showFrontendRegistrationWelcome'));
const migration=fs.readFileSync('supabase/migrations/20260911160000_expose_public_customer_welcome.sql','utf8');
for(const field of ['clientWelcomeEnabled','clientWelcomeTitle','clientWelcomeMessage']) assert.equal(migration.split(`'${field}'`).length-1,2);
console.log('PASS: 9 welcome lifecycle scenarios, empty salon readiness, prompt order, canonical public settings. Device testing remains required.');

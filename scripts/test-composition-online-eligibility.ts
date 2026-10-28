import assert from 'node:assert/strict';
import {getCompositionOnlineEligibility as eligibility} from '../src/lib/composition-online-eligibility';

const online={disponibileOnline:true};
const offline={disponibileOnline:false};
const phased={disponibileOnline:true,phaseConfig:{version:1,mode:'phased',initialDurationMinutes:15,processingDurationMinutes:30,finalPhaseEnabled:false,finalDurationMinutes:0}};
assert.equal(eligibility([online,online]).online,true);
assert.equal(eligibility([{}]).online,true); // Matches existing availableOnline !== false logic.
assert.equal(eligibility([offline]).online,false);
assert.equal(eligibility([phased]).online,false);
assert.equal(eligibility([online,online],[0,15]).online,false);
assert.equal(eligibility([online,online],[0,0]).online,true);
assert.equal(eligibility([offline,phased],[15]).reasons.length,3);
// Private-only is a list visibility distinction, not an online composition restriction.
const privatePhase={...online,soloComposizione:true};
assert.equal(eligibility([privatePhase,online]).online,true);
console.log('Composition online eligibility: online/offline, phased, pauses, private phase and shortcut cases passed');

/* The real success notification must follow persistence and payment checks, never a preflight path. */
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const source=fs.readFileSync('app/cliente-screen.tsx','utf8');
const ast=ts.createSourceFile('cliente-screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let request;function walk(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='completeFrontendRequest')request=node.initializer;ts.forEachChild(node,walk);}walk(ast);assert.ok(request);
const body=request.body.getText(ast);
const success=body.indexOf("bookingDialogs.notice('Appuntamento inviato correttamente'");
assert.ok(success>body.indexOf('let persistedRequest:'),'Only a persisted request may produce success');
assert.ok(success>body.indexOf('isUnsubmittedBookingPaymentHold(persistedRequest)'),'Unsubmitted holds must return before success');
assert.ok(success>body.indexOf('setActiveBookingPaymentHold('),'Incomplete checkout is handled first');
assert.ok(success>body.lastIndexOf('if (!canOpenCheckout()) return;'),'A replaced customer session cannot show stale success');
assert.ok(success>body.indexOf('setUltimaRichiesta({'));
assert.ok(success<body.indexOf('resetBookingAutoScrollRefs();'),'The success popup is scheduled before returning to booking');
assert.match(body.slice(success,body.indexOf('resetBookingAutoScrollRefs();')),/persistedRequest\.stato === 'Accettata'[\s\S]*Ti avviseremo quando verrà confermata/,'Received and confirmed appointments have distinct messages');
assert.match(source,/bookingDialogs\.confirm\(title, message\)/,'The native family/friend confirmation uses the themed decision dialog');
assert.match(source,/if \(!confirmed \|\| !isBookingSessionCurrent\(\)\) return;/,'Cancel/back must still stop the actual booking submission');
assert.match(source,/<ClientBookingDialog notice=\{bookingDialogs\.current\} onDecision=\{bookingDialogs\.settle\}/);
console.log('PASS: success follows authoritative persistence/payment gates; native family confirmation and Cancel preserve booking guards.');

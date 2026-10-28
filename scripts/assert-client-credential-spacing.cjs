const assert = require('node:assert/strict');
const fs = require('node:fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

function readStyle(file, name) {
  const ast = parser.parse(fs.readFileSync(file, 'utf8'), {
    sourceType: 'module', plugins: ['typescript', 'jsx'],
  });
  let result;
  traverse(ast, {
    ObjectProperty(path) {
      if (path.node.key.name !== name || path.node.value.type !== 'ObjectExpression') return;
      result = Object.fromEntries(path.node.value.properties
        .filter(p => p.type === 'ObjectProperty' && /^(String|Numeric)Literal$/.test(p.value.type))
        .map(p => [p.key.name, p.value.value]));
    },
  });
  assert.ok(result, `Missing style ${name}`);
  return result;
}

const landing = 'app/index.tsx';
const recovery = 'app/cliente-password.tsx';
const plain = readStyle(landing, 'quickAccessInput');
const recoveryPlain = readStyle(recovery, 'input');
for (const style of [plain, recoveryPlain]) {
  assert.equal(style.letterSpacing, 0, 'Plain input must explicitly clear OTP spacing');
  assert.equal(style.fontStyle, 'normal');
}
assert.equal(plain.fontWeight, '400');
const masked = { ...plain, ...readStyle(landing, 'biometricCredentialMaskInput') };
assert.equal(masked.letterSpacing, 1.5, 'Biometric mask keeps its deliberate spacing');
assert.equal({ ...masked, ...plain }.letterSpacing, 0, 'Returning to credentials clears mask spacing');
const otp = { ...recoveryPlain, ...readStyle(recovery, 'otpInput') };
assert.equal(otp.letterSpacing, 8, 'Recovery code stays readable');
assert.equal({ ...otp, ...plain }.letterSpacing, 0, 'Recovery-to-login restores normal spacing');
console.log('PASS client credential typography: explicit reset and OTP/biometric overrides');

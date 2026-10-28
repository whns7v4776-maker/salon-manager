const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
function load(file) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source, {exports, URL, require: name => load(path.resolve(path.dirname(file), name + '.ts'))});
  return exports;
}
const {extractSalonCodeFromScan: parse} = load(path.resolve('src/lib/salon-qr-code.ts'));
for (const [input, expected] of [
  ['123456', '123456'],
  [' SALONPRO-LCOM ', 'salonpro-lcom'],
  ['https://salon.example/join/salonpro-lcom?entry=client', 'salonpro-lcom'],
  ['salonpro://join/salonpro-lcom', 'salonpro-lcom'],
  ['https://salon.example/?salon=salonpro-lcom', 'salonpro-lcom'],
  ['https://salon.example/?code=123456', '123456'],
  ['', ''], ['https://example.com/unrelated', ''], ['not a salon code', ''],
]) assert.equal(parse(input), expected, input);
console.log('QR: 9 casi superati');

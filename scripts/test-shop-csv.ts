import assert from "node:assert/strict";
import { parseShopCsv } from "../src/lib/shop-inventory";
const rows = parseShopCsv(
  '\uFEFFnome;prezzo;costo;barcode;variante\n"Shampoo; delicato";"12,50";4;0012345;"Formato\nviaggio"',
);
assert.equal(rows[0].name, "Shampoo; delicato");
assert.equal(rows[0].price_cents, 1250);
assert.equal(rows[0].barcode, "0012345");
assert.equal(rows[0].variant, "Formato\nviaggio");
assert.throws(
  () => parseShopCsv("nome;prezzo;sku\nUno;5;ABC\nDue;7;ABC"),
  /duplicato/,
);
assert.throws(() => parseShopCsv("nome;prezzo\nUno;no"), /Riga 2/);
assert.throws(() => parseShopCsv("nome;prezzo\nUno;"), /Riga 2/);
assert.throws(() => parseShopCsv('nome;prezzo\n"Uno;2'), /Virgolette/);
assert.equal(
  parseShopCsv('nome,prezzo\n"A ""speciale""",10')[0].name,
  'A "speciale"',
);
console.log("CSV parsing and validation passed");

// node tests/frequencies.test.mjs – Umrechnung der Quellwerte in Kanalnamen
import assert from 'node:assert';
import { channel, aspService, sameFreq } from '../tools/build-frequencies.mjs';
const cases = [
  ['118.1', '118.100', ''], ['118.100', '118.100', ''], ['122.255', '122.255', ''], ['121.03', '121.030', 'gerundet'],
  ['118.6083', '118.610', 'echter'], ['118.6', '118.600', ''], ['132.5083', '132.510', 'echter'], ['132.5167', '132.515', 'echter'],
  ['132.833', '132.835', 'echter'], ['121.902', null, 'kein gültiger'], ['117.975', null, 'ausserhalb'], ['137.000', null, 'ausserhalb'], ['abc', null, 'kein Wert'], ['', null, 'leer']
];
for (const [raw, ch, note] of cases) {
  const r = channel(raw);
  assert.strictEqual(r.ch, ch, raw + ' → ' + JSON.stringify(r));
  if (note) assert.ok(r.note.includes(note), raw + ' Hinweis: ' + r.note); else assert.strictEqual(r.note, '', raw + ' Hinweis: ' + r.note);
}
console.log(cases.length + ' Umrechnungen geprüft');
const svc = [['ALPS RADAR', 26, 'RDR', 'name'], ['ZUERICH TERMINAL', 7, 'APP', 'name'], ['BALE INFORMATION', 7, 'INFO', 'name'], ['EMMEN TOWER', 7, 'TWR', 'name'],
  ['', 4, 'TWR', 'type'], ['', 7, 'APP', 'type'], ['', 33, 'INFO', 'type'], ['', 27, 'ACC', 'type'], ['', 21, 'GLD', 'type'], ['', 99, 'OTH', 'type'], ['LANGEN INFO', 6, 'INFO', 'name']];
for (const [n, t, s, by] of svc) { const r = aspService(n, t); assert.deepStrictEqual(r, { s, by }, n + '/' + t + ' → ' + JSON.stringify(r)); }
console.log(svc.length + ' Dienstableitungen geprüft');

const same = [['123.550', '123.555', true], ['123.555', '123.550', true], ['125.725', '125.730', true], ['121.030', '121.030', true], ['123.555', '123.560', false], ['123.560', '123.565', false], ['123.550', '123.560', false], [null, '123.550', false]];
for (const [a, b, r] of same) assert.strictEqual(sameFreq(a, b), r, a + ' ~ ' + b);
console.log(same.length + ' Rastervergleiche geprüft');

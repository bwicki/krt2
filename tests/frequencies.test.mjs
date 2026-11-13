// node tests/frequencies.test.mjs – Umrechnung der Quellwerte in Kanalnamen
import assert from 'node:assert';
import { channel } from '../tools/build-frequencies.mjs';
const cases = [
  ['118.1', '118.100', ''], ['118.100', '118.100', ''], ['122.255', '122.255', ''], ['121.03', '121.030', 'gerundet'],
  ['118.6083', '118.610', 'echter'], ['118.6', '118.600', ''], ['132.5083', '132.510', 'echter'], ['132.5167', '132.515', 'echter'],
  ['121.902', null, 'kein gültiger'], ['117.975', null, 'ausserhalb'], ['137.000', null, 'ausserhalb'], ['abc', null, 'kein Wert'], ['', null, 'leer']
];
for (const [raw, ch, note] of cases) {
  const r = channel(raw);
  assert.strictEqual(r.ch, ch, raw + ' → ' + JSON.stringify(r));
  if (note) assert.ok(r.note.includes(note), raw + ' Hinweis: ' + r.note); else assert.strictEqual(r.note, '', raw + ' Hinweis: ' + r.note);
}
console.log(cases.length + ' Umrechnungen geprüft');

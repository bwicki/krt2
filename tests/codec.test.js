// node tests/codec.test.js – prüft den Befehlsaufbau gegen die Beispiele der Protokollbeschreibung Rev. 003
// und gegen den Zerleger (Rundlauf bauen → zerlegen).
'use strict';
const assert = require('assert');
const C = require('../src/krt2codec.js');
const D = require('../src/krt2decoder.js');
const hex = D.hex;
let n = 0;
function t(name, fn) { fn(); n++; console.log('ok  ' + name); }

t('Beispiel 2.5 (Z, 118.900 «ORF APP», Platz 34)', () => {
  assert.strictEqual(hex(C.buildZ('118.900', 'ORF APP', 34)), '02 5A 76 B4 4F 52 46 20 41 50 50 20 22 C2');
});
t('Beispiel 2.4 (R, 123.000 «N52 CTAF»)', () => {
  assert.strictEqual(hex(C.buildR('123.000', 'N52 CTAF')), '02 52 7B 00 4E 35 32 20 43 54 41 46 7B');
});
t('Beispiel 2.3 (U, 119.650 «GGG ATIS», Prüfsumme F5)', () => {
  assert.strictEqual(hex(C.buildU('119.650', 'GGG ATIS')), '02 55 77 82 47 47 47 20 41 54 49 53 F5');
});
t('W und w', () => {
  assert.strictEqual(hex(C.buildW()), '02 57');
  assert.strictEqual(hex(C.buildWPrev()), '02 77');
});
t('Kanalnamen 8.33/25 kHz', () => {
  assert.deepStrictEqual([C.encodeFreq('121.500').ch, C.encodeFreq('121.500').spacing], [100, '25 kHz']);
  assert.deepStrictEqual([C.encodeFreq('122.255').ch, C.encodeFreq('122.255').spacing], [51, '8.33 kHz']);
  assert.strictEqual(C.encodeFreq('132.505').ok, true);
  assert.strictEqual(C.encodeFreq('118').display, '118.000');
  assert.strictEqual(C.encodeFreq('118.0').display, '118.000');
  assert.strictEqual(C.encodeFreq('136.990').ch, 198);
});
t('ungültige Werte werden abgelehnt', () => {
  for (const v of ['121.020', '121.045', '121.902', '117.975', '137.000', '12.5', 'abc', '']) assert.strictEqual(C.encodeFreq(v).ok, false, v);
  assert.throws(() => C.buildZ('121.500', 'X', 100));
  assert.throws(() => C.buildZ('121.020', 'X', 1));
});
t('Kurznamen', () => {
  assert.strictEqual(C.normalizeName('Zürich').name, 'ZUERICH ');
  assert.strictEqual(C.normalizeName('EMERGENCY').ok, false);
  assert.strictEqual(C.normalizeName('EMERGENCY').trimmed, 'EMERGENC');
  assert.strictEqual(C.normalizeName('LSZH/TWR').ok, false);
  assert.strictEqual(C.normalizeName('MIN-8').ok, true);
  assert.strictEqual(C.normalizeName('TEST 12', false).ok, false);
  assert.strictEqual(C.normalizeName('TEST 12').ok, true);
});
t('Rundlauf Z → Zerleger', () => {
  const dec = new D.KRT2Decoder();
  const ev = dec.feed(C.buildZ('122.255', 'BALLOON', 0), 0);
  assert.strictEqual(ev.length, 1);
  assert.strictEqual(ev[0].name, 'Z');
  assert.strictEqual(ev[0].ok, true);
  assert.strictEqual(ev[0].freq.display, '122.255');
  assert.strictEqual(ev[0].station, 'BALLOON ');
  assert.strictEqual(ev[0].bytes[12], 0);
});
t('Rundlauf R → Zerleger (alle 100 Plätze-Frequenzen eines Musters)', () => {
  const dec = new D.KRT2Decoder();
  for (const f of ['118.000', '121.500', '124.700', '132.505', '136.990']) {
    const ev = dec.feed(C.buildR(f, 'X'), 0);
    assert.strictEqual(ev[0].freq.display, f);
    assert.strictEqual(ev[0].cksOk, true);
  }
});
console.log(n + ' Prüfungen bestanden');

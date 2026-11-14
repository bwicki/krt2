// node tests/model.test.js – Modell: Kurznamen, Belegung, Verschieben, Prüfung, Speichern/Laden
const assert = require('node:assert');
const M = require('../src/model.js');
const S = require('../src/sample.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

// Kurznamen (0.4.3): Ort + Leerzeichen + kurzes Dienstkürzel, höchstens 8 Zeichen
eq(M.shortName({ name: 'Birrfeld', svc: 'AFIS' }, 'kurz'), 'BRFLD AF', 'erster Buchstabe und Konsonanten, so viele, wie Platz ist');
eq(M.shortName({ name: 'Zürich', svc: 'TWR' }, 'kurz'), 'ZURICH T', 'ganzer Name, wenn er passt');
eq(M.shortName({ name: 'Zürich', svc: 'FIS' }, 'kurz'), 'ZURICH F');
eq(M.shortName({ name: 'Zürich', svc: 'INFO' }, 'kurz'), 'ZURICH I');
eq(M.shortName({ name: 'Zürich', qual: 'E', svc: 'RDR' }, 'kurz'), 'ZRCH E R', 'Zusatz mit Leerzeichen');
eq(M.shortName({ name: 'Bern-Belp', svc: 'APP' }, 'kurz'), 'BERN APP', 'Teil vor dem Bindestrich');
eq(M.shortName({ name: 'Grenchen', svc: 'RDO' }, 'kurz'), 'GRNCH RD');
eq(M.shortName({ name: 'Lugano', svc: 'ATIS' }, 'kurz'), 'LUGAN AT', 'Vokale von hinten weg');
eq(M.shortName({ name: 'Genève', svc: 'DEP' }, 'kurz'), 'GENEVE D');
eq(M.shortName({ name: 'Neuchâtel', svc: 'ARR' }, 'kurz'), 'NCHTL AR');
eq(M.shortName({ name: 'Bern', svc: 'RDR' }, 'kurz'), 'BERN R');
eq(M.shortName({ name: 'St. Gallen-Altenrhein', svc: 'AFIS' }, 'kurz'), 'STGLN AF', 'jeder Wortanfang zählt');
eq(M.shortName({ name: 'Zürich', icao: 'LSZH', svc: 'TWR' }, 'icao'), 'LSZH T');
eq(M.shortName({ name: 'Zürich', icao: 'LSZH', svc: 'ATIS' }, 'icao'), 'LSZH AT', 'immer Leerzeichen vor dem Dienst');
eq(M.shortName({ name: 'Birrfeld', icao: 'LSZF', svc: 'AFIS' }, 'icao'), 'LSZF AF');
eq(M.shortName({ name: 'Grenchen', icao: 'LSZG', svc: 'RDO' }, 'icao'), 'LSZG RD');
eq(M.shortName({ name: 'Payerne', icao: 'LSMP', svc: 'UCOM' }, 'icao'), 'PRN UNIC', 'ICAO passt nicht neben vierstelligen Dienst → Kürzel');
eq(M.shortName({ loc: 'ZRH', svc: 'VOLMET' }, 'kurz'), 'Z VOLMET', 'Ortsteil kürzen, nie den Dienst');
eq(M.shortName({ name: 'Zürich', icao: '', svc: 'TWR' }, 'icao'), 'ZURICH T', 'ohne ICAO-Code bleibt das Kürzel');
eq(M.shortName({ loc: 'BIR', svc: 'AFIS' }, 'kurz'), 'BIR AF', 'ohne Namen das gespeicherte Kürzel');
eq(M.locCode('Dübendorf', 4), 'DBND'); eq(M.locCode('Saanen', 5), 'SANEN', 'Doppelte weg'); eq(M.locCode('Hausen am Albis', 6), 'HAUSNA', 'Füllwort weg, Wortanfang bleibt');
eq(M.svcShort('FIS'), 'INFO', 'Klartext behält die lange Form');
eq(M.kurzLoc({ dienst: 'AFIS', ort: { name: 'Birrfeld', icao: 'LSZF' }, kurzModus: 'icao' }), 'BRFLD');
{ // einmalig: ICAO wird Normalfall, wo es einen gibt
  const old = JSON.parse(M.toJSON(S.sampleConfig())); delete old.icaoDefault; old.settings.adLoc = 'kurz';
  old.eintraege.forEach(e => { if (e.kurzModus === 'icao') e.kurzModus = 'kurz'; });
  const icaoE = old.eintraege.find(e => e.ort && e.ort.icao === 'LSZF'); icaoE.kurzModus = 'kurz';
  let c = M.fromJSON(old);
  eq([c.settings.adLoc, c.icaoDefault, c.eintraege.find(e => e.id === icaoE.id).kurzModus], ['icao', true, 'icao']);
  eq(M.entryShort(c.eintraege.find(e => e.id === icaoE.id)), 'LSZF RD');
  c.settings.adLoc = 'kurz'; c.eintraege.find(e => e.id === icaoE.id).kurzModus = 'kurz'; c = M.fromJSON(M.toJSON(c));
  eq([c.settings.adLoc, c.eintraege.find(e => e.id === icaoE.id).kurzModus], ['kurz', 'kurz'], 'danach bleibt die eigene Wahl');
}

// Belegung: 00 fest, Blöcke lückenlos ab 01, frei bis 98, 99 Notfrequenz
const cfg = S.sampleConfig();
let L = M.layout(cfg);
eq(L.slots.length, 100);
eq([L.slots[0].kind, L.slots[0].ch, L.slots[0].kurz], ['fixed', '122.255', 'BALLOON']);
eq([L.slots[99].kind, L.slots[99].ch, L.slots[99].kurz], ['fixed', '121.500', 'EMERGENC']);
ok(L.slots.slice(1, L.freeFrom).every(s => s.kind === 'entry'), 'Einträge lückenlos ab 01');
ok(L.slots.slice(L.freeFrom, 99).every(s => s.kind === 'free' && s.ch === '118.000' && s.kurz === 'FREE'), 'frei nur am Ende');
eq(L.ranges.map(r => r.name), ['INFO', 'APP/TWR', 'RADAR']);
for (let i = 1; i < L.ranges.length; i++) eq(L.ranges[i].from, L.ranges[i - 1].to + 1, 'Blöcke grenzen aneinander');
ok(L.notPlaced.some(x => x.why === 'blockAus' && x.e.dienst === 'GND'), 'GROUND ausgeschaltet → nicht aufgenommen');
ok(!Object.values(L.slotOf).includes(undefined));
const win = cfg.eintraege.find(e => e.klar === 'Winterthur AD');
ok(L.slotOf[win.id] == null, 'abgewählter Eintrag belegt keinen Platz');
eq(L.slots[1].kurz, 'ZURICH F', 'INFO-Block nach Distanz: Zürich FIS (0 km) zuerst');

// 00 freigeben → Einträge ab 00
cfg.fixed.p00.on = false; L = M.layout(cfg); eq(L.slots[0].kind, 'entry'); cfg.fixed.p00.on = true;

// Höchstzahl je Block
const info = cfg.bloecke.find(b => b.name === 'INFO'); info.max = 2; L = M.layout(cfg);
eq(L.ranges[0].to - L.ranges[0].from + 1, 2); ok(L.notPlaced.some(x => x.why === 'max')); info.max = null;

// Überlauf: mehr als 98 Einträge
const big = M.defaultConfig();
for (let i = 0; i < 110; i++) M.addEntry(big, { ch: '119.' + String(i * 5 % 1000).padStart(3, '0'), dienst: 'APP', kurz: 'X' + i, kurzModus: 'frei' });
L = M.layout(big); eq(L.freeFrom, 99); eq(L.notPlaced.filter(x => x.why === 'voll').length, 110 - 98); eq(L.slots[99].ch, '121.500');

// Verschieben im Block und über die Blockgrenze
const c2 = S.sampleConfig();
const apps = M.entriesOf(c2, 'b-apptwr'); const first = apps[0];
ok(M.moveEntry(c2, first.id, 1)); eq(M.entriesOf(c2, 'b-apptwr')[1].id, first.id);
ok(M.moveEntry(c2, first.id, -1)); ok(M.moveEntry(c2, first.id, -1)); eq(first.block, 'b-info', 'über die Grenze in den vorigen Block');
eq(M.entriesOf(c2, 'b-info').slice(-1)[0].id, first.id, 'am Ende des vorigen Blocks');
ok(M.moveTo(c2, first.id, 'b-radar', 0)); eq(M.entriesOf(c2, 'b-radar')[0].id, first.id);
eq(M.entriesOf(c2, 'b-info').map(e => e.pos), M.entriesOf(c2, 'b-info').map((_, i) => i), 'Quellblock neu nummeriert');

// Prüfung
const c3 = S.sampleConfig();
let R = M.check(c3); ok(R.canProgram, 'Beispiel ohne Rotes'); ok(R.count.y > 0, 'Gelbes vorhanden (eine Quelle)');
const e3 = c3.eintraege[0]; e3.ch = '121.902'; R = M.check(c3); ok(!R.canProgram); ok(R.byEntry[e3.id].some(i => i.code === 'freq'));
e3.ch = '124.700'; e3.kurzModus = 'frei'; e3.kurz = 'ZURICH INFO'; R = M.check(c3); ok(R.byEntry[e3.id].some(i => i.code === 'nameLang'));
e3.kurz = 'LSZH/TWR'; R = M.check(c3); ok(R.byEntry[e3.id].some(i => i.code === 'nameZeichen'));
e3.kurz = 'ZRH INFO'; e3.vertrauen = 'r'; R = M.check(c3); ok(!R.canProgram, 'Widerspruch sperrt');
e3.bestaetigt = true; R = M.check(c3); ok(R.canProgram, 'bewusst bestätigt gibt frei');
const dup = M.addEntry(c3, { ch: '124.700', dienst: 'INFO', kurz: 'DUP', kurzModus: 'frei' }); R = M.check(c3); ok(R.byEntry[dup.id].some(i => i.code === 'doppelt'));
c3.settings.free.ch = '118.002'; R = M.check(c3); ok(R.fixed.some(i => i.key === 'free'));

// Gerätebild und Speichern/Laden
const D = M.deviceSlots(cfg); eq(D.length, 100); ok(D.every(d => d.name.length === 8)); eq(D[0].name, 'BALLOON ');
const back = M.fromJSON(M.toJSON(cfg)); eq(M.deviceSlots(back), D, 'Rundlauf JSON');
assert.throws(() => M.fromJSON('{"a":1}')); n++;
const csv = M.toCSV(cfg); eq(csv.split('\r\n').length, 102); ok(csv.startsWith('Platz;Frequenz;Kurzname'));
// Einfügen nach dem Eintrag, auf dem der Cursor steht
const c4 = S.sampleConfig(); const blk = M.entriesOf(c4, 'b-apptwr'); const ref = blk[1];
const ins = M.addEntry(c4, { ch: '119.000', dienst: 'APP', block: 'b-apptwr', kurz: 'NEU', kurzModus: 'frei' }, ref.id);
eq(M.entriesOf(c4, 'b-apptwr').map(e => e.id).indexOf(ins.id), 2, 'direkt nach der Cursorzeile');
eq(M.entriesOf(c4, 'b-apptwr').map(e => e.pos), M.entriesOf(c4, 'b-apptwr').map((_, i) => i), 'Block neu nummeriert');
// Dienste der Konfiguration
eq(M.servicesOf(c4), M.SERVICES); c4.settings.services = ['TWR', 'APP', 'BALL'];
ok(M.SVC_RE.test('BALL') && !M.SVC_RE.test('b') && !M.SVC_RE.test('TOOLONG'));
eq(M.fromJSON(JSON.stringify(Object.assign({}, c4, { settings: Object.assign({}, c4.settings, { services: [] }) }))).settings.services, M.SERVICES, 'leer → Vorgabe');
eq(M.entryShort({ dienst: 'BALL', ort: { code: 'ZRH' }, kurzModus: 'kurz' }), 'ZRH BALL', 'eigener Dienst im Kurznamen');
// Abwählen gibt den Platz frei, der nächste rückt nach – auch bei Höchstzahl des Blocks
const c5 = S.sampleConfig(); const radar = c5.bloecke.find(b => b.id === 'b-radar'); radar.max = 3;
let L5 = M.layout(c5); const inR = M.entriesOf(c5, 'b-radar').filter(e => e.aktiv); const fourth = inR[3];
ok(L5.slotOf[fourth.id] == null && L5.notPlaced.some(x => x.e.id === fourth.id && x.why === 'max'), 'vierter Radar ausserhalb der Höchstzahl');
const before = L5.slotOf[inR[1].id]; inR[0].aktiv = false; L5 = M.layout(c5);
ok(L5.slotOf[fourth.id] != null, 'rückt nach, Block wieder voll'); eq(L5.slotOf[inR[1].id], before - 1, 'folgende rücken einen Platz vor');
eq(L5.ranges.find(r => r.block === 'b-radar').to - L5.ranges.find(r => r.block === 'b-radar').from + 1, 3);
console.log(n + ' Prüfungen bestanden');

// ---------- 0.4.2: weitere feste Plätze und Prio-Liste ----------
{
  const M2 = require('../src/model.js');
  const c = M2.defaultConfig();
  const b = c.bloecke[0]; b.max = null;
  for (let i = 0; i < 120; i++) M2.addEntry(c, { ch: '118.' + String(100 + i * 5).padStart(3, '0').slice(-3), kurz: 'S' + i, block: b.id, dienst: 'INFO' });
  c.fixed.extra = [{ id: 'fxa', nr: 1, ch: '123.455', kurz: 'CREW', klar: 'Verfolger' }, { id: 'fxb', nr: 50, ch: '122.480', kurz: 'TEAM', klar: '' }];
  const L = M2.layout(c);
  const okf = (cond, m) => { if (!cond) throw new Error('0.4.2: ' + m); };
  okf(L.slots[1].kind === 'fixed' && L.slots[1].kurz === 'CREW' && L.slots[50].kurz === 'TEAM', 'feste Plätze 01 und 50');
  okf(L.slots[2].kind === 'entry' && L.slots[49].kind === 'entry' && L.slots[51].kind === 'entry', 'Block läuft um die festen Plätze');
  const r0 = L.ranges[0]; okf(r0.from === 2 && !r0.nrs.includes(50) && r0.nrs.length === 96 && r0.to === 98, 'Bereich ohne festen Platz, 96 Einträge');
  okf(L.prio.length === 24 && L.used === 99, 'Prio-Liste 24, 00–98 belegt');
  const D = M2.deviceSlots(c, L); okf(D[50].name.trim() === 'TEAM' && D[50].kind === 'fixed', 'Gerät: fester Platz');
  okf(M2.deselectOverflow(c) === 24 && M2.layout(c).prio.length === 0, 'Überzählige abgewählt');
  const e = c.eintraege.find(x => !x.aktiv); e.aktiv = true;
  okf(M2.layout(c).prio.length === 1, 'wieder gewählt = Prio');
  const first = c.eintraege.find(x => x.aktiv && M2.layout(c).slotOf[x.id] != null); first.aktiv = false;
  const L3 = M2.layout(c); okf(L3.prio.length === 0 && L3.slotOf[e.id] != null, 'Prio rückt nach');
  const back = M2.fromJSON(M2.toJSON(c)); okf(back.fixed.extra.length === 2 && back.fixed.extra[1].nr === 50, 'feste Plätze gespeichert');
  c.fixed.extra.push({ id: 'fxc', nr: 60, ch: '999.000', kurz: 'X' }); okf(M2.check(c).fixed.some(i => i.key === 'fxc' && i.code === 'freq'), 'Prüfung fester Platz');
  console.log('0.4.2: feste Plätze und Prio-Liste – 11 Prüfungen bestanden');
}
{ // 0.4.3: doppelte Frequenzen
  let k = 0; const okd = (cond, m) => { if (!cond) throw new Error('0.4.3: ' + m); k++; };
  okd(M.freqKey('123.550') === M.freqKey('123.555'), '25-kHz- und 8.33-Name desselben Trägers');
  okd(M.freqKey('123.550') !== M.freqKey('123.560') && M.freqKey('123.560') !== M.freqKey('123.565'), '8.33-Kanäle bleiben verschieden');
  okd(M.freqKey('123.575') === M.freqKey('123.580') && M.freqKey('999.000') === null, '…75 = …80; ungültig null');
  const c = M.defaultConfig(); const b = c.bloecke[0];
  const a1 = M.addEntry(c, { ch: '124.700', dienst: 'INFO', block: b.id, kurz: 'A', kurzModus: 'frei' });
  const a2 = M.addEntry(c, { ch: '124.705', dienst: 'INFO', block: b.id, kurz: 'B', kurzModus: 'frei' });
  const a3 = M.addEntry(c, { ch: '121.500', dienst: 'INFO', block: b.id, kurz: 'C', kurzModus: 'frei' });
  const a4 = M.addEntry(c, { ch: '124.700', dienst: 'INFO', block: b.id, kurz: 'D', kurzModus: 'frei' }); a4.aktiv = false;
  M.addEntry(c, { ch: '118.000', dienst: 'INFO', block: b.id, kurz: 'E', kurzModus: 'frei' });
  const G = M.dupGroups(c);
  okd(G.length === 2, 'zwei Gruppen (124.700 = 124.705, 121.500 mit Platz 99), abgewählte und freie Plätze zählen nicht');
  const g1 = G.find(g => g.chs.includes('124.700')); okd(g1.list.length === 2 && g1.chs.join() === '124.700,124.705', 'Gruppe zeigt beide Kanalnamen');
  const g2 = G.find(g => g.chs.includes('121.500')); okd(g2.list[g2.list.length - 1].fixed === 'p99' && g2.list.some(x => x.e === a3), 'fester Platz 99 in der Gruppe');
  const sug = M.dupSuggest(G); okd(sug.includes(a2.id) && sug.includes(a3.id) && !sug.includes(a1.id), 'Vorschlag: ersten behalten, neben festem Platz alle Einträge weg');
  okd(M.check(c).byEntry[a2.id].some(i => i.code === 'doppelt'), 'Prüfung kennt 8.33-Gleichheit');
  console.log('0.4.3: doppelte Frequenzen – ' + k + ' Prüfungen bestanden');
}

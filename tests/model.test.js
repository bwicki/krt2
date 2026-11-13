// node tests/model.test.js – Modell: Kurznamen, Belegung, Verschieben, Prüfung, Speichern/Laden
const assert = require('node:assert');
const M = require('../src/model.js');
const S = require('../src/sample.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

// Kurznamen nach Regel (Ortskürzel + ICAO-Dienstkürzel, max. 8)
eq(M.shortName({ loc: 'BIR', svc: 'AFIS' }, 'kurz'), 'BIR AFIS');
eq(M.shortName({ loc: 'ZRH', svc: 'TWR' }, 'kurz'), 'ZRH TWR');
eq(M.shortName({ loc: 'ZRH', svc: 'FIS' }, 'kurz'), 'ZRH INFO', 'FIS heisst im Kurznamen INFO');
eq(M.shortName({ loc: 'ZRH', qual: 'E', svc: 'RDR' }, 'kurz'), 'ZRHE RDR');
eq(M.shortName({ loc: 'ZRH', icao: 'LSZH', svc: 'TWR' }, 'icao'), 'LSZH TWR');
eq(M.shortName({ loc: 'ZRH', icao: 'LSZH', svc: 'ATIS' }, 'icao'), 'LSZHATIS', 'vierstelliger Dienst ohne Leerzeichen');
eq(M.shortName({ loc: 'BIR', icao: 'LSZF', svc: 'AFIS' }, 'icao'), 'LSZFAFIS');
eq(M.shortName({ loc: 'ZRH', svc: 'VOLMET' }, 'kurz'), 'Z VOLMET', 'Ortsteil kürzen, nie den Dienst');
eq(M.shortName({ loc: 'ZRH', icao: '', svc: 'TWR' }, 'icao'), 'ZRH TWR', 'ohne ICAO-Code bleibt das Kürzel');
eq(M.locCode('Dübendorf'), 'DUB'); eq(M.locCode('Speck-Fehraltorf'), 'SPE');

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
eq(L.slots[1].kurz, 'ZRH INFO', 'INFO-Block nach Distanz: Zürich INFO (0 km) zuerst');

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
console.log(n + ' Prüfungen bestanden');

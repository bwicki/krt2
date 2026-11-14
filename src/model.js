/* krt2.wicki.aero – Modell: Konfiguration, Blöcke, Belegung der 100 Plätze, Kurznamen, Prüfung.
   Reine Logik ohne DOM; läuft im Browser (window.KRT2MODEL) und in Node (Tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./krt2codec.js'));
  else root.KRT2MODEL = factory(root.KRT2CODEC);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  const SCHEMA = 1;
  const LAST_SLOT = 98;                       // 99 ist der Notfrequenz vorbehalten

  // ICAO-Dienste (Doc 8400) und ihr Kürzel im 8-stelligen Kurznamen
  const SERVICES = ['FIS', 'INFO', 'AFIS', 'RDO', 'APP', 'ARR', 'DEP', 'TWR', 'ATIS', 'VOLMET', 'RDR', 'ACC', 'MIL', 'GND', 'APN', 'DEL', 'GLD', 'CTAF', 'UCOM', 'OTH'];
  const SVC_SHORT = { FIS: 'INFO', INFO: 'INFO', UCOM: 'UNIC', OTH: '' };      // für Klartext und Bezeichnungen
  const svcShort = s => (s in SVC_SHORT ? SVC_SHORT[s] : (s || ''));
  // Im Kurznamen werden häufige Dienste abgekürzt, damit der Ort mehr Platz hat (0.4.3)
  const SVC_KURZ = { INFO: 'I', FIS: 'F', TWR: 'T', RDR: 'R', RDO: 'RD', AFIS: 'AF', ATIS: 'AT', ARR: 'AR', DEP: 'D', UCOM: 'UNIC', OTH: '' };
  const svcKurz = s => (s in SVC_KURZ ? SVC_KURZ[s] : (s || ''));

  const ORDERS = ['dist', 'ad', 'corridor', 'freq', 'manual'];

  function defaultBlocks() {
    return [
      { id: 'b-info', name: 'INFO', on: true, svc: ['FIS', 'INFO', 'AFIS', 'RDO'], max: null, order: 'dist' },
      { id: 'b-apptwr', name: 'APP/TWR', on: true, svc: ['APP', 'ARR', 'DEP', 'TWR', 'ATIS', 'VOLMET'], max: null, order: 'ad' },
      { id: 'b-radar', name: 'RADAR', on: true, svc: ['RDR', 'ACC', 'MIL'], max: null, order: 'corridor' },
      { id: 'b-more', name: 'WEITERE', on: false, svc: ['GLD', 'CTAF', 'UCOM', 'OTH'], max: 10, order: 'dist' },
      { id: 'b-ground', name: 'GROUND', on: false, svc: ['GND', 'APN', 'DEL'], max: null, order: 'ad' }
    ];
  }

  function defaultConfig() {
    const now = new Date().toISOString();
    return {
      schema: SCHEMA, id: uid('c'), name: '', version: 0, created: now, updated: now,
      standort: { name: '', lat: null, lon: null },
      gebiet: null, hoehe: { von: 'GND', bis: 'FL195', radarOhneGrenze: false }, datenStand: null,
      settings: { adLoc: 'icao', allowDigits: true, free: { ch: '118.000', kurz: 'FREE' }, services: SERVICES.slice() },
      fixed: {
        p00: { on: true, ch: '122.255', kurz: 'BALLOON', klar: 'Balloon Air-Air' },
        p99: { on: true, ch: '121.500', kurz: 'EMERGENC', klar: 'Emergency' },
        extra: []   // weitere feste Plätze: { id, nr (01–98), ch, kurz, klar } – ab 0.4.2
      },
      prioListe: true, icaoDefault: true,
      bloecke: defaultBlocks(),
      eintraege: []
    };
  }

  let counter = 0;
  function uid(p) { counter = (counter + 1) % 1e6; return p + '-' + Date.now().toString(36) + '-' + counter.toString(36) + Math.random().toString(36).slice(2, 5); }

  // ---------- Kurznamen ----------
  function plain(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }
  const letters = s => plain(s).replace(/([^Q])UE/g, '$1U').replace(/AE/g, 'A').replace(/OE/g, 'O');
  // Füllwörter in mehrteiligen Namen (Hausen am Albis, Glacier du Trient)
  const FILL = new Set(['A', 'AM', 'AN', 'AUF', 'AUX', 'BEI', 'D', 'DA', 'DAL', 'DAS', 'DE', 'DEI', 'DEL', 'DER', 'DES', 'DI', 'DIE', 'DU', 'EN', 'ET', 'IM', 'L', 'LA', 'LE', 'LES', 'OB', 'SUL', 'SUR', 'UND']);
  /** Ein Wort auf r Zeichen bringen: ganz, wenn es passt; sonst ohne Doppelte, dann Vokale von hinten weg (der erste Buchstabe bleibt), zuletzt abschneiden. */
  function shrink(w, r) {
    if (r < 1) return '';
    if (w.length <= r) return w;
    let s = w.replace(/(.)\1+/g, '$1');
    if (s.length <= r) return s;
    const a = s.split('');
    for (let i = a.length - 1; i > 0 && a.length > r; i--) if (/[AEIOUY]/.test(a[i])) a.splice(i, 1);
    return a.join('').replace(/(.)\1+/g, '$1').slice(0, r);
  }
  /**
   * Merkbares Ortskürzel mit höchstens `room` Zeichen: der ganze Name, wenn er passt (ZURICH, BERN);
   * sonst der erste Buchstabe und die Konsonanten (Birrfeld → BRFLD), bei mehreren Wörtern zählt jeder Wortanfang.
   */
  function locCode(name, room = 3) {
    const main = String(name || '').split(/\s*-\s*/)[0];                  // Bern-Belp → Bern: der Teil vor dem Bindestrich ist der Ort
    let w = letters(letters(main).replace(/[^A-Z0-9]/g, '').length >= 3 ? main : name).split(/[^A-Z0-9]+/).filter(Boolean);
    if (w.length > 1) { const s2 = w.filter(x => !FILL.has(x)); if (s2.length) w = s2; }
    if (!w.length || room < 1) return '';
    const whole = w.join('');
    if (whole.length <= room) return whole;
    const n = Math.min(w.length, room);
    let left = room, out = '';
    for (let i = 0; i < n; i++) { const part = shrink(w[i], left - (n - 1 - i)); out += part; left -= part.length; }
    return out;
  }

  /**
   * Kurzname = Ort + Leerzeichen + Dienstkürzel, höchstens 8 Zeichen; immer ein Leerzeichen vor dem Dienst.
   * Ort: ICAO-Code (Modus 'icao', wenn vorhanden und Platz) oder ein merkbares Kürzel aus dem Namen, so lang, wie Platz ist.
   * Zu lang → Ort kürzen, nie den Dienst.
   */
  function shortName(parts, mode) {
    const p = parts || {};
    const svc = svcKurz(p.svc);
    const room = svc ? 8 - 1 - svc.length : 8;
    const useIcao = mode === 'icao' && /^[A-Z]{4}$/.test(p.icao || '') && room >= 4;
    let loc;
    if (useIcao) loc = p.icao;
    else {
      const qual = plain(p.qual || '').replace(/[^A-Z0-9]/g, '');           // Zusatz mit Leerzeichen: ZRCH E R (Zurich Radar East)
      const r = Math.max(0, room - (qual ? qual.length + 1 : 0));
      const base = p.name ? locCode(p.name, r) : plain(p.loc || '').replace(/[^A-Z0-9-]/g, '').slice(0, r);
      loc = base ? (qual ? base + ' ' + qual : base) : qual;
    }
    if (!svc) return loc.slice(0, 8);
    if (!loc) return svc.slice(0, 8);
    return room >= 1 ? loc.slice(0, room) + ' ' + svc : svc.slice(0, 8);
  }

  function entryParts(e) {
    const o = e.ort || {};
    return { name: o.name || '', loc: o.code || o.iata || '', icao: o.icao || '', qual: o.qual || '', svc: e.dienst };
  }
  /** Ortsteil des Kurznamens im Modus 'kurz' (Beschriftung der Umschaltung im Editor). */
  function kurzLoc(e) { const k = shortName(entryParts(e), 'kurz'); const svc = svcKurz(e.dienst); return svc && k.endsWith(' ' + svc) ? k.slice(0, -svc.length - 1) : k; }
  /** Kurzname eines Eintrags nach seinem Modus: 'kurz' | 'icao' | 'frei' (von Hand). */
  function entryShort(e) {
    if (e.kurzModus === 'frei') return e.kurz || '';
    return shortName(entryParts(e), e.kurzModus === 'icao' ? 'icao' : 'kurz');
  }
  // Land aus dem ICAO-Präfix, für Einträge ohne gespeichertes Land (z. B. Vorschläge vor 0.3.1)
  const ICAO_CC = { LS: 'CH', ED: 'DE', ET: 'DE', LO: 'AT', LF: 'FR', LI: 'IT', LJ: 'SI', LK: 'CZ', LZ: 'SK', LH: 'HU', EP: 'PL', EB: 'BE', EH: 'NL', EL: 'LU', EG: 'GB', EI: 'IE',
    EK: 'DK', ES: 'SE', EN: 'NO', EF: 'FI', EE: 'EE', EV: 'LV', EY: 'LT', LE: 'ES', LP: 'PT', LG: 'GR', LD: 'HR', LQ: 'BA', LY: 'RS', LW: 'MK', LA: 'AL', LB: 'BG', LR: 'RO', LU: 'MD', UK: 'UA', LM: 'MT', LC: 'CY', BI: 'IS', LN: 'MC' };
  function ccOf(e) { const o = (e && e.ort) || {}; return o.cc || ICAO_CC[String(o.icao || '').slice(0, 2)] || ''; }
  function hasIcao(e) { return !!(e.ort && /^[A-Z]{4}$/.test(e.ort.icao || '')); }

  // ---------- Einträge ----------
  function blockById(cfg, id) { return cfg.bloecke.find(b => b.id === id) || null; }
  function blockForService(cfg, svc) {
    return cfg.bloecke.find(b => b.on && b.svc.includes(svc)) || cfg.bloecke.find(b => b.svc.includes(svc)) || null;
  }
  function entriesOf(cfg, blockId) { return cfg.eintraege.filter(e => e.block === blockId).sort((a, b) => a.pos - b.pos); }

  /** Dienste der Konfiguration in ihrer Reihenfolge (Einstellungen), Vorgabe SERVICES. */
  function servicesOf(cfg) { const s = cfg && cfg.settings && cfg.settings.services; return Array.isArray(s) && s.length ? s : SERVICES; }
  const SVC_RE = /^[A-Z][A-Z0-9]{1,5}$/;

  /** Neuer Eintrag; mit afterId direkt nach diesem Eintrag (im selben Block), sonst am Blockende. */
  function addEntry(cfg, partial, afterId) {
    const e = Object.assign({
      id: uid('e'), ch: '', kurz: '', klar: '', dienst: 'OTH', block: null, aktiv: true,
      quellen: ['eigen'], vertrauen: 's', note: '', ort: {}, kurzModus: 'frei', dist: null, lage: null, along: null, bestaetigt: false
    }, partial || {});
    if (!e.block || !blockById(cfg, e.block)) { const b = blockForService(cfg, e.dienst) || cfg.bloecke[0]; e.block = b ? b.id : null; }
    if (e.kurzModus !== 'frei') e.kurz = entryShort(e);
    const same = cfg.eintraege.filter(x => x.block === e.block);
    const after = afterId && same.find(x => x.id === afterId);
    e.pos = after ? after.pos + 0.5 : same.length ? Math.max(...same.map(x => x.pos)) + 1 : 0;
    cfg.eintraege.push(e);
    if (after) renumber(cfg, e.block);
    return e;
  }

  function renumber(cfg, blockId) { entriesOf(cfg, blockId).forEach((e, i) => { e.pos = i; }); }

  /** Eintrag um einen Platz verschieben; am Blockrand in den vorigen/nächsten eingeschalteten Block. */
  function moveEntry(cfg, id, dir) {
    const e = cfg.eintraege.find(x => x.id === id); if (!e) return false;
    const list = entriesOf(cfg, e.block);
    const i = list.indexOf(e), j = i + dir;
    if (j >= 0 && j < list.length) { const o = list[j]; const t = o.pos; o.pos = e.pos; e.pos = t; return true; }
    const on = cfg.bloecke.filter(b => b.on);
    const bi = on.findIndex(b => b.id === e.block);
    const nb = on[bi + dir]; if (!nb) return false;
    return moveTo(cfg, id, nb.id, dir < 0 ? Infinity : 0);
  }
  /** Eintrag in einen Block an eine Stelle setzen (Ziehen und Ablegen). */
  function moveTo(cfg, id, blockId, index) {
    const e = cfg.eintraege.find(x => x.id === id); if (!e || !blockById(cfg, blockId)) return false;
    const from = e.block;
    const list = entriesOf(cfg, blockId).filter(x => x !== e);
    const k = Math.max(0, Math.min(list.length, index));
    list.splice(k, 0, e);
    e.block = blockId;
    list.forEach((x, n) => { x.pos = n; });
    if (from !== blockId) renumber(cfg, from);
    return true;
  }


  /** Block nach seiner Regel ordnen. */
  function sortBlock(cfg, blockId) {
    const b = blockById(cfg, blockId); if (!b) return;
    const num = v => (v == null || v === '' || isNaN(v) ? Infinity : Number(v));
    const list = entriesOf(cfg, blockId);
    const svcs = servicesOf(cfg);
    const SVC_RANK = s => { const i = svcs.indexOf(s); return i < 0 ? 99 : i; };
    const by = {
      dist: (x, y) => num(x.dist) - num(y.dist),
      corridor: (x, y) => num(x.along) - num(y.along) || num(x.dist) - num(y.dist),
      ad: (x, y) => String((x.ort && (x.ort.icao || x.ort.name)) || '').localeCompare(String((y.ort && (y.ort.icao || y.ort.name)) || '')) ||
        b.svc.indexOf(x.dienst) - b.svc.indexOf(y.dienst) || SVC_RANK(x.dienst) - SVC_RANK(y.dienst),
      freq: (x, y) => String(x.ch).localeCompare(String(y.ch)),
      manual: () => 0
    }[b.order] || (() => 0);
    list.sort((x, y) => by(x, y) || x.pos - y.pos).forEach((e, i) => { e.pos = i; });
  }

  // ---------- Belegung der 100 Plätze ----------
  /**
   * Blöcke folgen ab 00 (oder ab 01, wenn 00 fest belegt ist) lückenlos; freie Plätze nur am Ende vor 99.
   * Ergebnis: slots[100] = { nr, kind:'fixed'|'entry'|'free', ch, kurz, klar, dienst, block, entryId }.
   */
  /** Weitere feste Plätze (01–98), gültig und ohne Doppel: { nr → Eintrag }. */
  function fixedExtra(cfg) {
    const at = {};
    for (const x of (cfg.fixed.extra || [])) { const n = Number(x.nr); if (Number.isInteger(n) && n >= 1 && n <= LAST_SLOT && !at[n]) at[n] = x; }
    return at;
  }
  function layout(cfg) {
    const slots = new Array(100).fill(null);
    const free = cfg.settings.free;
    const fx = cfg.fixed, fxAt = fixedExtra(cfg);
    let next = 0;
    if (fx.p00.on) { slots[0] = { nr: 0, kind: 'fixed', fixed: 'p00', ch: fx.p00.ch, kurz: fx.p00.kurz, klar: fx.p00.klar, dienst: '', block: null }; next = 1; }
    for (const n of Object.keys(fxAt)) { const x = fxAt[n]; slots[n] = { nr: Number(n), kind: 'fixed', fixed: x.id, ch: x.ch, kurz: x.kurz, klar: x.klar || '', dienst: '', block: null }; }
    const skip = () => { while (next <= LAST_SLOT && fxAt[next]) next++; };   // feste Plätze überspringen
    skip();
    const ranges = [], notPlaced = [], slotOf = {};
    for (const b of cfg.bloecke) {
      const all = entriesOf(cfg, b.id);
      if (!b.on) { all.filter(e => e.aktiv).forEach(e => notPlaced.push({ e, why: 'blockAus' })); continue; }
      const items = all.filter(e => e.aktiv);
      const nrs = [];
      items.forEach((e, i) => {
        if (b.max != null && i >= b.max) { notPlaced.push({ e, why: 'max' }); return; }
        if (next > LAST_SLOT) { notPlaced.push({ e, why: 'voll' }); return; }
        slotOf[e.id] = next;
        slots[next] = { nr: next, kind: 'entry', ch: e.ch, kurz: entryShort(e), klar: e.klar, dienst: e.dienst, cc: ccOf(e), block: b.id, entryId: e.id };
        nrs.push(next); next++; skip();
      });
      if (nrs.length) ranges.push({ block: b.id, name: b.name, from: nrs[0], to: nrs[nrs.length - 1], nrs });
    }
    cfg.eintraege.filter(e => e.aktiv && !blockById(cfg, e.block)).forEach(e => notPlaced.push({ e, why: 'ohneBlock' }));
    for (let n = next; n <= LAST_SLOT; n++) if (!slots[n]) slots[n] = { nr: n, kind: 'free', ch: free.ch, kurz: free.kurz, klar: '', dienst: '', block: null };
    slots[99] = fx.p99.on
      ? { nr: 99, kind: 'fixed', fixed: 'p99', ch: fx.p99.ch, kurz: fx.p99.kurz, klar: fx.p99.klar, dienst: '', block: null }
      : { nr: 99, kind: 'free', ch: free.ch, kurz: free.kurz, klar: '', dienst: '', block: null };
    const frees = slots.filter(x => x.kind === 'free' && x.nr <= LAST_SLOT).map(x => x.nr);
    const prio = notPlaced.filter(x => x.why === 'voll' || x.why === 'max').map(x => x.e.id);
    return { slots, ranges, notPlaced, slotOf, prio, freeFrom: frees.length ? frees[0] : LAST_SLOT + 1, freeTo: frees.length ? frees[frees.length - 1] : null,
      used: slots.filter(x => x.nr <= LAST_SLOT && x.kind !== 'free').length };
  }

  /** Prio-Liste: gewählte Einträge, für die im Block kein Platz mehr frei ist. Sie rücken als erste nach, wenn vorne
      ein Eintrag abgewählt wird. Nach einem Vorschlag sind alle, die nicht mehr Platz haben, abgewählt (ab 0.4.2). */
  function deselectOverflow(cfg) {
    const L = layout(cfg); let n = 0;
    for (const id of L.prio) { const e = cfg.eintraege.find(x => x.id === id); if (e) { e.aktiv = false; n++; } }
    return n;
  }

  /** Was ins Gerät geht: 100 × { nr, ch, name (8 Zeichen) } – Grundlage für Z-Befehle und die A6-Karte. */
  function deviceSlots(cfg, lay) {
    const L = lay || layout(cfg);
    return L.slots.map(s => {
      const n = C.normalizeName(s.kurz, cfg.settings.allowDigits);
      const blk = s.block ? blockById(cfg, s.block) : null;
      return { nr: s.nr, ch: s.ch, name: n.ok ? n.name : (String(s.kurz || '') + '        ').slice(0, 8), klar: s.klar || '', dienst: s.dienst || '', cc: s.cc || '', kind: s.kind, block: blk ? blk.name : '', ok: n.ok && C.encodeFreq(s.ch).ok };
    });
  }

  // ---------- Prüfung ----------
  /** Befunde je Eintrag: { lvl:'r'|'y', code, arg } – r verhindert das Programmieren, ausser bewusst bestätigt. */
  /**
   * Schlüssel für «gleiche Frequenz»: derselbe Träger, auch wenn einmal der 25-kHz- und einmal der 8.33-Kanalname steht
   * (123.550 und 123.555 sind beide 123.550 MHz). Ungültig → null.
   */
  function freqKey(ch) {
    const f = C.encodeFreq(ch); if (!f.ok) return null;
    return String(f.mhz * 1000 + Math.floor(f.ch / 5) * 3 + Math.max(0, f.ch % 5 - 1));
  }
  /**
   * Gruppen gleicher Frequenz unter dem, was ins Gerät geht oder nachrückt: feste Plätze, platzierte Einträge, Prio-Liste.
   * [{ chs:['123.550','123.555'], list:[{ fixed, nr, prio, ch, kurz, klar, e }] }], nach Platz geordnet.
   */
  function dupGroups(cfg, lay) {
    lay = lay || layout(cfg);
    const rank = {}; lay.prio.forEach((id, i) => { rank[id] = i + 1; });
    const g = new Map();
    const push = (ch, item) => { const k = freqKey(ch); if (k) (g.get(k) || g.set(k, []).get(k)).push(item); };
    for (const s of lay.slots) if (s.kind === 'fixed') push(s.ch, { fixed: s.fixed, nr: s.nr, prio: null, ch: s.ch, kurz: s.kurz, klar: s.klar, e: null });
    for (const e of cfg.eintraege) {
      if (!e.aktiv) continue;
      const nr = lay.slotOf[e.id] == null ? null : lay.slotOf[e.id];
      if (nr == null && !rank[e.id]) continue;
      push(e.ch, { fixed: null, nr, prio: rank[e.id] || null, ch: e.ch, kurz: entryShort(e), klar: e.klar, e });
    }
    const ord = x => (x.nr != null ? x.nr : 1000 + x.prio);
    return [...g.values()].filter(l => l.length > 1).map(l => l.sort((a, b) => ord(a) - ord(b)))
      .sort((a, b) => ord(a[0]) - ord(b[0]))
      .map(list => ({ chs: [...new Set(list.map(x => C.encodeFreq(x.ch).display))], list }));
  }
  /** Vorschlag zum Bereinigen: je Gruppe den ersten behalten (fester Platz zuerst, sonst der kleinste Platz); Ids der übrigen. */
  function dupSuggest(groups) {
    const ids = [];
    for (const g of groups) g.list.forEach((x, i) => { if (x.e && (i > 0 || g.list.some(y => y.fixed))) ids.push(x.e.id); });
    return ids;
  }

  function check(cfg) {
    const lay = layout(cfg);
    const by = {};
    const add = (id, lvl, code, arg) => { (by[id] = by[id] || []).push({ lvl, code, arg }); };
    const placedCh = {};
    lay.slots.forEach(s => { const k = s.kind !== 'free' && freqKey(s.ch); if (k) (placedCh[k] = placedCh[k] || []).push(s.nr); });
    for (const e of cfg.eintraege) {
      const f = C.encodeFreq(e.ch);
      if (!f.ok) add(e.id, 'r', 'freq', e.ch);
      const k = entryShort(e);
      const n = C.normalizeName(k, cfg.settings.allowDigits);
      if (!k.trim()) add(e.id, 'r', 'nameLeer');
      else if (!n.ok) add(e.id, 'r', n.tooLong ? 'nameLang' : 'nameZeichen', n.bad || k);
      if (e.vertrauen === 'r') add(e.id, e.bestaetigt ? 'y' : 'r', 'widerspruch', e.note);
      if (e.vertrauen === 'y') add(e.id, 'y', 'eineQuelle');
      const fk = f.ok && freqKey(e.ch);
      if (fk && lay.slotOf[e.id] != null && (placedCh[fk] || []).length > 1) add(e.id, 'y', 'doppelt', placedCh[fk].map(x => String(x).padStart(2, '0')).join(', '));
    }
    const fixedIssues = [];
    const fxAll = [['p00', cfg.fixed.p00], ['p99', cfg.fixed.p99]].concat((cfg.fixed.extra || []).map(x => [x.id, Object.assign({ on: true }, x)]));
    for (const [key, p] of fxAll) {
      if (!p.on) continue;
      if (!C.encodeFreq(p.ch).ok) fixedIssues.push({ key, lvl: 'r', code: 'freq', arg: p.ch });
      const n = C.normalizeName(p.kurz, cfg.settings.allowDigits);
      if (!n.ok) fixedIssues.push({ key, lvl: 'r', code: n.tooLong ? 'nameLang' : 'nameZeichen', arg: n.bad || p.kurz });
    }
    if (!C.encodeFreq(cfg.settings.free.ch).ok) fixedIssues.push({ key: 'free', lvl: 'r', code: 'freq', arg: cfg.settings.free.ch });
    const placedIds = new Set(Object.keys(lay.slotOf));
    const count = { r: 0, y: 0, codes: {} };
    for (const id of Object.keys(by)) {
      if (!placedIds.has(id)) continue;                 // nur, was ins Gerät geht, zählt für die Freigabe
      for (const i of by[id]) { count[i.lvl]++; count.codes[i.code] = (count.codes[i.code] || 0) + 1; }
    }
    for (const i of fixedIssues) { count[i.lvl]++; count.codes[i.code] = (count.codes[i.code] || 0) + 1; }
    return { byEntry: by, fixed: fixedIssues, count, canProgram: count.r === 0, layout: lay };
  }

  // ---------- Speichern / Laden ----------
  function toJSON(cfg) { return JSON.stringify(cfg, null, 1); }
  /** Konfiguration aus Datei/Speicher übernehmen; fehlende Felder mit Vorgaben ergänzen. */
  function fromJSON(text) {
    const o = typeof text === 'string' ? JSON.parse(text) : text;
    if (!o || typeof o !== 'object' || !Array.isArray(o.eintraege) || !Array.isArray(o.bloecke)) throw new Error('keine KRT2-Konfiguration');
    const d = defaultConfig();
    const cfg = Object.assign(d, o);
    cfg.settings = Object.assign(defaultConfig().settings, o.settings || {});
    if (!Array.isArray(cfg.settings.services) || !cfg.settings.services.length) cfg.settings.services = SERVICES.slice();
    cfg.settings.free = Object.assign({ ch: '118.000', kurz: 'FREE' }, (o.settings || {}).free || {});
    const ofx = o.fixed || {};
    cfg.fixed = { p00: Object.assign(d.fixed.p00, ofx.p00 || {}), p99: Object.assign(defaultConfig().fixed.p99, ofx.p99 || {}),
      extra: (Array.isArray(ofx.extra) ? ofx.extra : []).map(x => ({ id: x.id || uid('fx'), nr: Number(x.nr), ch: String(x.ch || ''), kurz: String(x.kurz || ''), klar: String(x.klar || '') })) };
    cfg.bloecke = o.bloecke.map(b => Object.assign({ id: uid('b'), name: 'BLOCK', on: true, svc: [], max: null, order: 'manual' }, b));
    cfg.eintraege = o.eintraege.map(e => Object.assign({ id: uid('e'), ch: '', kurz: '', klar: '', dienst: 'OTH', aktiv: true, quellen: [], vertrauen: 's', note: '', ort: {}, kurzModus: 'frei', dist: null, along: null, bestaetigt: false, pos: 0 }, e));
    cfg.schema = SCHEMA;
    if (!o.prioListe) { deselectOverflow(cfg); cfg.prioListe = true; }   // einmalig: Überzählige erscheinen abgewählt (0.4.2)
    if (!o.icaoDefault) {                                                 // einmalig (0.4.3): ICAO-Code ist der Normalfall, wo es einen gibt
      cfg.settings.adLoc = 'icao';
      for (const e of cfg.eintraege) if (e.kurzModus === 'kurz' && hasIcao(e)) { e.kurzModus = 'icao'; e.kurz = entryShort(e); }
      cfg.icaoDefault = true;
    }
    return cfg;
  }

  /** Belegung als CSV (Semikolon, für Excel): Platz;Frequenz;Kurzname;Klartext;Dienst;Block */
  function toCSV(cfg) {
    const lay = layout(cfg);
    const name = id => (blockById(cfg, id) || {}).name || '';
    const q = v => /[;"\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    return ['Platz;Frequenz;Kurzname;Klartext;Dienst;Block']
      .concat(lay.slots.map(s => [String(s.nr).padStart(2, '0'), s.ch, s.kurz, s.klar, s.dienst, s.kind === 'fixed' ? 'fest' : s.kind === 'free' ? 'frei' : name(s.block)].map(q).join(';')))
      .join('\r\n') + '\r\n';
  }

  /** Entfernung in km (Haversine). */
  function distKm(lat1, lon1, lat2, lon2) {
    if ([lat1, lon1, lat2, lon2].some(v => v == null || isNaN(v))) return null;
    const R = 6371, r = Math.PI / 180;
    const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  return {
    SCHEMA, LAST_SLOT, SERVICES, SVC_RE, ORDERS, servicesOf, svcShort, svcKurz, defaultBlocks, defaultConfig, uid,
    locCode, shortName, entryParts, entryShort, kurzLoc, hasIcao, ccOf,
    blockById, blockForService, entriesOf, addEntry, moveEntry, moveTo, sortBlock, renumber,
    layout, fixedExtra, deselectOverflow, deviceSlots, freqKey, dupGroups, dupSuggest, check, toJSON, fromJSON, toCSV, distKm
  };
});

/* krt2.wicki.aero – Speicher von Hand auslesen (ab 0.4.0; Logik aus test 0.3.1).
   Am Gerät MEM drücken und Raste für Raste im Uhrzeigersinn drehen: Das Gerät meldet jeden angewählten Platz mit
   «R» (Frequenz und Name, ohne Platznummer). Gemessen am 13.11.2026: Meldung bei jeder Raste; MEM allein und das
   Verlassen des Speichermodus melden nichts. Jede gezählte Meldung gilt deshalb als nächster Platz; die Nummer aus
   der Anzeige SEL[..] verankert und prüft die Zählung. Nach 100 Plätzen schliesst die nächste Meldung die Runde,
   wenn sie zum schon gelesenen Platz passt – dann ist die ganze Zählung bestätigt.
   Reine Logik ohne Browser; mit node geprüft (tests/readout.test.js, echte Meldefolge vom 13.11.2026). */
(function (root) {
  'use strict';
  const DUP_MS = 300;   // gleiche Meldung innert 0.3 s nur einmal zählen
  const same = (a, b) => !!a && !!b && a.freq === b.freq && a.name.trimEnd() === b.name.trimEnd();
  const two = n => String(n).padStart(2, '0');

  function ranges(list) {
    const a = [...new Set(list)].sort((x, y) => x - y), out = [];
    for (let i = 0; i < a.length; i++) { let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++; out.push(j > i ? two(a[i]) + '–' + two(a[j]) : two(a[i])); i = j; }
    return out.join(', ');
  }

  class Readout {
    constructor() { this.slots = new Array(100).fill(null); this.reset(); this.on = false; this.closed = false; }
    reset() { this.cursor = null; this.pend = []; this.hist = []; this.sinceChk = []; this.covered = new Set(); this.lastR = null; this.stats = { got: 0, dup: 0, chkOk: 0, chkBad: 0, jump: 0 }; }
    /** Aufnahme beginnen. keep=true setzt eine unterbrochene Aufnahme fort (Nummer muss neu eingetragen werden). */
    start(keep) {
      if (!keep) this.slots = new Array(100).fill(null);
      this.reset(); this.on = true; this.closed = false;
    }
    stop() { this.on = false; const n = this.pend.length; this.pend = []; return n; }

    /** Eine R-Meldung { t, freq, name } verarbeiten. Gibt { type, slot? } zurück: pend | put | dup | closed | off. */
    onR(r) {
      if (!this.on) return { type: 'off' };
      const prev = this.lastR, dt = prev ? r.t - prev.t : null;
      this.lastR = r;
      if (prev && dt < DUP_MS && same(prev, r)) { this.stats.dup++; return { type: 'dup' }; }
      this.stats.got++;
      if (this.cursor === null) { this.pend.push({ r, dt }); this.hist.push({ kind: 'pend' }); return { type: 'pend', n: this.pend.length }; }
      const slot = (this.cursor + 1) % 100, again = this.covered.has(slot) && this.covered.size === 100;
      this._put(slot, r, dt);
      if (again) return this._close(slot);
      return { type: 'put', slot };
    }
    _put(slot, r, dt) {
      const old = this.slots[slot];
      const e = { freq: r.freq, name: r.name.trimEnd(), dt, state: 'gelesen', seen: 1, prev: null };
      if (old && old.state !== 'unsicher') {
        if (same(old, e)) { e.seen = old.seen + 1; e.state = old.state === 'kontrolliert' ? 'kontrolliert' : 'gelesen'; }
        else { e.state = 'widerspruch'; e.prev = old.freq + ' «' + old.name + '»'; }
      }
      this.hist.push({ kind: 'put', slot, old, cursor: this.cursor, sinceChk: this.sinceChk.slice() });
      this.slots[slot] = e; this.cursor = slot; this.sinceChk.push(slot); this.covered.add(slot);
    }
    _close(slot) {
      const e = this.slots[slot];
      if (e.state === 'widerspruch') return { type: 'mismatch', slot };
      this.stats.chkOk++;
      this.slots.forEach(x => { if (x && x.state === 'gelesen') x.state = 'kontrolliert'; });
      this.on = false; this.closed = true;
      return { type: 'closed', slot };
    }
    _mark() { for (const s of this.sinceChk) if (this.slots[s] && this.slots[s].state === 'gelesen') this.slots[s].state = 'kontrolliert'; this.sinceChk = []; }

    /** Nummer aus SEL[..] zur letzten Meldung: verankert, prüft oder setzt die Zählung neu.
        Gibt { type: anchor | ok | jump | bad | none, ... } zurück. */
    sel(nr) {
      if (!Number.isInteger(nr) || nr < 0 || nr > 99) return { type: 'invalid' };
      // Nummer schon vor der ersten Meldung (MEM zeigt SEL[..], meldet aber nichts): die nächste Meldung ist der Platz danach
      const noneYet = !this.hist.length || this.hist[this.hist.length - 1].kind !== 'put';
      if ((this.cursor === null && !this.pend.length) || (this.cursor !== null && noneYet && !this.sinceChk.length && !this.slots[this.cursor])) {
        this.cursor = nr; return { type: 'pre', slot: nr };
      }
      if (this.cursor === null) {
        const list = this.pend; this.pend = []; this.hist = this.hist.filter(h => h.kind !== 'pend');
        this.cursor = ((nr - list.length) % 100 + 100) % 100;
        for (const p of list) this._put((this.cursor + 1) % 100, p.r, p.dt);
        this._mark(); this.stats.chkOk++;
        return { type: 'anchor', slot: nr, back: list.length - 1 };
      }
      if (nr === this.cursor) { this._mark(); this.stats.chkOk++; return { type: 'ok', slot: nr }; }
      const was = this.cursor, e = this.slots[was], h = this.hist[this.hist.length - 1];
      const shaky = this.sinceChk.filter(s => s !== was);
      this.slots[was] = h && h.kind === 'put' && h.slot === was ? h.old : null;
      for (const s of shaky) if (this.slots[s]) this.slots[s].state = 'unsicher';
      this.slots[nr] = Object.assign({}, e, { state: 'kontrolliert', prev: null });
      this.covered.add(nr); this.cursor = nr; this.sinceChk = []; this.hist = [];
      if (!shaky.length) { this.stats.jump++; return { type: 'jump', slot: nr, was }; }
      this.stats.chkBad++;
      return { type: 'bad', slot: nr, was, shaky: ranges(shaky), n: shaky.length };
    }
    undo() {
      const h = this.hist.pop(); if (!h) return false;
      if (h.kind === 'pend') this.pend.pop();
      else { this.slots[h.slot] = h.old; this.cursor = h.cursor; this.sinceChk = h.sinceChk; this.covered.delete(h.slot); }
      this.stats.got--; return true;
    }
    get count() { return this.slots.filter(Boolean).length; }
    get complete() { return this.count === 100 && !this.slots.some(x => x.state === 'unsicher' || x.state === 'widerspruch'); }
    summary() {
      const at = k => this.slots.map((e, i) => (e && e.state === k ? i : -1)).filter(i => i >= 0);
      const miss = this.slots.map((e, i) => (e ? -1 : i)).filter(i => i >= 0);
      return { n: this.count, kontrolliert: at('kontrolliert').length, unsicher: ranges(at('unsicher')), widerspruch: ranges(at('widerspruch')), fehlt: miss.length < 100 ? ranges(miss) : '', closed: this.closed, stats: this.stats };
    }
    /** Ergebnis als 100 Plätze im Format des Gerätestands (für PUT /api/devices/:id/aktuell). */
    plaetze() {
      return this.slots.map((e, i) => (e ? { nr: i, ch: e.freq, name: e.name, kind: e.name.trim() ? '' : 'leer' } : null));
    }
  }

  /** Sicherungsdatei lesen: JSON (typ krt2-sicherung) oder CSV «Platz;Frequenz;Name[;Status]». Gibt 100 Plätze oder wirft. */
  function parseBackup(text) {
    const s = String(text || '').replace(/^﻿/, '').trim();
    let rows;
    if (s.startsWith('{')) {
      const j = JSON.parse(s);
      if (j.typ !== 'krt2-sicherung' || !Array.isArray(j.plaetze)) throw new Error('keine KRT2-Sicherung (typ krt2-sicherung erwartet)');
      rows = j.plaetze.map(p => ({ nr: Number(p.platz), ch: p.frequenz, name: p.name || '' }));
    } else {
      rows = s.split(/\r?\n/).slice(1).filter(l => l.trim()).map(l => { const c = l.split(';'); return { nr: Number(c[0]), ch: c[1], name: c[2] || '' }; });
    }
    const out = new Array(100).fill(null);
    for (const r of rows) {
      if (!Number.isInteger(r.nr) || r.nr < 0 || r.nr > 99) throw new Error('Platznummer ungültig: ' + r.nr);
      if (!r.ch) continue;
      out[r.nr] = { nr: r.nr, ch: String(r.ch), name: String(r.name).trimEnd(), kind: String(r.name).trim() ? '' : 'leer' };
    }
    return out;
  }

  const api = { Readout, parseBackup, ranges, same, DUP_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KRT2READOUT = api;
})(typeof window !== 'undefined' ? window : globalThis);

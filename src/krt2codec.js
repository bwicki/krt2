// KRT2-Protokoll (TQ «KRT2 Series Remote RS232 Protocol», Rev. 003) – Aufbau der Befehle Richtung Funkgerät.
// Gegenstück zu krt2decoder.js. Reine Funktionen ohne Browser-Abhängigkeit; mit node geprüft (tests/codec.test.js).
(function (root) {
  'use strict';
  const STX = 0x02;
  const CMD = { Z: 0x5A, R: 0x52, U: 0x55, W: 0x57, w: 0x77 };
  const NAME_LEN = 8;

  // Kanalname «121.500» → { mhz, ch } nach Abschnitt 2.13: Kanal = angezeigte kHz / 5; Kanäle mit Rest 4 sind ungültig.
  // Gibt { ok:false, error } zurück, wenn der Wert kein gültiger Kanalname ist.
  function encodeFreq(input) {
    const s = String(input == null ? '' : input).trim().replace(',', '.');
    const m = /^(\d{3})(?:\.(\d{1,3}))?$/.exec(s);
    if (!m) return { ok: false, error: 'Format: drei Ziffern, Punkt, bis drei Ziffern (z. B. 121.500)' };
    const mhz = Number(m[1]);
    const khz = Number((m[2] || '0').padEnd(3, '0'));
    if (mhz < 118 || mhz > 136) return { ok: false, error: 'MHz ausserhalb 118–136 (Protokoll Rev. 003)' };
    if (khz % 5 !== 0) return { ok: false, error: 'kHz-Teil muss durch 5 teilbar sein (Kanalname, z. B. 132.505)' };
    const ch = khz / 5;
    if (ch % 5 === 4) return { ok: false, error: 'ungültiger 8.33-kHz-Kanal (…20, …45, …70, …95 gibt es nicht)' };
    if (ch > 198) return { ok: false, error: 'Kanal ausserhalb 0–198' };
    const display = mhz + '.' + String(khz).padStart(3, '0');
    return { ok: true, mhz, ch, display, spacing: ch % 5 === 0 ? '25 kHz' : '8.33 kHz' };
  }

  const UML = { 'Ä': 'AE', 'Ö': 'OE', 'Ü': 'UE', 'ä': 'AE', 'ö': 'OE', 'ü': 'UE', 'ß': 'SS', 'É': 'E', 'È': 'E', 'Ê': 'E', 'é': 'E', 'è': 'E', 'ê': 'E', 'À': 'A', 'à': 'A', 'Â': 'A', 'â': 'A', 'Ç': 'C', 'ç': 'C', 'Ô': 'O', 'ô': 'O', 'Î': 'I', 'î': 'I', 'Û': 'U', 'û': 'U' };

  // Kurzname → genau 8 Zeichen (A–Z, 0–9, Leerzeichen), rechts mit Leerzeichen aufgefüllt.
  // allowDigits=false lässt nur A–Z und Leerzeichen zu (am Gerät eingebbarer Zeichensatz, Handbuch 2.2.2.3).
  function normalizeName(input, allowDigits = true) {
    let s = String(input == null ? '' : input).replace(/[ÄÖÜäöüßÉÈÊéèêÀàÂâÇçÔôÎîÛû]/g, c => UML[c]).toUpperCase();
    const bad = [];
    let out = '';
    for (const c of s) {
      const okc = (c >= 'A' && c <= 'Z') || c === ' ' || (allowDigits && c >= '0' && c <= '9');
      if (okc) out += c; else bad.push(c);
    }
    const tooLong = out.length > NAME_LEN;
    out = out.slice(0, NAME_LEN);
    return { ok: bad.length === 0 && !tooLong, name: out.padEnd(NAME_LEN, ' '), trimmed: out.trimEnd(), bad, tooLong };
  }

  function nameBytes(name) { return Array.from(normalizeName(name).name, c => c.charCodeAt(0)); }

  // 2.5 Speicherplatz schreiben: STX 'Z' MHz Kanal n0..n7 Platz Prüfsumme(MHz xor Kanal) – 14 Byte.
  function buildZ(freq, name, slot) {
    const f = encodeFreq(freq);
    if (!f.ok) throw new Error('Frequenz «' + freq + '»: ' + f.error);
    const n = Number(slot);
    if (!Number.isInteger(n) || n < 0 || n > 99) throw new Error('Speicherplatz muss 0–99 sein');
    return [STX, CMD.Z, f.mhz, f.ch, ...nameBytes(name), n, (f.mhz ^ f.ch) & 0xFF];
  }
  // 2.4 Standby setzen: STX 'R' MHz Kanal n0..n7 Prüfsumme – 13 Byte. (2.3 aktiv setzen 'U' gleich aufgebaut; wird nie benutzt.)
  function buildR(freq, name) {
    const f = encodeFreq(freq);
    if (!f.ok) throw new Error('Frequenz «' + freq + '»: ' + f.error);
    return [STX, CMD.R, f.mhz, f.ch, ...nameBytes(name), (f.mhz ^ f.ch) & 0xFF];
  }
  function buildU(freq, name) { const b = buildR(freq, name); b[1] = CMD.U; return b; }
  // 3.3 / 3.4 nächster bzw. voriger Speicherplatz in die Standby-Frequenz.
  const buildW = () => [STX, CMD.W];
  const buildWPrev = () => [STX, CMD.w];

  const api = { encodeFreq, normalizeName, nameBytes, buildZ, buildR, buildU, buildW, buildWPrev, NAME_LEN, CMD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KRT2CODEC = api;
})(typeof window !== 'undefined' ? window : globalThis);

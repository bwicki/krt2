// KRT2-Protokoll (TQ «KRT2 Series Remote RS232 Protocol», Rev. 003) – Zerleger für den Datenstrom vom Funkgerät.
// Reine Funktion ohne Browser-Abhängigkeit; wird in der Seite eingebettet und mit node geprüft.
(function (root) {
  'use strict';
  const STX = 0x02, ACK = 0x06, NAK = 0x15;

  // Rahmen, die das Funkgerät senden kann (Richtung Funkgerät -> Gegengerät). Länge inklusive STX und Kennbuchstabe.
  // 'J' ist in dieser Richtung die Statusmeldung «Empfang ein» (2 Byte), nicht der Befehl 3.2.
  const FRAMES = {
    0x55: { len: 13, name: 'U', text: 'aktive Frequenz und Name' },
    0x52: { len: 13, name: 'R', text: 'Standby-Frequenz und Name' },
    0x5A: { len: 14, name: 'Z', text: 'Speicherplatz schreiben (bidirektional, selten vom Funkgerät)' },
    0x43: { len: 2,  name: 'C', text: 'Tausch aktiv/Standby' },
    0x41: { len: 6,  name: 'A', text: 'Lautstärke, Squelch, VOX' },
    0x32: { len: 3,  name: '2', text: 'Sendetasten (0 Pilot, 1 Copilot, 2 beide)' },
    0x33: { len: 3,  name: '3', text: 'Intercom-Lautstärke' },
    0x34: { len: 3,  name: '4', text: 'Lautstärke externer NF-Eingang' },
    0x31: { len: 3,  name: '1', text: 'Mithörton' },
    0x38: { len: 2,  name: '8', text: 'Kanalraster 8.33 kHz' },
    0x36: { len: 2,  name: '6', text: 'Kanalraster 25 kHz' },
    0x4F: { len: 2,  name: 'O', text: 'DUAL ein' },
    0x6F: { len: 2,  name: 'o', text: 'DUAL aus' },
    0x42: { len: 2,  name: 'B', text: 'Status: Batterie tief' },
    0x44: { len: 2,  name: 'D', text: 'Status: Batterie wieder gut' },
    0x4A: { len: 2,  name: 'J', text: 'Status: Empfang ein (RX)' },
    0x56: { len: 2,  name: 'V', text: 'Status: Empfang aus' },
    0x4B: { len: 2,  name: 'K', text: 'Status: Sender ein (TX)' },
    0x59: { len: 2,  name: 'Y', text: 'Status: Ende RX/TX/DUAL-RX' },
    0x4C: { len: 2,  name: 'L', text: 'Status: Sendezeit überschritten (Te)' },
    0x4D: { len: 2,  name: 'M', text: 'Status: DUAL-RX auf aktiver Frequenz' },
    0x6D: { len: 2,  name: 'm', text: 'Status: DUAL-RX auf Standby-Frequenz' },
    0x61: { len: 2,  name: 'a', text: 'FEHLER: ADC' },
    0x62: { len: 2,  name: 'b', text: 'FEHLER: Antenne fehlangepasst (hohes SWR)' },
    0x63: { len: 2,  name: 'c', text: 'FEHLER: FPAA, Start blockiert' },
    0x64: { len: 2,  name: 'd', text: 'FEHLER: Frequenzsynthesizer' },
    0x65: { len: 2,  name: 'e', text: 'FEHLER: PLL' },
    0x66: { len: 2,  name: 'f', text: 'FEHLER: Tasten blockiert' },
    0x67: { len: 2,  name: 'g', text: 'FEHLER: I2C-Bus' },
    0x68: { len: 2,  name: 'h', text: 'FEHLER: Antennenschalter oder Diode D10' },
    0x46: { len: 2,  name: 'F', text: 'alle Fehler gelöscht' },
    0x57: { len: 2,  name: 'W', text: 'nächster Speicherplatz (Befehl; sollte nicht vom Funkgerät kommen)' },
    0x77: { len: 2,  name: 'w', text: 'voriger Speicherplatz (Befehl; sollte nicht vom Funkgerät kommen)' },
    0x49: { len: 3,  name: 'I', text: 'Mikrofonverstärkung (Befehl; sollte nicht vom Funkgerät kommen)' },
  };
  const UNKNOWN_LEN = 2;        // unbekannte Kennbuchstaben: STX + Kennbuchstabe, Rest als Rohbytes
  const FRAME_TIMEOUT_MS = 250; // unvollständiger Rahmen gilt nach dieser Zeit als abgebrochen
  const GAP_MS = 100;           // Pause zwischen zwei Blöcken, nach der ein angefangener Rahmen verworfen wird (13 Byte dauern 13.5 ms; Reserve für Verzögerungen im Browser)

  function hex(bytes) { return Array.from(bytes, b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '); }
  function pad3(n) { return String(n).padStart(3, '0'); }

  // Frequenz aus MHz-Byte und Kanalbyte (Abschnitt 2.13): angezeigt = MHz + Kanal × 5 kHz; echte 8.33-kHz-Frequenz daneben.
  function decodeFreq(mhz, ch) {
    const khzDisp = ch * 5;
    const r = { mhz, ch, display: mhz + '.' + pad3(khzDisp), valid: true, spacing: '' };
    if (mhz < 117 || mhz > 137 || ch > 199) { r.valid = false; r.note = 'ausserhalb des Bereichs'; return r; }
    if (ch % 5 === 4) { r.valid = false; r.note = 'ungültiger Kanal (5 kHz unter einem 25-kHz-Schritt)'; return r; }
    const within = ch % 5; // 0: 25-kHz-Kanal; 1..3: 8.33-kHz-Kanäle
    const base = ch - within;
    if (within === 0) { r.spacing = '25 kHz'; r.actualKhz = base * 5; }
    else { r.spacing = '8.33 kHz'; r.actualKhz = base * 5 + (within - 1) * 8.3333; }
    r.actual = (mhz + r.actualKhz / 1000).toFixed(4);
    return r;
  }

  function nameOf(bytes) { return Array.from(bytes, b => (b >= 0x20 && b < 0x7F) ? String.fromCharCode(b) : '·').join(''); }

  // Zerlegt einen Rahmen bekannter Länge in eine lesbare Beschreibung.
  function describeFrame(bytes) {
    const code = bytes[1], f = FRAMES[code];
    const out = { kind: 'frame', code: String.fromCharCode(code), name: f ? f.name : '?', text: f ? f.text : 'unbekannter Kennbuchstabe', bytes, ok: true };
    if (!f) { out.ok = false; return out; }
    if (f.name === 'U' || f.name === 'R' || f.name === 'Z') {
      const fr = decodeFreq(bytes[2], bytes[3]);
      const name = nameOf(bytes.slice(4, 12));
      const cks = f.name === 'Z' ? bytes[13] : bytes[12];
      const expect = (bytes[2] ^ bytes[3]) & 0xFF;
      out.freq = fr; out.station = name; out.cksOk = (cks === expect);
      out.text += ': ' + fr.display + ' MHz' + (fr.spacing ? ' (' + fr.spacing + (fr.actual ? ', wirklich ' + fr.actual : '') + ')' : '') + ' «' + name.trim() + '»';
      if (f.name === 'Z') out.text += ', Speicherplatz ' + bytes[12];
      if (!fr.valid) out.text += ' – ' + fr.note;
      if (!out.cksOk) { out.ok = false; out.text += ' – PRÜFSUMME FALSCH (ist ' + hex([cks]) + ', soll ' + hex([expect]) + ')'; }
    } else if (f.name === 'A') {
      const vol = bytes[2], sq = bytes[3], vox = bytes[4], cks = bytes[5], expect = (sq + vox) & 0xFF;
      out.cksOk = (cks === expect);
      out.text += ': Lautstärke ' + vol + ', Squelch ' + sq + ', VOX ' + vox;
      if (!out.cksOk) { out.ok = false; out.text += ' – PRÜFSUMME FALSCH (ist ' + hex([cks]) + ', soll ' + hex([expect]) + ')'; }
    } else if (f.len === 3) {
      out.value = bytes[2]; out.text += ': Wert ' + bytes[2];
    }
    return out;
  }

  class KRT2Decoder {
    constructor() { this.buf = []; this.bufStart = 0; this.lastByteT = 0; }
    // bytes: Uint8Array oder Array; t: Zeitstempel in ms. Gibt die Liste der neuen Ereignisse zurück.
    feed(bytes, t) {
      const ev = [];
      if (this.buf.length && t - this.lastByteT > GAP_MS) {
        ev.push({ kind: 'incomplete', t: this.bufStart, bytes: this.buf.slice(), text: 'unvollständiger Rahmen, Pause im Datenstrom (' + hex(this.buf) + ')', ok: false });
        this.buf = [];
      }
      this.lastByteT = t;
      let pending = Array.from(bytes);
      while (pending.length) {
        const b = pending.shift();
        if (this.buf.length === 0) {
          if (b === STX) { this.buf.push(b); this.bufStart = t; continue; }
          if (b === 0x53) { ev.push({ kind: 'ping', t, bytes: [b], text: 'Verbindungsabfrage «S» vom Funkgerät' }); continue; }
          if (b === ACK) { ev.push({ kind: 'ack', t, bytes: [b], text: 'ACK (Bestätigung)' }); continue; }
          if (b === NAK) { ev.push({ kind: 'nak', t, bytes: [b], text: 'NAK (abgelehnt)' }); continue; }
          ev.push({ kind: 'raw', t, bytes: [b], text: 'Einzelzeichen ' + hex([b]) + ((b >= 0x20 && b < 0x7F) ? ' «' + String.fromCharCode(b) + '»' : '') + ' (Antwort auf eine eigene Abfrage, oder Bruchstück)' });
          continue;
        }
        this.buf.push(b);
        const f = FRAMES[this.buf[1]];
        const want = f ? f.len : UNKNOWN_LEN;
        if (this.buf.length >= want) {
          const d = describeFrame(this.buf); d.t = this.bufStart;
          if (!f) d.text += ' ' + hex([this.buf[1]]) + ' – nachfolgende Bytes beachten';
          if (f && d.cksOk === false) {
            // Prüfsumme falsch: vermutlich mitten in einem Rahmen eingestiegen. Am nächsten STX im Puffer neu ausrichten.
            const i = this.buf.indexOf(STX, 1);
            d.text += (i > 0) ? ' – neu ausgerichtet am nächsten STX' : '';
            ev.push(d);
            const rest = (i > 0) ? this.buf.slice(i) : [];
            this.buf = [];
            pending = rest.concat(pending);
            continue;
          }
          ev.push(d); this.buf = [];
        }
      }
      return ev;
    }
    // Aufruf aus einem Zeitgeber: unvollständige Rahmen nach FRAME_TIMEOUT_MS als abgebrochen melden.
    tick(t) {
      if (this.buf.length && t - this.bufStart > FRAME_TIMEOUT_MS) {
        const e = { kind: 'incomplete', t: this.bufStart, bytes: this.buf.slice(), text: 'unvollständiger Rahmen (' + hex(this.buf) + ')', ok: false };
        this.buf = []; return [e];
      }
      return [];
    }
  }

  const api = { KRT2Decoder, FRAMES, decodeFreq, hex, STX, ACK, NAK, FRAME_TIMEOUT_MS, GAP_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KRT2 = api;
})(typeof window !== 'undefined' ? window : globalThis);

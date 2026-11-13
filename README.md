# KRT2-Speicherplätze — krt2.wicki.aero

Programmiert die 100 Speicherplätze des Flugfunkgeräts TQ KRT2 über die RS-232-Fernsteuerschnittstelle:
Frequenzen für ein auf der Karte markiertes Gebiet (Kreis, Rechteck, Vieleck, Korridor) aus öffentlichen
Quellen zusammenstellen, in konfigurierbaren Blöcken auf die Plätze verteilen, bearbeiten, speichern und ins
Funkgerät schreiben. Die Startseite zeigt die aktuelle Programmierung eines Geräts — ohne Anmeldung und
auch offline im Korb — und druckt sie auf eine A6-Karte. Zweisprachig DE/EN.

**Live:** https://krt2.wicki.aero · **Repository:** https://github.com/bwicki/krt2
**Stack (geplant):** HTML/CSS/JS ohne Build-Schritt (ES-Module, GitHub Pages aus dem Repository-Stamm),
Web Serial (Chrome/Edge am Laptop), Leaflet/OSM, Cloudflare Worker mit D1, IBM Plex. Gestaltung wie
analyze.wicki.aero.

> **Hilfsmittel ohne Gewähr.** Frequenzen aus öffentlichen Quellen können falsch oder veraltet sein.
> Massgebend sind AIP, VFR-Manual, NOTAM und die Handbücher des Funkgeräts.

Stand: Phase 1 (Machbarkeitstest am Gerät). Konzept: Dropbox «046 WebAPP krt2\01_Konzept».

---

## Machbarkeitstest — `test.html`

Testseite für die Fragen, die die Protokollbeschreibung offenlässt (Schreiben eines Speicherplatzes mit «Z»,
Ziffern im Namen, Blättern mit «W» als einziger Weg zum Auslesen, Kanalumrechnung 8.33/25 kHz). Baut auf
der Seite «KRT2 mitlesen» aus Projekt 024 auf. Befehle gehen nur hinaus, wenn «Senden freigeben» und
«Befehle an das Funkgerät freigeben» gesetzt sind; gesendet werden nur S, ACK, Z, R und W.
`test.html?sim=1` startet ein nachgebildetes Funkgerät zum Ausprobieren ohne Adapter.

## Protokoll

TQ «KRT2 Series Remote RS232 Protocol» Rev. 003 (2021-05-11), 9600 Bd 8N1.
`src/krt2decoder.js` zerlegt den Datenstrom vom Funkgerät, `src/krt2codec.js` baut die Befehle.
Prüfung: `node tests/codec.test.js` (Beispiele der Protokollbeschreibung, Rundlauf).

## Lizenz

Alle Rechte vorbehalten, Quelltext zur Einsicht — siehe `LICENSE`.

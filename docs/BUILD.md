# krt2.wicki.aero – Bauplan

Arbeitsgrundlage für den Bau (Phase 3–5). Massgebend sind das Konzept v0.3 (Dropbox `046 WebAPP krt2\01_Konzept`) und
die freigegebenen Oberflächen (Canvas «krt2.wicki.aero – Oberflächen v0.1», Kopie `03_Design\v0.2`). Dieses Dokument
hält fest, was für den Code gilt, damit eine neue Sitzung ohne Vorgeschichte weiterbauen kann.

## 1 Rahmen

- Statische Seiten auf GitHub Pages aus dem Repository-Stamm (CNAME `krt2.wicki.aero`), JavaScript ohne Build-Schritt.
- Speicher: Cloudflare Worker + D1 (`worker/`), eingerichtet über einen GitHub-Workflow; Secrets im Repo:
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (angelegt 13.11.2026). Einrichtung und Betrieb: `SETUP.md`.
- API (`worker/src/index.js`): `/api/health`, `/api/setup`, `/api/login`, `/api/logout`, `/api/me`, `/api/me/password`,
  `/api/users` (Supermaster), `/api/devices` (lesen öffentlich), `/api/devices/:id/aktuell` (PUT, Besitzer, ab 0.4.0),
  `/api/configs` (+ `/copy`, `/versions`). Erstes Konto = Supermaster `bwicki` (über die Seite eingerichtet).
- Frequenzdaten: `tools/build-frequencies.mjs`, nächtlich über `.github/workflows/frequencies.yml` auf den Zweig `data`
  (`freq-<cc>.json` je Land, `index.json`), gelesen über `https://raw.githubusercontent.com/bwicki/krt2/data/…`.
- Gerät: Web Serial (Chrome/Edge am Laptop), Protokoll TQ Rev. 003, `src/krt2decoder.js` + `src/krt2codec.js`.
- Sprache DE, umschaltbar EN. Gestaltung wie analyze.wicki.aero (Tag-Look, IBM Plex, Tokens in `css/test.css`).
- Konventionen aller Apps: Logo ganz rechts in der Kopfzeile, Versionsnummer klein darunter; Meldungen bleiben stehen
  und sind kopierbar; Orte immer «CH-Zürich», bei gleichnamigen Orten Auswahlliste; Portal-Zähler `hit.js`;
  Menüpunkt «Legal Mambojumbo»; Kontakt balthasar@wicki.aero; Lizenz siehe `LICENSE`.

## 2 Entscheide, die den Code bestimmen (Kurzfassung, Nummern wie im Konzept)

| Nr. | Regel |
|---|---|
| E7/E28 | Startseite ohne Anmeldung: Liste aller Geräte, Programmierung des gewählten Geräts; Rest mit Konto |
| E26/E27 | Konten legt nur der Supermaster `bwicki` an; Konfigurationen für alle sichtbar und als Kopie übernehmbar, ändern nur der Besitzer |
| E12/E20 | Platz 00 = 122.255 BALLOON «Balloon Air-Air» (Vorgabe des Kontos), Platz 99 = 121.500 EMERGENC «Emergency» (immer; abwählen nur mit zweifacher Bestätigung) |
| E21 | Blöcke ab 00 lückenlos, je so lang wie nötig, optionale Höchstzahl; freie Plätze nur am Ende vor 99 (Platzhalter 118.000 FREE, endgültig nach Test) |
| E18/E19/E29 | Kurzname = Ortskürzel (3, IATA wo vorhanden) + Leerzeichen + ICAO-Dienstkürzel; bei Flugplätzen wahlweise ICAO-Code (LSZH TWR, LSZHATIS); Radarsektor ZRHE RDR; Zeichensatz A–Z 0–9 - Leerzeichen, 8 Zeichen |
| E22 | Korridor: Mittellinie durch Punkte ab Startort, Breite links/rechts je Schenkel |
| E9 | Höhenband Vorgabe GND–FL 195, Zuschalter «Radar ohne Obergrenze» |
| E24 | Handy: GPS-Hervorhebung hellgrün, Reihenfolge wählbar (Speicherplatz / passend zuerst) |
| E25 | Beim Anschliessen und auf der Startseite: «auslesen und sichern» (100 × W, abhängig vom Test) |

## 3 Datenformate

**Frequenzdatei `freq-<cc>.json`** (Zweig `data`, `index.json` mit `schema: 2`):

```
{ cc, generated, warnings[],
  airports:  [{ id, icao, iata, name, t, lon, lat, f: [{ ch, note, raw, s, n, pri, src[] }] }],
  airspaces: [{ id, name, t, cls, lo:{v,u,r}, hi:{v,u,r}, bb:[w,s,e,n], g:{t:'P'|'M', c}, f: [{ ch, note, raw, s, sby, n, pri, src[] }] }] }
```
- `ch` = Kanalname (null = ungültig, `note` sagt warum; fast nur Werte ausserhalb 118–137 MHz).
- `s` = ICAO-Dienstkürzel (TWR, APP, ARR, DEP, ATIS, AFIS, INFO, FIS, RDR, ACC, GND, DEL, APN, RDO, GLD, OTH …).
  Bei Lufträumen liefert openAIP nur Wert und Rufnamen (`n`, z. B. «ZUERICH TERMINAL», «ALPS RADAR»); `s` wird
  aus dem Rufnamen abgeleitet, sonst aus dem Luftraumtyp (`sby` = `name` | `type`).
- `iata` aus OurAirports (für Kurznamen wie «ZRH TWR»), leer, wo keiner vergeben ist.
- `src` = `oaip` (openAIP), `oa` (OurAirports).
- Grenzen `lo/hi` (bestätigt am Datensatz CH): unit 0 = m, 1 = ft, 6 = FL; ref 0 = GND, 1 = MSL, 2 = STD.
- Luftraumtyp `t` (openAIP; bestätigt: 1 R, 2 D, 4 CTR, 5 TMZ, 6 RMZ, 7 TMA, 21 Segelflugsektor, 26 CTA,
  33 FIS-Sektor; übrige gemäss `OAIP_ASPTYPE` in `tools/build-frequencies.mjs` [likely]). `cls` 0 = A … 6 = G, 8 = SUA.

**Konfiguration** (`src/model.js`, Schema 1; lokal als Entwurf in localStorage `krt2.draft`, ab 0.2.0 im Worker/D1):

```
{ schema:1, id, name, version, created, updated, beispiel?, standort:{name, lat, lon}, gebiet, datenStand,
  hoehe:{ von:'GND', bis:'FL195', radarOhneGrenze },
  settings:{ adLoc:'kurz'|'icao', allowDigits, free:{ch:'118.000', kurz:'FREE'}, area:{von, bis, radar, marginKm} },
  fixed:{ p00:{on, ch, kurz, klar}, p99:{on, ch, kurz, klar} },
  bloecke:[{ id, name, on, svc:['FIS',…], max:null|n, order:'dist'|'ad'|'corridor'|'freq'|'manual' }],
  eintraege:[{ id, ch, kurz, klar, dienst, block, pos, aktiv, quellen[], vertrauen:'g'|'y'|'r'|'s', note, bestaetigt,
               ort:{icao, iata, code, qual, name}, kurzModus:'kurz'|'icao'|'frei', dist, lage:'gebiet'|'angrenzend'|null, along }] }
```
Die Platznummern werden nicht gespeichert, sondern aus Blöcken und `pos` berechnet (`layout()`).

**Gerät**: `{ id, owner, bezeichnung, aktuell:{ plaetze[100]:{nr, ch, name, klar?, dienst?, block?, kind?}, herkunft:'geschrieben'|'ausgelesen', zeit, configId, configName, version, quittiert, von } }`

## 4 Reihenfolge des Baus

| Version | Inhalt | Abhängig vom Test |
|---|---|---|
| 0.1.0 ✓ | App-Gerüst (Kopfzeile, Navigation, DE/EN, Meldungen), Editor mit lokalem Entwurf, Kurznamen-Regeln, Blöcke, Validierung, A6-Karte | nein |
| 0.2.0 ✓ | Worker + D1 (Konten, Geräte, Konfigurationen), Setup-Workflow, Anleitung für die Secrets | nein |
| 0.3.0 | Gebiet und Vorschlag: Karte (Leaflet/OSM), Ortssuche, Korridor, Frequenzdaten laden und schneiden | nein |
| 0.4.0 | Gerät: Schreiben (Z), Sichern/Auslesen (W) gemäss Testergebnis, Vorschau alt→neu | ja |
| 0.5.0 | Startseite öffentlich, PWA offline, GPS-Hervorhebung, Portal-Eintrag | teilweise |
| 1.0.0 | Abnahme Zürich (A1–A7) | ja |

## 5 Prüfen

- `node tests/codec.test.js`, `node tests/model.test.js`, `node tests/frequencies.test.mjs`
- `node tests/worker.test.mjs` gegen einen lokalen Worker mit leerer Datenbank (SETUP.md, Abschnitt 5)
- `test.html?sim=1` (nachgebildetes Funkgerät); die App erhält denselben Simulationsmodus

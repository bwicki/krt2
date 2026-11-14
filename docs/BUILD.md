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
| 0.3.0 ✓ | Gebiet und Vorschlag: Karte (Leaflet/OSM), Ortssuche, Korridor, Frequenzdaten laden und schneiden | nein |
| 0.4.0 ✓ | Gerät: Schreiben (Z) aller 100 Plätze mit ACK je Platz, Stichprobe am Gerät (R beim Abrufen), Sichern von Hand oder aus Datei (siehe 4b, 4c), Vorschau alt→neu | Test 13.11.2026 |
| 0.5.0 | Startseite öffentlich, PWA offline, GPS-Hervorhebung, Portal-Eintrag | teilweise |
| 1.0.0 | Abnahme Zürich (A1–A7) | ja |

## 4a Gebiet und Vorschlag (0.3.0)

- `src/area.js` (ohne DOM): Kreis um den Startort, Rechteck, Vieleck, Korridor (Mittellinie ab Startort, Breite links/rechts
  je Schenkel, runde Knicke). Lufträume zählen, wenn sie das Gebiet schneiden und im Höhenband liegen (Radar wahlweise
  ohne Obergrenze); Flugplätze, wenn sie im Gebiet oder innerhalb des Rands liegen (Heliports und geschlossene ausgelassen).
- Länderwahl über Gitterzellen 1° je Land im `index.json` (Schema 3).
- Entdoppeln: regionale Dienste (FIS/INFO, APP/ARR/DEP, RDR, ACC, VOLMET) je Kanal und Dienst einmal; Flugplatzdienste je
  Kanal und Flugplatz; Luftraumfrequenz, die schon ein Flugplatz liefert, ergänzt nur die Quellen. Zwei Quellen = grün.
- Kurzname: IATA bzw. drei Buchstaben des Orts (Dübendorf → DUB), Zusatz aus dem Rufnamen (Radar East → ZRHE RDR,
  Radar M3 → ZRH3 RDR); Klartext mit ICAO-Abkürzungen («Birrfeld AD», «Zuerich ATIS DEP»).
- `src/gebiet.js`: Seite mit Leaflet (lib/leaflet 1.9.4), OSM-Kacheln, Ortssuche Nominatim (Auswahlliste), GPX/GeoJSON-Import.

## 4b Ergebnis Machbarkeitstest am Gerät (13.11.2026, test 0.2.0, krt2_test_20261113_2216.txt)

| Schritt | Ergebnis |
|---|---|
| Verbindung | «r» nach ca. 2 s; Funkgerät fragt alle 10 s mit «S», Antwort «x» nach 1–4 ms genügt; danach Statusmeldungen U, A, 2, 3, 4, 1, R, Kanalraster |
| W (nächster Platz) | Gerät blättert sichtbar weiter (Standby-Anzeige), **sendet aber weder ACK noch R**. 15–35 s später meldet es R mit dem alten Standby (Blättern verfällt) |
| Auslesen mit W | **nicht möglich** – keine Rückmeldung; Auslesen per Schnittstelle entfällt |
| Z (Platz schreiben) | ACK nach 27–38 ms; am Gerät sofort sichtbar; Ziffern im Namen («TEST 12») gehen |
| R (Standby setzen) | ACK nach 28–35 ms; 132.505 (8.33) und 123.450 (25 kHz) korrekt angezeigt |
| Abruf am Gerät (MEM, Knopf) | sendet R mit Frequenz und Namen, aber **ohne Platznummer** |

Folgen für 0.4.0: Schreiben ist sicher (ACK je Platz, Wiederholung bei NAK/Zeitablauf). Eine automatische Sicherung
der alten Programmierung gibt es nicht; «Sichern» heisst: am Gerät mit MEM ab Platz 00 Platz für Platz weiterdrehen,
die App zeichnet jede R-Meldung der Reihe nach auf (Platznummer aus der Reihenfolge, Nutzer bestätigt). Ob jeder
Knopfschritt eine R-Meldung erzeugt, ist [likely] (Test 13.11.: zwei Abrufe, zwei Meldungen) und wird vor dem Bau kurz
geprüft. Nach dem Schreiben dient derselbe Mechanismus als Stichprobe: abgerufene Plätze werden mit dem Soll verglichen.
Beim Test wurden die Plätze 97 und 98 mit Testwerten überschrieben (136.975 «TEST», «TEST2»); ihr alter Inhalt ist
nicht gesichert.

Nachtrag zur Auswertung des Protokolls: Beide R-Meldungen vom Abruf kamen 16 ms **vor** einer verspäteten Abfrage «S»
(die fällige Abfrage blieb 1.4 s bzw. 7.6 s aus). Das spricht dafür [likely], dass das Gerät im Speichermodus nicht
abfragt und R erst **beim Verlassen** des Speichermodus sendet (Anleitung S. 23: Rückkehr «nach einigen Sekunden
ohne Bedienung»), nicht bei jeder Raste. Die Anzeige zeigt die Platznummer als `SEL[nn]` (Anleitung S. 23).

**test 0.3.0, Schritt 3 «Speicher von Hand auslesen»** klärt das mit drei Versuchen (nur MEM · MEM + 3 Rasten ·
MEM, Raste, MEM) und liest danach alle 100 Plätze: jede gezählte R-Meldung gilt als nächster Platz; die Nummer aus
`SEL[..]` verankert die Zählung und prüft sie (stimmt eine Kontrolle nicht, werden die Plätze seit der letzten
Kontrolle «unsicher» und sind nachzuholen). Zustandsmeldungen nach «U», doppelte Meldungen innert 0.3 s und (im Modus
«bei jeder Raste») Wiederholungen nach einer Pause zählen nicht. Ergebnis: `krt2_sicherung_hand_<Zeit>.csv/.json`
(typ `krt2-sicherung`, Plätze 0–99 mit Status gelesen/kontrolliert/unsicher/widerspruch/fehlt) – dieselbe Datei
übernimmt 0.4.0 als Ausgangszustand.

**Ergebnis Gerätetest 13.11.2026, 22:49–23:08 (test 0.3.0, krt2_test_20261113_2308.txt)** – korrigiert die Vermutung oben:
- Das Gerät sendet R **bei jeder Raste** im Speichermodus (Versuch 2: 3 Rasten → 3 Meldungen) [certain].
- **MEM allein sendet nichts** (Versuch 1), ein zweites MEM auch nicht (Versuch 3); auch beim Verlassen des
  Speichermodus kommt keine Meldung (nach Platz 03 kam 54 s lang nichts) [certain für dieses Gerät].
- Die Abfrage «S» läuft im Speichermodus weiter (alle 10 s); oft folgt sie 0–16 ms nach einer R-Meldung.
- Tempo von Hand: Median 2.6 s pro Raste, 100 Plätze in knapp 5 Minuten. Keine doppelten Meldungen.
- Fehler in test 0.3.0: die Regel «gleiche Meldung nach ≥ 2 s Pause = Verlassen des Speichermodus» hat 11 echte Plätze
  verworfen (Plätze 89–96 und 99 sind leer und melden alle 136.975 «»). In test 0.3.1 entfernt; die Aufnahme endet
  jetzt von selbst, sobald nach 100 Plätzen die nächste Meldung mit dem schon gelesenen Platz übereinstimmt («Runde
  geschlossen»). Nachgeprüft, indem die 104 echten Meldungen des Tests durch test 0.3.1 gespielt wurden: alle 100 Plätze richtig.
- Schritt 4 vom Test 23:07 wurde **nicht gesendet** (Aufnahme lief noch, Sperre nur im Protokoll vermerkt); die
  Antwort «nein» betrifft also keinen Schreibversuch. Z ist durch den Test vom 13.11. 22:15 belegt (ACK, sichtbar).
- Leere Plätze meldet das Gerät als 136.975 MHz ohne Namen [likely: Grundzustand eines unbenutzten Platzes].

Folgen für 0.4.0: «Gerät sichern» = MEM, eine Raste, Nummer aus SEL eintragen, weiterdrehen bis «Runde geschlossen».

## 4c Gerät (0.4.0)

Dateien: `src/link.js` (Web Serial, Antwort auf «S», ACK, «Z» je Platz mit Quittung und bis zu zwei Wiederholungen,
Simulation), `src/readout.js` (Auslesen von Hand, reine Logik, Test mit der echten Meldefolge vom 13.11.),
`src/geraet.js` (Seite), Texte `gr_*` in `src/i18n.js`, Stil `.gr-*` in `css/app.css`.

- **Verbindung** bleibt beim Seitenwechsel bestehen; «Gerät ●» in der Navigation zeigt sie an. Ohne Web Serial
  (Firefox, Safari, Telefon) bleibt «Adapter verbinden» ohne Wirkung und ein Hinweis erscheint. `?sim=1` zeigt
  «Simulation» (Gerät wie gemessen: R je Raste, MEM und Verlassen ohne Meldung).
- **Gerät:** eigenes Gerät aus dem Konto (Stand auf dem Server, mit Verlauf `device_history`) oder «Gerät ohne Konto»
  (Stand nur im Browser, `krt2.lokal.aktuell`). Nur eine ausdrückliche Wahl wird gemerkt.
- **Sichern:** von Hand (MEM, eine Raste, SEL-Nummer eintragen, weiterdrehen bis «Runde geschlossen») oder aus einer
  Sicherungsdatei (`krt2-sicherung` JSON oder CSV, z. B. `krt2_sicherung_20261113_v2`). Gespeichert wird erst bei
  100 Plätzen; Herkunft `ausgelesen`. Beim ersten Verbinden ohne Stand fragt die App nach (von Hand / aus Datei / ohne).
- **Programmieren:** immer alle 100 Plätze (rund 7 s in der Simulation), Vorschau alt→neu mit Zusammenfassung gleicher
  Nachbarn. Gesperrt ohne Verbindung «r», während des Auslesens, bei roten Befunden oder ungültigen Plätzen.
  Nach drei Fehlschlägen in Folge Abbruch; «Fehlgeschlagene nochmals schreiben». Erst wenn alle 100 quittiert sind,
  wird der Stand gespeichert (Herkunft `geschrieben`, Konfiguration, Version, `quittiert: 100`).
- **Stichprobe:** jede R-Meldung wird mit dem festgehaltenen Stand verglichen («passt zu Platz 12» / «zu keinem»).
- Startseite: «Gerät auslesen und sichern» → `#geraet?sichern`; Editor: «Mit Gerät vergleichen» und
  «Gerät programmieren» → `#geraet?programmieren`.
- Geprüft: `tests/readout.test.js` (119 Prüfungen), Playwright in der Simulation (Auslesen 101 Rasten, Programmieren,
  Fehlschlag und Wiederholung, Stichprobe) und angemeldet gegen den lokalen Worker (Sicherung aus Datei → Server,
  Programmieren → Server, Startseite zeigt «programmiert»). Am echten Gerät noch nicht geschrieben.

**0.4.1 – Sicherung zurückschreiben:** Worker `GET /api/devices/:id/sicherung` liefert den jüngsten Stand mit Herkunft
«ausgelesen» aus `device_history` (öffentlich lesbar wie das Gerät). Die App hält zusätzlich eine Kopie im Browser
(`krt2.sicherung.<Gerät>`) und nimmt die jüngere. Im Block «Sichern und zurückschreiben» schreibt «Sicherung ins Gerät
zurückschreiben» alle 100 Plätze der Sicherung mit derselben Schreibroutine wie das Programmieren (Quittung je Platz,
Wiederholen der Fehlgeschlagenen) und hält danach den Stand fest (Herkunft `geschrieben`, «Sicherung vom …»).
Geprüft: Worker-Test (59 Prüfungen), Playwright angemeldet: Sicherung aus Datei → programmieren → neuer Browser ohne
lokale Kopie → Sicherung vom Server zurückschreiben (mit einem Fehlschlag und Wiederholung) → simuliertes Gerät = Sicherung.

**0.4.2 – Rückmeldungen 14.11.2026:**
- *Weitere feste Plätze* (Einstellungen → Feste Plätze → «Festen Platz hinzufügen»): `cfg.fixed.extra = [{ id, nr 01–98, ch, kurz, klar }]`.
  Die Blöcke laufen um sie herum (`layout`: Bereiche mit `nrs`), Startseite, A6-Karte und Belegungsstreifen zeigen sie unter «Fest».
- *Prio-Liste:* Was im Block keinen Platz mehr hat, ist nach einem Vorschlag abgewählt (`deselectOverflow`, einmalig auch
  beim Laden älterer Entwürfe). Wählt man es wieder an, steht es auf der Prio-Liste: ockerfarbenes Kästchen, Kennzeichen
  «P1, P2 …» statt des umbrechenden Texts, eigene Gruppe nach Platz 99, Hinweis in der Titelzeile «n Freq. auf der
  Prio-Liste – weniger wichtige Freq. abwählen». Wird vorne abgewählt, rückt die erste Prio-Freq. des Blocks nach.
- *Auslesen von Hand:* Die SEL-Nummer darf vor der ersten Raste eingetragen werden (MEM zeigt sie an, meldet aber nichts);
  Eingabehinweise erscheinen nur noch in der Zeile über dem Raster statt als bleibender Hinweis unten rechts, und das
  Nummernfeld bleibt beim Eintreffen von Meldungen stehen.

**0.4.3 – Rückmeldungen 14.11.2026:**
- *Kurznamen:* immer «Ort + Leerzeichen + Dienst», höchstens 8 Zeichen. Häufige Dienste kurz (`SVC_KURZ`): I = INFO, F = FIS,
  T = TWR, R = RDR, RD = RDO, AF = AFIS, AT = ATIS, AR = ARR, D = DEP; die übrigen bleiben (APP, GND, UNIC …). Der Klartext
  bleibt ausgeschrieben (`svcShort`). ICAO-Code ist Vorgabe, wo es einen gibt (`settings.adLoc = 'icao'`, einmalig auch für
  ältere Entwürfe, Merker `icaoDefault`); passt er nicht neben einen vierstelligen Dienst, nimmt die App das Kürzel.
- *Ortskürzel ohne ICAO* (`locCode(name, room)`): der ganze Name, wenn er passt (ZURICH I); sonst ohne Doppelte, dann Vokale
  von hinten weg, der erste Buchstabe bleibt (Birrfeld → BRFLD AF, Lugano → LUGAN AT, Grenchen → GRNCH RD); bei «Bern-Belp»
  zählt der Teil vor dem Bindestrich; mehrere Wörter: jeder Wortanfang zählt, Füllwörter (am, de, la …) fallen weg; Zusatz mit
  Leerzeichen (ZRCH E R). Die Namen werden laufend aus den Teilen gebildet, ältere Entwürfe zeigen sie sofort.
- *Eingabe der Kurznamen* (Editor, feste Plätze, freie Plätze): nur, was das Gerät speichert – Versalien A–Z und Leerzeichen,
  mit Einstellung auch 0–9 und Bindestrich; Kleinbuchstaben werden beim Tippen zu Versalien, Umlaute zu AE/OE/UE, höchstens
  8 Zeichen (`C.cleanNameInput`). Im Speicher des Geräts (13.11.2026) standen nur Versalien, Ziffern und Bindestrich.
- *Doppelte Frequenzen bereinigen* (Editor): eigene Übersicht je Frequenz mit Platz, Kurzname, Klartext und Block; gleich ist
  auch der 25-kHz- und der 8.33-Name desselben Trägers (`freqKey`: 123.550 = 123.555). Häkchen weg = abwählen; Vorschlag
  «je Frequenz nur den ersten behalten» (neben einem festen Platz alle Einträge). Die Prüfung «Frequenz mehrfach» nutzt
  denselben Schlüssel.
- *Konfigurationen:* alle eigenen in einer Liste, höchstens 7 sichtbar, der Rest mit Schieber (Kopf bleibt stehen);
  «Ins Gerät laden» übernimmt die Konfiguration und springt zu «Gerät programmieren».
- *Stichprobe:* «Liste leeren».

**0.4.4 und test 0.3.2 – Antworten 14.11.2026:**
- *Alle Dienste kurz:* zusätzlich A = APP, G = GND, DL = DEL, AP = APN, AC = ACC, VOL = VOLMET (wie im Werksspeicher «GENF VOL»),
  GL = GLD, CT = CTAF, M = MIL, U = UCOM. Damit passt der ICAO-Code neben jeden Dienst; die Ausweichregel bleibt für lange eigene Dienste.
  Ortskürzel: Vokale vorne bleiben, wenn Platz ist (Entscheid: LUGAN AT statt LGN AT).
- *test 0.3.2, Schritt 5b:* schreibt «Test ab» mit Kleinbuchstaben ohne Umwandlung auf Platz 97 (Rohbytes, Prüfsumme unverändert
  MHz xor Kanal); Antwort am Gerät: Kleinbuchstaben / Versalien / falsch.
- *Schritt 5c:* je eine Serie bei Empfang und beim Senden: 10 × Z auf Platz 98 im Abstand 1.5 s, ohne Wiederholung; je Befehl
  Quittung, Antwortzeit und Funkzustand aus den Meldungen J (Empfang), K (Senden), Y/V (Ende). Die Sendetaste drückt der Benutzer
  selbst, nur mit Antenne oder Kunstlast. Schritt 7 stellt 97 und 98 wie bisher zurück.

## 5 Prüfen

- `node tests/codec.test.js`, `node tests/model.test.js`, `node tests/frequencies.test.mjs`
- `node tests/area.test.mjs [freq-ch.json]` (Formen, Höhenband, Rufnamen; mit Datendatei Vorschlag um Zürich)
- `node tests/worker.test.mjs` gegen einen lokalen Worker mit leerer Datenbank (SETUP.md, Abschnitt 5)
- `test.html?sim=1` (nachgebildetes Funkgerät); die App erhält denselben Simulationsmodus

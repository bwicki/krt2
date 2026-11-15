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

**0.4.5 – Antworten 14.11.2026:**
- *Dienstkürzel in den Einstellungen:* Einstellungen → Dienste, Feld neben jedem Dienst (höchstens 4 Zeichen, leer = Vorgabe);
  gespeichert nur die Abweichungen in `settings.svcKurz`, eigene Kürzel ocker umrandet, Hinweis bei doppelt vergebenem Kürzel,
  «Kürzel auf Vorgabe». `layout()` setzt die Kürzel der Konfiguration (`setSvcKurz`), die Kurznamen ändern sich sofort.
- *test.html:* Skripte und Stile mit `?v=` (Schritt 5b fehlte nach dem Hochladen im Zwischenspeicher des Browsers).
- *Bluetooth:* Chrome auf Android spricht seit Version 137 serielle Bluetooth-Classic-Geräte (SPP/RFCOMM) über Web Serial an –
  dieselbe Schnittstelle wie am Laptop; Web Bluetooth kann nur BLE. Kandidat: diymore RS232-Bluetooth-Adapter (HC-05, MAX3232, DB9).

**Gerätetest 14.11.2026, 20:11–20:17 (test 0.3.2), Ergebnisse:**
- Schritt 4/5: Z auf Platz 98 und 97 je ACK nach 32 ms, Ziffern werden angezeigt.
- Schritt 5b: «Test ab» mit Kleinbuchstaben → ACK nach 33 ms, das Gerät zeigt die Kleinbuchstaben an.
- Schritt 5c nicht auswertbar: 20:16:02.8 meldet das Gerät V, F, K (Sender ein); danach kommt keine einzige Meldung mehr
  (die Abfrage «S» um 20:16:10 fehlt, kein Y). Der erste Schreibbefehl der Serie um 20:16:13 bleibt ohne Antwort, der zweite
  scheitert mit «The device has been lost». Der USB-RS232-Adapter ist beim Senden ausgefallen; vermutlich HF-Einstrahlung in
  Adapter oder Kabel. Die folgenden Serien liefen auf den verlorenen Anschluss.

**Gerätetest 14.11.2026, 20:41–20:44 (test 0.3.3, Laptop am Akku, Wendelantenne am Gerät):**
- Schreiben während Empfang: 4 Serien, 40 von 40 Befehlen quittiert (24–44 ms), 35 davon während einer Empfangsmeldung (J … V).
  Kein Unterbruch im Ton.
- «Senden beobachten»: 2 Aussendungen (rund 5 und 6 s), K und Y gemeldet, Abfragen «S» liefen weiter (grösste Lücke 10.1 s).
- Serie beim Senden: Befehle 1–2 vor der Aussendung quittiert; K um 20:44:19.813; Befehl 3 während der Aussendung nach 34 ms
  quittiert; Befehl 4 um 20:44:21.998 ohne Antwort, danach «The device has been lost», kein Y. Letzte Meldung 20:44:20.485.
- Bilanz: Schreiben während Empfang geht, Schreiben während Senden ging einmal; der USB-Adapter fiel in 2 von 4 Aussendungen
  aus, einmal ganz ohne Schreibbefehl (20:16:02.8) – die Aussendung stört die USB-Verbindung, nicht das Schreiben.

**0.4.6 und test 0.3.3:**
- *Kleinbuchstaben im Kurznamen:* Codec behält a–z (Umlaute ä → ae), Einstellung «Kleinbuchstaben erlauben»
  (`settings.allowLower`, Vorgabe an); aus = Eingabe und Gerät in Versalien (`deviceSlots`). Automatische Namen bleiben in Versalien.
- *Verbindungsverlust:* Lese- oder Schreibfehler «device has been lost» und das Ereignis `disconnect` schliessen den Anschluss
  mit Ursache und Zeit der letzten Meldung (App und Testseite).
- *test 0.3.3:* Funkstille-Wächter (25 s ohne «S» → Meldung, mit Hinweis auf ein vorausgehendes K); «Senden beobachten» (30 s
  ohne Schreiben: K/Y, Abfragen «S», grösste Lücke, Verlust); Serien starten nicht bei Funkstille und die Empfangsserie nicht,
  solange das Gerät «Sender ein» ohne Ende meldet; Simulation `?sim=1&tx=verlust`.

**0.5.0 – Phase 2 des Konzepts (Handy, Bluetooth, Robustheit):**
- *Nie während Senden schreiben:* `Link.command` wartet bei «Sender ein» (K) bis «Ende» (Y) plus 300 ms (höchstens 60 s);
  beginnt eine Aussendung während des Wartens auf die Quittung, zählt der Versuch nicht. Die Seite zeigt «wartet – Gerät sendet».
- *Wiederaufnahme:* Lese-/Schreibfehler «device has been lost», das Ereignis `disconnect` oder 25 s ohne «S» (einmalig, falls
  das Gerät nur aus ist) schliessen den Anschluss und öffnen ihn während 120 s alle 3 s neu (`navigator.serial.getPorts`,
  gleiches Gerät nach USB-Kennung oder Bluetooth-Dienst). `program()` pausiert beim betroffenen Platz und schreibt nach der
  Wiederaufnahme dort weiter («pausiert – wartet auf die Verbindung»). «Trennen» von Hand beendet die Wiederaufnahme.
- *Bildschirm wach halten* (Wake Lock), solange verbunden; nach der Rückkehr in den Vordergrund neu angefordert.
- *Handy-Ansicht* (bis 600 px): Navigation waagrecht scrollbar, Knöpfe mindestens 44 px, Verbinden und Programmieren über die
  ganze Breite, Spalte «heute im Gerät» der Vergleichstabelle ausgeblendet; Android-Hinweis zum Koppeln des Bluetooth-Moduls.
- *Simulation:* «Senden 5 s» und «Verbindung 10 s weg» auf der Seite Gerät (`?sim=1`); `tests/link.test.js` prüft Sende-Pause,
  Verlust, Wiederaufnahme und Fortsetzen beim selben Platz.
- Die Abfrage «S» läuft auch im Speichermodus weiter (13.11.2026) – der Funkstille-Wächter stört das Auslesen von Hand nicht.

**0.5.1:** Editor – beim Ziehen eines Eintrags rollt die Liste am oberen und unteren Fensterrand mit (90 px Randzone,
je näher am Rand, desto schneller), damit Einträge über die sichtbare Strecke hinaus verschoben werden können.

**0.5.2 – nur eindeutige 8.33-Kanalnamen vorschlagen (Rückmeldung 14.11.2026):**
- Vorschläge nehmen eine Frequenz nur, wenn sie ein gültiger Kanalname im 8.33-Raster ist und eindeutig: von openAIP (führt
  Kanalnamen, z. B. 125.255) oder von OurAirports nur dann, wenn der Wert nicht auf dem 25-kHz-Raster liegt und drei
  Nachkommastellen hat (bzw. aus einer echten Frequenz umgerechnet ist). OurAirports-Werte auf dem 25-kHz-Raster können die
  Trägerfrequenz des 8.33-Kanals +5 sein (125.250 ↔ 125.255), Werte mit zwei Nachkommastellen gerundet – beide bleiben weg
  (`M.ambiguous833`, Zähler `stats.unconfirmed` in der Gebietsstatistik). Europaweit betrifft das 1927 von 12 260 Angaben;
  im Kreis 25 km um Zürich 12, u. a. 133.900 «Radar East», 125.325, 135.225, 125.950, 134.600 (nur OurAirports).
- Ältere Einträge aus solchen Werten zeigt die Prüfung gelb: «8.33-Kanal nicht gesichert (nur OurAirports …)».
- Der Hinweis «OurAirports: … (25-kHz-Angabe derselben Frequenz)» entfällt.
- 25-kHz-Kanalnamen von openAIP (z. B. 124.700 Zurich Information) bleiben: sie sind im 8.33-Raster gültige Kanäle.

**0.6.0 – Phase 3: Vorschläge im Flug (Rückmeldung 14.11.2026):**
- Vorschläge nur noch aus openAIP (Entscheid Benutzer: «am besten stützt Du Dich auf openAIP ab»). Eine Frequenz kommt nur
  in Frage, wenn sie ein gültiger 8.33-Kanalname ist (`M.freqKey`) und `src` «oaip» enthält; Lufträume ohne openAIP-Angabe
  zählen als «nicht bestätigt» (`stats.unconfirmed`). 25-kHz-Kanalnamen wie 124.700 bleiben gültig.
  Folge: europaweit fallen 2521 von 9335 Flugplatz-Angaben weg (nur OurAirports); um Zürich die neun Sektoren von
  Zurich Radar (M1–M6, North, West, East) und Approach East/Final. openAIP führt dort an Radar nur ALPS RADAR (119.175,
  119.225, 119.925) und MIL RADAR (135.480); ZUERICH TERMINAL 127.755 ist APP (Block APP/TWR). Test 14.11.: Sektor ab
  Zürich nach Osten → RADAR 1 Kandidat.
- Prüfung im Editor: «nicht833» (gelb) heisst jetzt «Quelle nicht openAIP»; eigene Einträge («eigen») sind ausgenommen.
- Neue Seite «Im Flug» (`#flug`, `src/flugui.js`, Logik in `src/flug.js`, Tests `tests/flug.test.js`):
  Funkgerät verbinden (Bluetooth oder USB, wie «Gerät»), GPS (`watchPosition`, 20 min Verlauf), Richtung aus der Trajektorie
  (mind. 300 m, höchstens 10 min zurück) oder von Hand, Vorausschau-Sektor (Spitze am Standort, ±Winkel, Distanz; ohne
  Richtung Kreis), je Block «Vorschlag holen» → Tabelle alt/neu/km → «n Plätze schreiben» mit Bestätigung. Frequenzen, die
  im Block schon stehen, behalten ihren Platz; Frequenzen, die ausserhalb des Blocks im Gerät stehen, werden übersprungen;
  Plätze ohne Ersatz bleiben unverändert. Schreiben über `Link.program` (wartet beim Senden, pausiert bei Verbindungsverlust).
- Einstellungen «Im Flug: Vorausschau»: halber Öffnungswinkel (Vorgabe 40°, 5–90°), Distanz (Vorgabe 100 km, 10–300 km),
  Blöcke mit Vorschlägen (Vorgabe INFO und RADAR) – `settings.flug`, bereinigt durch `M.flugOf`.
- Gerätestand: Kopie je Server-Gerät im Browser (`krt2.aktuell.<id>`); ohne Netz geschrieben → «pending», wird beim
  nächsten Kontakt mit dem Server nachgeliefert (`GR.storeAktuell` liefert dann 'offline').
- Fluglog (`krt2.fluglog`, höchstens 1000 Zeilen): Zeit, Position, Block, Platz, alt, neu, Klartext, quittiert; CSV.
- Ohne Netz: `sw.js` (Service Worker) – App und Frequenzdaten zuerst aus dem Netz, nach 4 s oder ohne Netz aus dem Cache.
  «Für den Flug vorbereiten» lädt die Länderdateien für max(300 km, 2 × Distanz) um die Position (um Zürich 9 Länder).
  Nicht im Cache: API, Kartenkacheln, Schriften.
- Bildschirm bleibt wach, solange GPS läuft (Wake Lock); ohne sichtbaren Bildschirm liefert Chrome keine Positionen.

**0.6.1 – Flugplätze heissen AD, nur VFR (Rückmeldung 15.11.2026):**
Vorgabe Benutzer: «primär VFR-Frequenzen im Gerät, ausser einzelnen Radarfrequenzen keine IFR-Frequenzen … Flugplätze
nicht mit INFO klassifizieren, sondern mit AD».
- Neuer Dienst AD (Kürzel AD, z. B. «LSPH AD», «EDTZ AD»). AD wird ein Flugplatz-Dienst:
  - Frequenzen eines Flugplatzes vom Typ Radio, Info, AFIS, CTAF oder Unicom, deren Rufname zum Platz passt
    (z. B. «Konstanz Info», «Birrfeld Radio», «Aurillac Information»);
  - Lufträume eines Flugplatzes (RMZ, TMZ, ATZ, MATZ, HTZ, TIZ, TIA) mit Info/AFIS-Frequenz, z. B. «RMZ EDTM → Mengen
    Information» → «EDTM AD»; steht der ICAO-Code im Luftraumnamen, kommen Name und Code vom Flugplatz;
  - jede RADIO-Frequenz aus einem Luftraum.
  Regionale FIS bleibt INFO/FIS (Zurich, Langen, Geneva Information – auch wenn sie bei einem Flugplatz steht).
  «Glider Info» und «Segelflug» sind GLD, nicht INFO.
- Blöcke (Vorgabe): INFO = FIS, INFO; neu AD = AD, AFIS, RDO (nach Distanz), direkt nach INFO. Im Flug: INFO, AD, RADAR.
- Nur VFR (Einstellung «Nur VFR-Frequenzen vorschlagen», Vorgabe an): ACC, ARR, DEP, DEL, GND, APN und VOLMET kommen
  nicht in Vorschläge (Gebiet und im Flug), werden aber gezählt. Radar (RDR, MIL), APP, TWR und ATIS bleiben. Auf der
  Seite «Gebiet» sind die IFR-Dienste ausgegraut mit Hinweis «(IFR)».
- Einmalige Umstellung bestehender Konfigurationen (`adKlasse`): Dienst AD in die Liste; Block AD nach dem Block, der
  RDO/AFIS enthielt (dort fallen RDO und AFIS weg); Vorschläge mit RDO, AFIS, CTAF, UCOM oder INFO mit ICAO-Code des
  Platzes werden AD und wandern in den Block AD; Kurznamen neu (ausser von Hand gesetzte); eigene Einträge bleiben;
  im Flug kommt AD dazu, wo INFO gewählt war.
- Kurzname von FIS/INFO immer mit dem Ort («ZURICH F»), nie mit einem ICAO-Code.

**0.6.2 – Antworten 15.11.2026:**
- APP gilt als IFR («Ballone benützen keine Flugplätze») und kommt mit «nur VFR» nicht mehr in Vorschläge; ATIS bleibt.
  IFR-Liste: APP, ACC, ARR, DEP, DEL, GND, APN, VOLMET.
- TWR und AD bleiben getrennt: TWR = besetzte Verkehrsregelstelle (Block APP/TWR), AD = Platzfunk bzw. Blindverkehr.
- Block RADAR höchstens 10 Plätze (Vorgabe; einmalige Umstellung `radar10` setzt bestehende RADAR-Blöcke ohne oder mit
  höherer Grenze auf 10, eine kleinere eigene Grenze bleibt).
- Im Flug: Plätze ohne Ersatz werden FREE (118.000 «FREE» aus den Einstellungen) und bleiben im Block; schon freie
  Plätze werden nicht neu geschrieben.
- «Zurich Radar» (OurAirports M1–M6 usw.) nicht übernommen – nach Angabe Benutzer gibt es das nicht mehr; openAIP führt es
  ohnehin nicht.

## 5 Prüfen

- `node tests/codec.test.js`, `node tests/model.test.js`, `node tests/link.test.js`, `node tests/flug.test.js`, `node tests/frequencies.test.mjs`
- `node tests/area.test.mjs [freq-ch.json]` (Formen, Höhenband, Rufnamen; mit Datendatei Vorschlag um Zürich)
- `node tests/worker.test.mjs` gegen einen lokalen Worker mit leerer Datenbank (SETUP.md, Abschnitt 5)
- `test.html?sim=1` (nachgebildetes Funkgerät); die App erhält denselben Simulationsmodus

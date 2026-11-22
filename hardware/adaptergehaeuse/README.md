# Gehäuse für das USB-RS232-Board EXSYS EX-13101 (v6, Griffrillen, stehend gedruckt, verklebt)

Zwei Hälften, stehend gedruckt (Kabelende unten, PLA, 0.08 mm Schicht), ohne Stützen, verklebt – ohne Kabelbinder.
Erzeugt mit `python3 gehaeuse.py [Lücke] [Kabel-Ø] [--liegend] [--probe]` (Vorgabe 2.1 mm, Kabel 4.9 mm; braucht
`manifold3d`, `numpy`). Die STL liegen stehend; `--liegend` legt die Schnittfläche nach unten wie bei v5.
Verdrahtung, Druck und Montage: `ex13101_gehaeuse_anleitung_v6_20261122.docx`.

## Verdrahtung (Sensorleitung vom Binder-Stecker der ART-36A, am Gerät erprobt 22.11.2026)

| Ader | Signal | Lötpunkt | Wo |
|---|---|---|---|
| weiss | TX-Remote, vom Funkgerät | 9 RXD | Oberseite «RX» |
| blau | RX-Remote, zum Funkgerät | 7 TXD | Oberseite «T» |
| schwarz | Masse | 1 GND | Unterseite, unter «C» |
| 4. Ader | – | keiner | abschneiden, isolieren |

Alle anderen Lötpunkte frei, besonders 2 VCC. Prüfkabel aus Projekt 024: gelb statt weiss, grün statt blau.
Vorher messen: Board im USB, Lötpunkt «T» gegen GND **deutlich negativ, −5 bis −7 V** (RS-232-Pegelwandler vorhanden;
gemessen −6.89 V). Zeigt er +3.3 V oder +5 V, hat das Board Logikpegel und darf nicht ans KRT2. Kabel am eingeschalteten
Funkgerät, lose: weiss gegen schwarz etwa −5.5 V, blau etwa 0 V.

## Gehäuse

- Board nach Messung vom 22.11.2026: Blechmantel 15.03 × 12.0 × 4.6 mm, Lücke 2.1 mm, Haltezähne 2.11 mm,
  Platine 21.1 × 11.03 mm.
- Halt: Querrippe in der oberen Hälfte in der Lücke zwischen Mantel-Hinterkante und Haltezähnen (1.8 mm dick,
  0.15 mm Spiel je Seite, berührt die Platine nicht). Hinter den Zähnen Kanal in Platinenbreite (11.43 mm).
- Aussen 43.3 × 18.8 × 15.8 mm (vorne 16.4 × 9.0 mm), je Hälfte 3.0 cm³; Klebefläche 265 mm² je Hälfte.
- Form: Längskanten gerundet (vorne R 1.5, Griffteil R 2.0), 45°-Übergang, 0.6-mm-Fasen an beiden Enden;
  7 umlaufende V-Griffrillen (0.6 mm tief, 45°, Teilung 2.5 mm) auf dem Griffteil.
- Kammer 14 × 11 mm über den Lötpunkten (ab 5 mm vor der Platinen-Hinterkante), vorne 45°-Trichter in den Kanal.
- Ausrichtung: vorne der Blechmantel und die Rippe, hinten zwei Passstifte aus 1.75-mm-Filament (5.5 mm lang).
- Zugentlastung: drei Klemmrippen Ø 4.2 mm im Kanal Ø 5.2 mm (Kabel Ø 4.9 mm).
- Stehend gedruckt hängen alle Flächen höchstens 45° über, ausser Querrippe (1.5 mm), Klemmrippen (0.5 mm) und den
  Passstiftbohrungen (Ø 2 mm).
- PLA: kein Aceton (verschweisst nur ASA); PLA wird ab etwa 55–60 °C weich – wo es heiss wird, in ASA drucken.

Sitz der Querrippe am v5-Probestück bestätigt (22.11.2026): Die Lücke liegt längs zwischen Mantel und Zähnen.
`--probe` erzeugt das Probestück (vordere 12 mm der oberen Hälfte) bei Bedarf neu.
Annahmen: Die Platine liegt ungefähr in der Mantelmitte; die Zähne ragen mindestens 1 mm über die Platine.
Frühere Stände: v5 wie v6 ohne Rillen und Rundungen, Kabel 4.7 mm, liegend gedruckt; v4 verklebt mit geschätzter Platinenlänge 21 mm und Anschlägen hinter der Platine; v3 mit
Kabelbindern (Git-Verlauf); v1/v2 waren fehlerhaft geschriebene STL.

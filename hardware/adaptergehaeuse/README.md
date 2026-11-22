# Gehäuse für das USB-RS232-Board EXSYS EX-13101 (v5, Querrippe, verklebt)

Zwei Hälften, je mit der flachen Schnittfläche nach unten gedruckt, ohne Stützen, verklebt – ohne Kabelbinder.
Erzeugt mit `python3 gehaeuse.py [Lücke] [Kabel-Ø]` (Vorgabe 2.1 mm, Kabel 4.7 mm; braucht `manifold3d`, `numpy`).
Verdrahtung, Druck und Montage: `ex13101_gehaeuse_anleitung_v5_20261122-02.docx`.

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
- Aussen 43.3 × 18.8 × 15.8 mm (vorne 16.4 × 9.0 mm), je Hälfte 3.1 cm³; Klebefläche 272 mm² je Hälfte.
- Kammer 14 × 11 mm über den Lötpunkten (ab 5 mm vor der Platinen-Hinterkante).
- Ausrichtung: vorne der Blechmantel und die Rippe, hinten zwei Passstifte aus 1.75-mm-Filament (5.5 mm lang).
- Zugentlastung: drei Klemmrippen Ø 4.0 mm im Kanal Ø 5.0 mm (Kabel Ø 4.7 mm).
- `…_probe_…stl`: die vorderen 12 mm der oberen Hälfte, prüft den Sitz der Rippe vor dem ganzen Druck.

Sitz der Querrippe am Probestück bestätigt (22.11.2026): Die Lücke liegt längs zwischen Mantel und Zähnen.
Annahmen: Die Platine liegt ungefähr in der Mantelmitte; die Zähne ragen mindestens 1 mm über die Platine.
Frühere Stände: v4 verklebt mit geschätzter Platinenlänge 21 mm und Anschlägen hinter der Platine; v3 mit
Kabelbindern (Git-Verlauf); v1/v2 waren fehlerhaft geschriebene STL.

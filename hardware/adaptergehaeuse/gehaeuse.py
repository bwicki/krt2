"""Gehäuse für das USB-RS232-Board EXSYS EX-13101 (FT232RL) am Prüfkabel zur Binder-Buchse der ART-36A.

v4 (21.11.2026): ohne Kabelbinder. Die zwei Hälften (Schnitt in der Platinenebene) werden verklebt:
- breitere Wände (vorne 2.0 mm, Kammer 2.4 mm; v3 1.6 mm) und längere Quer- und Austrittswände geben 264 mm² Klebefläche
  je Hälfte (v3: 160 mm²);
- ausgerichtet werden die Hälften vorne vom USB-Stecker selbst (liegt in beiden Hälften) und hinten von zwei Passstiften
  aus Filament (Ø 1.75 mm, 5.5 mm lang) in Bohrungen Ø 2.0 mm;
- Zugentlastung: drei Klemmrippen im Kabelkanal drücken den Kabelmantel zusammen, sobald die Hälften verklebt sind.
  Zug am Kabel geht über die Rippen auf das Gehäuse und über zwei Anschläge hinter der Platinen-Hinterkante auf die
  Platine und den USB-Stecker – nicht auf die Lötstellen.
Beide Hälften werden mit der Schnittfläche nach unten gedruckt (flache Klebefläche auf der Druckplatte), ohne Stützen.

Masse in mm. x = Längsachse (0 = Vorderkante, zeigt zum USB-Stecker), y = Breite, z = Höhe (0 = Platinenebene).
Aufruf: python3 gehaeuse.py [Platinenlänge hinter dem Stecker] [Kabel-Ø aussen]
"""
import sys
import numpy as np
from manifold3d import Manifold

VERSION = 'v4'   # v4 = verklebt, ohne Kabelbinder (v3: zwei Kabelbinder aussen, einer als Zugentlastung)
P = dict(
    pcb_hinten=21.0,   # Platinenlänge hinter dem Blechmantel des USB-Steckers (geschätzt aus Datenblattfoto – nachmessen!)
    ueberlapp=3.0,     # Gehäuse überdeckt so viel vom Blechmantel
    pcb_b=12.0,        # Platinenbreite = Steckerbreite (Datenblatt 12.00)
    pcb_h=4.6,         # Bauhöhe Stecker/Platine (Datenblatt 4.60)
    spiel=0.2,         # Spiel je Seite
    wand=2.0,          # Wand vorne über Platine und Stecker (v3: 1.6)
    wand_k=2.4,        # Wand um die Kammer (v3: 1.6)
    quer_l=3.0,        # Querwand an der Platinen-Hinterkante (mehr Klebefläche; v3: 1.6)
    kammer_l=11.0,     # Kammer für Lötstellen und Drahtbogen (v3: 14 mit Platz für den Kabelbinder)
    kammer_b=14.0, kammer_h=11.0,
    austritt_l=7.0,    # Austrittswand mit Klemmrippen (v3: 3)
    kabel_d=4.7,       # Aussendurchmesser des Kabels (Balthasar, 14.11.2026)
    kanal_plus=0.3,    # Kanal zwischen den Rippen = Kabel + 0.3
    rippe_minus=0.7,   # Rippen = Kabel − 0.7 → je Seite 0.35 mm Pressung in den Mantel
    rippe_l=1.0, rippen=3,
    anschlag_b=2.0, anschlag_l=1.0, anschlag_h=1.2,  # Anschläge hinter der Platinen-Hinterkante (in Platinenebene)
    stift_d=2.0,       # Bohrung für Passstift aus 1.75-mm-Filament
    stift_t=3.0,       # Bohrtiefe je Hälfte → Stift 5.5 mm lang
)
if len(sys.argv) > 1: P['pcb_hinten'] = float(sys.argv[1])
if len(sys.argv) > 2: P['kabel_d'] = float(sys.argv[2])


def box(x0, x1, y0, y1, z0, z1):
    return Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0])


def zyl_x(x0, laenge, d):
    """Zylinder entlang x ab x0."""
    return Manifold.cylinder(laenge, d / 2, d / 2, 64).rotate([0, 90, 0]).translate([x0, 0, 0])


def masse():
    s, w, wk = P['spiel'], P['wand'], P['wand_k']
    F = P['ueberlapp'] + P['pcb_hinten']          # Platinen-Hinterkante
    K0 = F + P['quer_l']                           # Kammer beginnt hinter der Querwand
    K1 = K0 + P['kammer_l']
    L = K1 + P['austritt_l']
    cb, ch = P['pcb_b'] + 2 * s, P['pcb_h'] + 2 * s
    kb, kh = P['kammer_b'], P['kammer_h']
    return dict(F=F, K0=K0, K1=K1, L=L, cb=cb, ch=ch, kb=kb, kh=kh, w=w, wk=wk)


def stifte():
    m = masse()
    # nur hinten in der Austrittswand: vorne richtet der USB-Stecker die Hälften aus, und neben dem Durchlass der
    # Querwand bliebe um eine Bohrung nur 0.5 mm Wand
    ya = P['kabel_d'] / 2 + 3.6
    return [(m['K1'] + P['austritt_l'] / 2, sgn * ya) for sgn in (-1, 1)]


def gehaeuse():
    m = masse()
    F, K0, K1, L, cb, ch, kb, kh, w, wk = (m[k] for k in ('F', 'K0', 'K1', 'L', 'cb', 'ch', 'kb', 'kh', 'w', 'wk'))
    aussen = box(0, F, -(cb / 2 + w), cb / 2 + w, -(ch / 2 + w), ch / 2 + w) + \
        box(F, L, -(kb / 2 + wk), kb / 2 + wk, -(kh / 2 + wk), kh / 2 + wk)
    innen = box(-1, K0 + 0.01, -cb / 2, cb / 2, -ch / 2, ch / 2) + box(K0, K1, -kb / 2, kb / 2, -kh / 2, kh / 2)
    # Kabelkanal durch die Austrittswand, mit Klemmrippen: Kanal Kabel + 0.3, Rippen Kabel − 0.7
    kanal = zyl_x(K1 - 1, P['austritt_l'] + 2, P['kabel_d'] + P['kanal_plus'])
    teil = aussen - innen - kanal
    n, rl = P['rippen'], P['rippe_l']
    teilung = P['austritt_l'] / (n + 1)
    for i in range(n):
        x0 = K1 + teilung * (i + 1) - rl / 2
        ring = zyl_x(x0, rl, P['kabel_d'] + P['kanal_plus'] + 0.02) - zyl_x(x0 - 0.1, rl + 0.2, P['kabel_d'] - P['rippe_minus'])
        teil += ring
    # Anschläge hinter der Platinen-Hinterkante (im Durchlass der Querwand), nur in Platinenebene:
    # sie überdecken die Platinenecken um 1 mm, die Drähte laufen darüber und darunter durch
    ax0 = F + 0.2
    for sgn in (-1, 1):
        y_in, y_w = sgn * (P['pcb_b'] / 2 - 1.0), sgn * (cb / 2 + 0.01)
        teil += box(ax0, ax0 + P['anschlag_l'], min(y_in, y_w), max(y_in, y_w), -P['anschlag_h'] / 2, P['anschlag_h'] / 2)
    # Bohrungen für die Passstifte, je Hälfte stift_t tief
    for (x, y) in stifte():
        teil -= Manifold.cylinder(2 * P['stift_t'], P['stift_d'] / 2, P['stift_d'] / 2, 48).translate([x, y, -P['stift_t']])
    return teil, L


def haelften():
    teil, L = gehaeuse()
    big = 200
    oben = teil ^ box(-big, big, -big, big, 0, big)
    unten = teil ^ box(-big, big, -big, big, -big, 0)
    # beide mit der Schnittfläche (z = 0) nach unten auf die Druckplatte: Innenraum nur als kurze Brücken, keine Stützen
    return oben, unten.rotate([180, 0, 0]), L


def write_stl(m, path):
    mesh = m.to_mesh()
    v = np.asarray(mesh.vert_properties)[:, :3]
    f = np.asarray(mesh.tri_verts)
    tri = v[f]
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n /= np.linalg.norm(n, axis=1)[:, None] + 1e-12
    with open(path, 'wb') as fh:
        fh.write(('EX-13101 Gehaeuse ' + VERSION).encode('ascii')[:80].ljust(80, b' '))   # Kopf genau 80 Byte
        fh.write(np.uint32(len(f)).tobytes())
        rec = np.zeros(len(f), dtype=[('n', '<f4', 3), ('v', '<f4', (3, 3)), ('a', '<u2')])
        rec['n'] = n; rec['v'] = tri
        fh.write(rec.tobytes())


if __name__ == '__main__':
    teil, L = gehaeuse()
    print('Klebefläche je Hälfte %.0f mm2' % teil.slice(0.0).area())
    oben, unten, L = haelften()
    tag = f"{VERSION}_pcb{P['pcb_hinten']:g}_kabel{P['kabel_d']:g}"
    for name, m in (('oben', oben), ('unten', unten)):
        bb = m.bounding_box()
        print(name, 'Volumen %.2f cm3' % (m.volume() / 1000), 'Masse x %.1f y %.1f z %.1f' % (bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]),
              'z von %.2f bis %.2f' % (bb[2], bb[5]), 'Gattung', m.genus())
        write_stl(m.translate([0, 0, -bb[2]]), f'ex13101_gehaeuse_{name}_{tag}.stl')
    mm = masse()
    print('Länge %.1f; vorne %.1f x %.1f; Kammer aussen %.1f x %.1f' % (L, mm['cb'] + 2 * mm['w'], mm['ch'] + 2 * mm['w'], mm['kb'] + 2 * mm['wk'], mm['kh'] + 2 * mm['wk']))
    print('Stifte', [(round(x, 1), round(y, 1)) for x, y in stifte()])

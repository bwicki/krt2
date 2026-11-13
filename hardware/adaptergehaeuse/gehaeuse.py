"""Gehäuse für das USB-RS232-Board EXSYS EX-13101 (FT232RL) am Prüfkabel zur Binder-Buchse der ART-36A.

Zwei Hälften (Schnitt in der Platinenebene), je mit der Schnittfläche nach unten gedruckt, ohne Stützen.
Zugentlastung: ein kleiner Kabelbinder (2.5 mm) wird um das Kabel gezogen und liegt in der Kammer vor der
Austrittswand; Zug am Kabel geht über den Binder auf das Gehäuse und über zwei Anschläge hinter der Platinen-
Hinterkante auf die Platine und den USB-Stecker – nicht auf die Lötstellen. Zusammengehalten mit zwei
Kabelbindern in den Aussennuten.

Masse in mm. x = Längsachse (0 = Vorderkante, zeigt zum USB-Stecker), y = Breite, z = Höhe (0 = Platinenebene).
Aufruf: python3 gehaeuse.py [Platinenlänge hinter dem Stecker] [Kabel-Ø]
"""
import sys
import numpy as np
from manifold3d import Manifold, Mesh

VERSION = 'v1'
P = dict(
    pcb_hinten=21.0,   # Platinenlänge hinter dem Blechmantel des USB-Steckers (geschätzt aus Datenblattfoto)
    ueberlapp=3.0,     # Gehäuse überdeckt so viel vom Blechmantel
    pcb_b=12.0,        # Platinenbreite = Steckerbreite (Datenblatt 12.00)
    pcb_h=4.6,         # Bauhöhe Stecker/Platine (Datenblatt 4.60)
    spiel=0.2,         # Spiel je Seite
    wand=1.6,
    kammer_l=14.0,     # Kammer für Lötstellen, Drahtbogen und Kabelbinder
    kammer_b=14.0, kammer_h=11.0,
    austritt_l=3.0,    # Austrittswand
    kabel_d=6.0,       # Kanal für das Kabel (Kabel bis knapp 6 mm)
    anschlag_b=2.0, anschlag_l=1.0, anschlag_h=1.2,  # Anschläge hinter der Platinen-Hinterkante (in Platinenebene)
    nut_b=3.0, nut_t=0.6,  # Nuten für die Kabelbinder aussen
)
if len(sys.argv) > 1: P['pcb_hinten'] = float(sys.argv[1])
if len(sys.argv) > 2: P['kabel_d'] = float(sys.argv[2])


def box(x0, x1, y0, y1, z0, z1):
    return Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0])


def gehaeuse():
    s, w = P['spiel'], P['wand']
    F = P['ueberlapp'] + P['pcb_hinten']          # Platinen-Hinterkante liegt bei x = F
    cb, ch = P['pcb_b'] + 2 * s, P['pcb_h'] + 2 * s  # Hohlraum vorne
    K0, K1 = F + w, F + w + P['kammer_l']        # Kammer hinter einer Wand (Dicke w) an der Platinen-Hinterkante
    L = K1 + P['austritt_l']
    kb, kh = P['kammer_b'], P['kammer_h']
    aussen = box(0, F, -(cb / 2 + w), cb / 2 + w, -(ch / 2 + w), ch / 2 + w) + \
        box(F, L, -(kb / 2 + w), kb / 2 + w, -(kh / 2 + w), kh / 2 + w)
    innen = box(-1, K0 + 0.01, -cb / 2, cb / 2, -ch / 2, ch / 2) + \
        box(K0, K1, -kb / 2, kb / 2, -kh / 2, kh / 2) + \
        Manifold.cylinder(P['austritt_l'] + 2, P['kabel_d'] / 2, P['kabel_d'] / 2, 64).rotate([0, 90, 0]).translate([K1 - 1, 0, 0])
    teil = aussen - innen
    # Anschläge hinter der Platinen-Hinterkante (im Durchlass der Kammerwand), nur in Platinenebene:
    # sie überdecken die Platinenecken um 1 mm, die Drähte laufen darüber und darunter durch
    ax0 = F + 0.2
    for sgn in (-1, 1):
        y_in, y_w = sgn * (P['pcb_b'] / 2 - 1.0), sgn * (cb / 2 + 0.01)
        teil += box(ax0, ax0 + P['anschlag_l'], min(y_in, y_w), max(y_in, y_w), -P['anschlag_h'] / 2, P['anschlag_h'] / 2)
    # Aussennuten für Kabelbinder: vorne über der Platine, hinten über der Kammer
    for (xa, hb, hh) in ((F * 0.45, cb / 2 + w, ch / 2 + w), (K0 + P['kammer_l'] * 0.45, kb / 2 + w, kh / 2 + w)):
        ring = box(xa, xa + P['nut_b'], -hb - 1, hb + 1, -hh - 1, hh + 1) - \
            box(xa - 1, xa + P['nut_b'] + 1, -(hb - P['nut_t']), hb - P['nut_t'], -(hh - P['nut_t']), hh - P['nut_t'])
        teil -= ring
    return teil, L


def haelften():
    teil, L = gehaeuse()
    big = 100
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
        fh.write(b'EX-13101 Gehaeuse ' + VERSION.encode() + b' ' * (80 - 19 - len(VERSION)))
        fh.write(np.uint32(len(f)).tobytes())
        rec = np.zeros(len(f), dtype=[('n', '<f4', 3), ('v', '<f4', (3, 3)), ('a', '<u2')])
        rec['n'] = n; rec['v'] = tri
        fh.write(rec.tobytes())


if __name__ == '__main__':
    oben, unten, L = haelften()
    tag = f"{VERSION}_pcb{P['pcb_hinten']:g}_kabel{P['kabel_d']:g}"
    for name, m in (('oben', oben), ('unten', unten)):
        bb = m.bounding_box()
        print(name, 'Volumen %.2f cm3' % (m.volume() / 1000), 'Masse x %.1f y %.1f z %.1f' % (bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]),
              'z von %.2f bis %.2f' % (bb[2], bb[5]), 'Gattung', m.genus())
        write_stl(m.translate([0, 0, -bb[2]]), f'ex13101_gehaeuse_{name}_{tag}.stl')
    print('Länge', L)

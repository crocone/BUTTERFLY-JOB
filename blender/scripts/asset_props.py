"""Street furniture and small props per era, the delivery van, cars, the getaway bicycle and the
1986 intervention-site props (alley notice, service-door blueprint, garden petition)."""
from __future__ import annotations

import math

import bj_arch as A
import bj_kit as K
from asset_workshop import bicycle
from bj_kit import MB, PAL, W
from mathutils import Vector

UP = Vector((0, 0, 1))

LAMPS = {
    1946: [(9.3, 17.7), (21.7, 17.7), (6.5, 0.3), (26.5, 0.3), (13.5, 21.6)],
    1986: [(9.3, 17.7), (21.7, 17.7), (21.7, 10.3), (6.5, 0.3), (17.5, 0.3), (26.5, 0.3), (3.5, 21.6), (24.5, 21.6)],
    2026: [(9.3, 17.7), (21.7, 17.7), (21.7, 10.3), (6.5, 0.3), (17.5, 0.3), (26.5, 0.3), (3.5, 21.6), (13.5, 21.6), (24.5, 21.6)],
}


def bench(mb, c: Vector, along: Vector, era):
    side = Vector((-along.y, along.x, 0))
    wood = PAL['wood'] if era != 2026 else PAL['wood_light']
    for k in range(3):
        o = c + side * (-0.12 + k * 0.12) + UP * 0.36
        mb.box(*(o - along * 0.45 - side * 0.05), *(o + along * 0.45 + side * 0.05 + UP * 0.03), 'plank', wood)
    back = c - side * 0.22 + UP * 0.45
    mb.panel(back - along * 0.45, along * 0.9, UP * 0.3, 0.03, 'plank', wood)
    for s in (-0.38, 0.38):
        p = c + along * s
        mb.box(p.x - 0.03, p.y - 0.03, 0, p.x + 0.03, p.y + 0.03, 0.36, 'paper', PAL['ink'] if era != 1946 else PAL['wood'], edge=None)


def statue(mb, c: Vector, era):
    mb.box(c.x - 0.38, c.y - 0.38, 0, c.x + 0.38, c.y + 0.38, 0.2, 'paper', PAL['stone_dark'])
    mb.box(c.x - 0.28, c.y - 0.28, 0.2, c.x + 0.28, c.y + 0.28, 1.1, 'paper', PAL['stone'])
    if era == 1946:
        # pedestal waiting for its statue, wrapped scaffold
        for (dx, dy) in ((-0.4, -0.4), (0.4, -0.4), (0.4, 0.4), (-0.4, 0.4)):
            mb.box(c.x + dx - 0.02, c.y + dy - 0.02, 0, c.x + dx + 0.02, c.y + dy + 0.02, 1.6, 'wood', PAL['wood'], edge=None)
        return
    # paper figure of the founder, Ilse Linden, holding a key
    f = c + UP * 1.1
    mb.box(f.x - 0.16, f.y - 0.1, f.z, f.x + 0.16, f.y + 0.1, f.z + 0.62, 'paper', PAL['stone_dark'])
    mb.face([f + Vector((-0.2, -0.12, 0)), f + Vector((0.2, -0.12, 0)), f + Vector((0.16, -0.1, 0.62)), f + Vector((-0.16, -0.1, 0.62))], 'paper', PAL['stone'])
    mb.blob(f + UP * 0.78, Vector((0.12, 0.12, 0.14)), 'paper', [PAL['stone']], subdiv=1, seed=3)
    mb.box(f.x + 0.16, f.y - 0.05, f.z + 0.35, f.x + 0.34, f.y + 0.05, f.z + 0.42, 'paper', PAL['stone'])
    A.sign(mb, c + Vector((0, -0.29, 0.62)), Vector((1, 0, 0)), Vector((0, -1, 0)), 'I. LINDEN', 0.07, PAL['stone'], PAL['ink'], board=False)


def kiosk(mb, era):
    a, b = W(18, 16), W(20, 17)
    if era == 1946:
        # newspaper cart
        c = W(19, 16.5, 0)
        mb.box(c.x - 0.6, c.y - 0.3, 0.3, c.x + 0.6, c.y + 0.3, 0.8, 'wood', PAL['wood'])
        for s in (-0.5, 0.5):
            mb.cylinder(c + Vector((s, -0.32, 0.25)) , 0.22, 0.22, 0.04, 10, 'wood', PAL['wood_light'])
        A.sign(mb, c + Vector((0, -0.31, 0.62)), Vector((1, 0, 0)), Vector((0, -1, 0)), 'RIVERDALE POST', 0.08, PAL['ochre_pale'], PAL['ink'])
        return
    col = PAL['teal'] if era == 1986 else PAL['coral']
    mb.box(a.x + 0.1, b.y + 0.1, 0, b.x - 0.1, a.y - 0.1, 1.5, 'wall', PAL['cream'])
    A.hip_roof(mb, 18, 16, 19, 16, 1.5, 0.45, col, overhang=0.25)
    A.window(mb, W(19, 17.0, 0.6) + Vector((0, -0.06, 0)), Vector((1, 0, 0)), Vector((0, -1, 0)), 1.2, 0.6, mullions=2)
    if era == 1986:
        A.sign(mb, W(19, 17.0, 1.35) + Vector((0, -0.07, 0)), Vector((1, 0, 0)), Vector((0, -1, 0)), 'NEWS', 0.12, PAL['teal'], PAL['white'])
        for k in range(4):
            p = W(18.3 + k * 0.45, 17.1, 0.45)
            mb.panel(p, Vector((0.35, 0, 0)), Vector((0, 0.05, 0.25)), 0.01, 'paper', [PAL['white'], PAL['ochre_pale'], PAL['sky'], PAL['rose']][k])
    else:
        A.sign(mb, W(19, 17.0, 1.35) + Vector((0, -0.07, 0)), Vector((1, 0, 0)), Vector((0, -1, 0)), 'FLOWERS', 0.11, PAL['coral'], PAL['white'])
        for k in range(5):
            p = W(18.25 + k * 0.38, 17.2, 0.1)
            mb.cylinder(p, 0.12, 0.14, 0.22, 7, 'paper', PAL['brick'])
            mb.blob(p + UP * 0.32, Vector((0.15, 0.15, 0.14)), 'foliage', [[PAL['rose'], PAL['mustard'], PAL['lilac'], PAL['white'], PAL['coral_pale']][k], PAL['leaf3']], subdiv=1, seed=k)


def car(mb, c: Vector, along: Vector, col, era):
    side = Vector((-along.y, along.x, 0))
    L_, Wd = (1.7, 0.8) if era == 2026 else (1.8, 0.82)
    body0 = c - along * (L_ / 2) - side * (Wd / 2)
    body1 = c + along * (L_ / 2) + side * (Wd / 2)
    mb.box(min(body0.x, body1.x), min(body0.y, body1.y), 0.16, max(body0.x, body1.x), max(body0.y, body1.y), 0.55, 'paper', col)
    cab0 = c - along * (L_ * 0.28) - side * (Wd * 0.44)
    cab1 = c + along * (L_ * 0.18) + side * (Wd * 0.44)
    mb.box(min(cab0.x, cab1.x), min(cab0.y, cab1.y), 0.55, max(cab0.x, cab1.x), max(cab0.y, cab1.y), 0.9, 'glass', PAL['glass'])
    mb.box(min(cab0.x, cab1.x) + 0.02, min(cab0.y, cab1.y) + 0.02, 0.9, max(cab0.x, cab1.x) - 0.02, max(cab0.y, cab1.y) - 0.02, 0.94, 'paper', col)
    for s in (-1, 1):
        for f in (-1, 1):
            w = c + along * (f * L_ * 0.32) + side * (s * Wd * 0.5)
            ring = [w + along * math.cos(a) * 0.17 + UP * (0.17 + math.sin(a) * 0.17) for a in [i / 8 * math.tau for i in range(8)]]
            mb.face(ring if s > 0 else list(reversed(ring)), 'paper', PAL['ink'])


def van(mb, c: Vector, along: Vector):
    """Delivery van (2026): coral and white, 'RIVERDALE LOGISTICS'."""
    side = Vector((-along.y, along.x, 0))
    L_, Wd = 1.9, 0.86
    p0 = c - along * (L_ / 2) - side * (Wd / 2)
    p1 = c + along * (L_ * 0.18) + side * (Wd / 2)
    mb.box(min(p0.x, p1.x), min(p0.y, p1.y), 0.18, max(p0.x, p1.x), max(p0.y, p1.y), 1.25, 'paper', PAL['white'])
    q0 = c + along * (L_ * 0.18) - side * (Wd / 2)
    q1 = c + along * (L_ / 2) + side * (Wd / 2)
    mb.box(min(q0.x, q1.x), min(q0.y, q1.y), 0.18, max(q0.x, q1.x), max(q0.y, q1.y), 0.85, 'paper', PAL['coral'])
    mb.box(min(q0.x, q1.x), min(q0.y, q1.y), 0.85, max(q0.x, q1.x) - (0.25 if along.x > 0 else 0), max(q0.y, q1.y), 1.05, 'glass', PAL['glass'])
    stripe0 = c - along * (L_ / 2) - side * (Wd / 2 + 0.005)
    mb.panel(stripe0 + UP * 0.55, along * (L_ * 0.68), UP * 0.12, 0.004, 'paper', PAL['coral'])
    for s in (-1, 1):
        for f in (-0.62, 0.62):
            w = c + along * f + side * (s * Wd * 0.5)
            ring = [w + along * math.cos(a) * 0.18 + UP * (0.18 + math.sin(a) * 0.18) for a in [i / 8 * math.tau for i in range(8)]]
            mb.face(ring if s > 0 else list(reversed(ring)), 'paper', PAL['ink'])
    A.sign(mb, c - along * 0.35 - side * (Wd / 2 + 0.01) + UP * 0.95, along, -side, 'RIVERDALE LOGISTICS', 0.07, PAL['white'], PAL['coral'], board=False)


def build_era_sets(col):
    for era in (1946, 1986, 2026):
        root = K.vroot(f'props__{era}', f'props.{era}', anim='pop', col=col)
        mb = MB(seed=5000 + era, jitter=0.03)
        for (x, z) in LAMPS[era]:
            A.lamp(mb, W(x, z, 0), era)
        bench(mb, W(13.5, 17.5, 0), Vector((1, 0, 0)), era)
        bench(mb, W(17.5, 17.5, 0), Vector((1, 0, 0)), era)
        statue(mb, W(11.5, 16.5, 0), era)
        kiosk(mb, era)
        if era == 1946:
            # horse cart in the lane, a 1940s lorry by the bank works, milk churns
            cart = W(15.0, 0.9, 0)
            mb.box(cart.x - 0.6, cart.y - 0.35, 0.35, cart.x + 0.6, cart.y + 0.35, 0.62, 'plank', PAL['wood'])
            for s in (-0.38, 0.38):
                c = cart + Vector((0, s, 0.3))
                ring = [c + Vector((math.cos(a) * 0.3, 0, math.sin(a) * 0.3)) for a in [i / 10 * math.tau for i in range(10)]]
                mb.face(ring if s < 0 else list(reversed(ring)), 'wood', PAL['wood_light'])
            h = cart + Vector((1.3, 0, 0))
            mb.box(h.x - 0.4, h.y - 0.12, 0.45, h.x + 0.35, h.y + 0.12, 0.8, 'paper', PAL['trunk'])
            mb.box(h.x + 0.3, h.y - 0.08, 0.7, h.x + 0.55, h.y + 0.08, 1.0, 'paper', PAL['trunk'])
            for dx in (-0.3, 0.25):
                for dy in (-0.08, 0.08):
                    mb.box(h.x + dx - 0.03, h.y + dy - 0.03, 0, h.x + dx + 0.03, h.y + dy + 0.03, 0.45, 'paper', PAL['trunk_dark'], edge=None)
            car(mb, W(21.0, 0.9, 0), Vector((1, 0, 0)), PAL['olive'], 1946)
            for k in range(3):
                mb.cylinder(W(7.6 + k * 0.3, 1.5, 0), 0.12, 0.12, 0.45, 7, 'paper', PAL['stone'])
        elif era == 1986:
            car(mb, W(27.5, 7.0, 0), Vector((0, 1, 0)), PAL['mustard'], 1986)
            # phone booth by the square
            pb = W(21.6, 12.2, 0)
            mb.box(pb.x - 0.28, pb.y - 0.28, 0, pb.x + 0.28, pb.y + 0.28, 1.9, 'glass', PAL['glass'])
            mb.box(pb.x - 0.3, pb.y - 0.3, 1.9, pb.x + 0.3, pb.y + 0.3, 2.05, 'paper', PAL['teal'])
            for k in range(2):
                bicycle(mb, W(4.0 + k * 1.2, 19.35, 0), Vector((1, 0, 0)), PAL['teal'])
        else:
            for k in range(4):
                bicycle(mb, W(3.6 + k * 0.8, 19.35, 0), Vector((1, 0, 0)), [PAL['coral'], PAL['sage_dark'], PAL['mustard'], PAL['sky']][k])
            for (x, z) in ((9.4, 18.6), (20.6, 18.6)):
                mb.cylinder(W(x, z, 0), 0.16, 0.18, 0.6, 8, 'paper', PAL['sage_dark'])
            mb.cylinder(W(22.2, 18.9, 0), 0.1, 0.1, 0.42, 6, 'paper', PAL['red'])
            A.sign(mb, W(25.5, 18.02, 0.9) + Vector((0, -0.05, 0)), Vector((1, 0, 0)), Vector((0, -1, 0)), 'LINDEN GARDEN', 0.1, PAL['sage'], PAL['ink'])
        mb.build(f'props__{era}__set', parent=root, col=col, props={'bj_role': 'part'})


def build_cars_and_van(col):
    r = K.vroot('car__yard', 'car.yard', loc=W(27.5, 7.0, 0), anim='pop', col=col)
    mb = MB(seed=5101)
    car(mb, W(27.5, 7.0, 0), Vector((0, 1, 0)), PAL['slate_light'], 2026)
    mb.build('car__yard__body', parent=r, col=col, props={'bj_role': 'part'})
    r = K.vroot('car__lane', 'car.lane', loc=W(23.0, 0.5, 0), anim='pop', col=col)
    mb = MB(seed=5102)
    car(mb, W(23.0, 0.5, 0), Vector((1, 0, 0)), PAL['slate_light'], 2026)
    mb.build('car__lane__body', parent=r, col=col, props={'bj_role': 'part'})
    # the delivery van: dynamic, positioned by the game from the delivery schedule
    vn = K.group('van__delivery', col=col, loc=W(0, 0, 0), role='dynamic', dynamic='van')
    mb = MB(seed=5103)
    van(mb, W(0, 0, 0), Vector((1, 0, 0)))
    mb.build('van__delivery__body', parent=vn, col=col, pivot=W(0, 0, 0), props={'bj_role': 'part'})
    # the getaway bicycle at the start / exit
    r = K.vroot('bike__getaway', 'bike.getaway', loc=W(0.55, 20.6, 0), anim='pop', col=col)
    mb = MB(seed=5104)
    bicycle(mb, W(0.55, 20.6, 0), Vector((0, 1, 0)), PAL['coral'])
    c = W(0.55, 20.25, 0.62)
    mb.box(c.x - 0.14, c.y - 0.12, c.z, c.x + 0.14, c.y + 0.12, c.z + 0.16, 'wood', PAL['wood_light'])
    mb.build('bike__getaway__bike', parent=r, col=col, props={'bj_role': 'part'})
    K.anchor('anchor__exit', 'exit', W(1.5, 20.5, 0), parent=r, col=col)


def build_sites_1986(col):
    # alley redevelopment notice
    r = K.vroot('site__alleyNotice1986', 'site.alleyNotice1986', loc=W(10.6, 10.4, 0), anim='fold', col=col)
    mb = MB(seed=5200)
    p = W(10.6, 10.4, 0)
    for s in (-0.35, 0.35):
        mb.box(p.x + s - 0.025, p.y - 0.025, 0, p.x + s + 0.025, p.y + 0.025, 1.3, 'wood', PAL['wood'])
    mb.panel(p + Vector((-0.45, -0.03, 0.7)), Vector((0.9, 0, 0)), UP * 0.6, 0.03, 'paper', PAL['white'])
    A.sign(mb, p + Vector((0, -0.05, 1.12)), Vector((1, 0, 0)), Vector((0, -1, 0)), 'PUBLIC NOTICE', 0.07, PAL['white'], PAL['teal'], board=False)
    A.sign(mb, p + Vector((0, -0.05, 0.9)), Vector((1, 0, 0)), Vector((0, -1, 0)), 'LINDEN ALLEY', 0.06, PAL['white'], PAL['ink'], board=False)
    mb.build('site__alleyNotice1986__board', parent=r, col=col, props={'bj_role': 'part'})
    K.proxy('proxy__alleyNotice', 'site.alley', p + UP * 0.8, Vector((1, 0.4, 1.6)), parent=r, col=col)
    # service-door blueprint on an easel
    r = K.vroot('site__blueprint1986', 'site.blueprint1986', loc=W(13.4, 10.7, 0), anim='fold', col=col)
    mb = MB(seed=5210)
    p = W(13.4, 10.7, 0)
    for (dx, dy) in ((-0.25, 0.1), (0.25, 0.1), (0, -0.25)):
        a = p + Vector((dx, dy, 0))
        mb.box(a.x - 0.015, a.y - 0.015, 0, a.x + 0.015, a.y + 0.015, 1.1, 'wood', PAL['wood'], edge=None)
    mb.panel(p + Vector((-0.4, -0.02, 0.55)), Vector((0.8, 0, 0)), Vector((0, 0.1, 0.55)), 0.02, 'paper', PAL['sky'])
    for k in range(4):
        a = p + Vector((-0.32 + k * 0.2, -0.035, 0.65))
        mb.panel(a, Vector((0.12, 0, 0)), Vector((0, 0.07, 0.35)), 0.004, 'paper', PAL['white'])
    mb.build('site__blueprint1986__easel', parent=r, col=col, props={'bj_role': 'part'})
    K.proxy('proxy__blueprint', 'site.bankService', p + UP * 0.6, Vector((0.9, 0.5, 1.2)), parent=r, col=col)
    # garden petition table
    r = K.vroot('site__petition1986', 'site.petition1986', loc=W(20.6, 13.4, 0), anim='fold', col=col)
    mb = MB(seed=5220)
    p = W(20.6, 13.4, 0)
    mb.box(p.x - 0.45, p.y - 0.28, 0.62, p.x + 0.45, p.y + 0.28, 0.67, 'plank', PAL['wood_light'])
    for (dx, dy) in ((-0.4, -0.23), (0.4, -0.23), (0.4, 0.23), (-0.4, 0.23)):
        mb.box(p.x + dx - 0.02, p.y + dy - 0.02, 0, p.x + dx + 0.02, p.y + dy + 0.02, 0.62, 'paper', PAL['ink'], edge=None)
    mb.panel(p + Vector((-0.2, -0.15, 0.68)), Vector((0.3, 0, 0)), Vector((0, 0.22, 0)), 0.005, 'paper', PAL['white'])
    A.sign(mb, p + Vector((0, 0.3, 1.2)), Vector((1, 0, 0)), Vector((0, -1, 0)), 'SAVE OUR GARDEN', 0.09, PAL['teal'], PAL['white'])
    for s in (-0.55, 0.55):
        a = p + Vector((s, 0.3, 0))
        mb.box(a.x - 0.02, a.y - 0.02, 0, a.x + 0.02, a.y + 0.02, 1.35, 'wood', PAL['wood'], edge=None)
    mb.build('site__petition1986__table', parent=r, col=col, props={'bj_role': 'part'})
    K.proxy('proxy__petition', 'site.garden', p + UP * 0.6, Vector((1.2, 0.8, 1.3)), parent=r, col=col)
    r = K.vroot('site__petitionSigned', 'site.petitionSigned', loc=W(20.6, 13.4, 1.5), anim='unfurl', col=col)
    mb = MB(seed=5230)
    for k in range(9):
        a = W(19.9 + k * 0.17, 13.7, 1.52 - 0.05 * math.sin(k / 8 * math.pi))
        mb.face([a, a + Vector((0.14, 0, 0)), a + Vector((0.07, 0, -0.16))], 'paper', [PAL['teal'], PAL['mustard'], PAL['coral_pale']][k % 3])
        mb.face([a + Vector((0.14, 0, 0)), a, a + Vector((0.07, 0, -0.16))], 'paper', [PAL['teal'], PAL['mustard'], PAL['coral_pale']][k % 3])
    mb.build('site__petitionSigned__bunting', parent=r, col=col, props={'bj_role': 'part'})


def build():
    K.reset_scene()
    col = K.collection('props')
    build_era_sets(col)
    build_cars_and_van(col)
    build_sites_1986(col)
    K.add_preview_rig(W(15, 12, 0), 26)
    return K.save_and_export('props', notes='Street furniture per era, cars, delivery van, 1986 site props.')


if __name__ == '__main__':
    build()

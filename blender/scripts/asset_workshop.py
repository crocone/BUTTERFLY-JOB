"""Brandt workshop (x3–8, z3–8 on the x1–8/z2–9 lot): 1946 electrician & smithy, 1986 garage,
2026 bicycle shop.  The 1946 alarm-wiring junction box hangs on the east wall facing the alley."""
from __future__ import annotations

import math

import bj_arch as A
import bj_build as B
import bj_kit as K
from bj_kit import MB, PAL, W
from mathutils import Vector

BODY = (3, 3, 8, 8)
UP = Vector((0, 0, 1))
EAVE = 2.3


def build_building(col):
    root = K.vroot('workshop__building', 'workshop.building', loc=W(6, 6, 0), anim='rise', col=col, building='workshop')
    mb = MB(seed=3001)
    B.floor_slab(mb, [BODY], 0.0, PAL['concrete'], mat='paving')
    specs = {
        'n': [(1, 'wide', {'w': 1.7, 'h': 1.8, 'center': 1.0, 'col': PAL['slate']}), (4, 'window', {'w': 0.55})],
        'e': [(1, 'window', {'w': 0.6, 'h': 0.7, 'sill': 0.8}), (3, 'door', {'w': 0.6, 'h': 1.4, 'col': PAL['wood']}), (5, 'window', {'w': 0.6, 'h': 0.7, 'sill': 0.8})],
        's': [(i, 'window', {'w': 0.5, 'h': 0.6, 'sill': 0.9}) for i in (1, 4)],
        'w': [(2, 'window', {'w': 0.5, 'h': 0.6, 'sill': 0.9})],
    }
    for side, spec in specs.items():
        deco, start, along, out = B.exterior_side(mb, side, BODY, 0.0, EAVE, spec, out_mat='brick', out_col=PAL['stone'])
        B.decorate(mb, deco, start, along, out, 0.0, frame_col=PAL['white'], door_col=PAL['wood'])
        s, e = A.edge_line(side, *BODY)
        dn = (e - s).normalized()
        mb.panel(s - dn * 0.04 + out * 0.09 + UP * 0.0, dn * ((e - s).length + 0.08), UP * 0.22, 0.05, 'paper', PAL['stone_dark'])
    # gable roof, ridge east–west so the gable (with the sign) faces the alley
    A.gable_roof(mb, *BODY, EAVE, 1.5, 'x', PAL['charcoal'], overhang=0.22, gable_col=PAL['stone'])
    # roof skylights on the south slope (mockup detail)
    for i in range(3):
        c = W(4.3 + i * 1.5, 7.2, EAVE + 0.55)
        mb.panel(c, Vector((0.7, 0, 0)), Vector((0, 0.55, 0.32)), 0.04, 'glass', PAL['glass'])
    # forge chimney
    K.rect_box(mb, 4, 4, 4, 4, EAVE, EAVE + 1.9, 'brick', PAL['brick'], inset=0.28)
    mb.build('workshop__building__shell', parent=root, col=col, props={'bj_role': 'part'})
    # lot: side yard with a low wall along the lane and some clutter
    mb = MB(seed=3002, jitter=0.05)
    K.rect_box(mb, 1, 2, 2, 9, 0.0, 0.02, 'paper', PAL['soil'], edge=None)
    for (x, z) in ((1, 3), (1, 6), (2, 8)):
        c = W(x + 0.5, z + 0.5, 0)
        mb.cylinder(c, 0.2, 0.2, 0.5, 8, 'wood', PAL['wood'])
    mb.build('workshop__building__lot', parent=root, col=col, props={'bj_role': 'part'})
    K.proxy('proxy__workshop', 'site.workshop', W(6, 6, 1.6), Vector((6, 6, 3.2)), parent=root, col=col)


def build_eras(col):
    east_out = Vector((1, 0, 0))
    north = Vector((0, 1, 0))
    for era, text, board, letters in ((1946, 'BRANDT  ELECTRIC & SMITHY', PAL['ochre'], PAL['ink']),
                                     (1986, 'BRANDT GARAGE', PAL['teal'], PAL['white']),
                                     (2026, 'BRANDT CYCLES', PAL['coral'], PAL['white'])):
        r = K.vroot(f'workshop__{era}', f'workshop.{era}', loc=W(9, 6, 2.6), anim='unfurl', col=col)
        mb = MB(seed=3010 + era, jitter=0.03)
        A.sign(mb, W(9.0, 5.6, EAVE + 0.55) + Vector((0.04, 0, 0)), north, east_out, text, 0.2 if era == 1946 else 0.26, board, letters, width=4.4)
        if era == 1946:
            # anvil, coal pile and the electrician's wire poles — exposed utilities of 1946
            a = W(2.0, 4.5, 0)
            mb.box(a.x - 0.2, a.y - 0.1, 0, a.x + 0.2, a.y + 0.1, 0.3, 'paper', PAL['ink'])
            mb.box(a.x - 0.28, a.y - 0.12, 0.3, a.x + 0.3, a.y + 0.12, 0.42, 'paper', PAL['slate'])
            mb.blob(W(1.6, 7.5, 0.1), Vector((0.4, 0.35, 0.22)), 'paper', [PAL['ink'], PAL['charcoal']], subdiv=1, seed=3)
            for (x, z) in ((2.5, 2.3), (13.0, 1.6), (23.0, 1.6)):
                p = W(x, z, 0)
                mb.cylinder(p, 0.06, 0.05, 3.4, 5, 'wood', PAL['wood'])
                mb.box(p.x - 0.35, p.y - 0.03, 3.1, p.x + 0.35, p.y + 0.03, 3.16, 'wood', PAL['wood'])
            for (a0, b0) in (((2.5, 2.3), (13.0, 1.6)), ((13.0, 1.6), (23.0, 1.6))):
                for off in (-0.3, 0.3):
                    p = W(a0[0], a0[1], 3.18) + Vector((off, 0, 0))
                    q = W(b0[0], b0[1], 3.18) + Vector((off, 0, 0))
                    n = Vector((0, 0.008, 0))
                    mid = (p + q) / 2 - Vector((0, 0, 0.25))
                    for s0, s1 in ((p, mid), (mid, q)):
                        mb.face([s0 - n, s1 - n, s1 + n, s0 + n], 'paper', PAL['ink'], vary=False)
        elif era == 1986:
            # stacked tyres and an oil drum by the garage door
            for k in range(3):
                mb.cylinder(W(7.4, 2.5, 0.12 * k), 0.24, 0.24, 0.11, 10, 'paper', PAL['ink'])
            mb.cylinder(W(8.4, 2.5, 0), 0.18, 0.18, 0.5, 8, 'paper', PAL['teal'])
        else:
            # bicycles on display outside the shop (on the lot strip)
            for i in range(3):
                bicycle(mb, W(2.0, 3.4 + i * 1.6, 0), Vector((0, 1, 0)), [PAL['coral'], PAL['teal'], PAL['mustard']][i])
            mb.blob(W(1.5, 8.6, 0.3), Vector((0.35, 0.35, 0.3)), 'foliage', [PAL['leaf1'], PAL['leaf3']], subdiv=1, seed=8)
        mb.build(f'workshop__{era}__dressing', parent=r, col=col, props={'bj_role': 'part'})


def bicycle(mb: MB, base: Vector, forward: Vector, col):
    """Paper bicycle: two thin wheels (12-gon rings) and a folded frame."""
    side = Vector((-forward.y, forward.x, 0))
    r = 0.24
    for off in (-0.36, 0.36):
        c = base + forward * off + UP * r
        pts = [c + forward * (math.cos(a) * r) + UP * (math.sin(a) * r) for a in [i / 12 * math.tau for i in range(12)]]
        inner = [c + (p - c) * 0.82 for p in pts]
        for i in range(12):
            j = (i + 1) % 12
            mb.face([pts[i], pts[j], inner[j], inner[i]], 'paper', PAL['ink'], vary=False)
            mb.face([inner[i], inner[j], pts[j], pts[i]], 'paper', PAL['ink'], vary=False)
    hub_r = base - forward * 0.36 + UP * r
    hub_f = base + forward * 0.36 + UP * r
    seat = base - forward * 0.1 + UP * 0.62
    bars = base + forward * 0.3 + UP * 0.66
    crank = base + UP * 0.26
    for a, b in ((hub_r, seat), (seat, crank), (crank, hub_r), (crank, bars), (seat, bars), (bars, hub_f)):
        n = side * 0.015
        mb.face([a - n, b - n, b + n, a + n], 'paper', col, vary=False)
        mb.face([a + n, b + n, b - n, a - n], 'paper', col, vary=False)
    mb.box(seat.x - 0.08, seat.y - 0.04, seat.z, seat.x + 0.08, seat.y + 0.04, seat.z + 0.04, 'paper', PAL['ink'], edge=None)
    mb.box(bars.x - 0.02 - side.x * 0.2, bars.y - side.y * 0.2 - 0.02, bars.z, bars.x + 0.02 + side.x * 0.2, bars.y + side.y * 0.2 + 0.02, bars.z + 0.03, 'paper', PAL['ink'], edge=None)


def build_junction(col):
    anchor_tile = K.layout()['anchors']['junction']
    r = K.vroot('workshop__junction', 'workshop.junction', loc=W(9.0, 4.5, 1.0), anim='pop', col=col, level='G')
    mb = MB(seed=3050, jitter=0.02)
    c = W(9.0, 4.5, 0.0)
    mb.box(c.x, c.y - 0.22, 0.75, c.x + 0.16, c.y + 0.22, 1.3, 'paper', PAL['slate_light'])
    mb.box(c.x + 0.16, c.y - 0.2, 0.77, c.x + 0.18, c.y + 0.2, 1.28, 'paper', PAL['gray'])
    # conduit up to the eaves and the 1946 enamel plate
    mb.box(c.x + 0.02, c.y - 0.03, 1.3, c.x + 0.08, c.y + 0.03, EAVE, 'paper', PAL['pipe'], edge=None)
    A.sign(mb, Vector((c.x + 0.19, c.y, 1.12)), Vector((0, 1, 0)), Vector((1, 0, 0)), 'ALARM 46', 0.05, PAL['ochre_pale'], PAL['ink'])
    mb.build('workshop__junction__box', parent=r, col=col, props={'bj_role': 'part'})
    lever = K.group('workshop__junction__lever', parent=r, col=col, loc=Vector((c.x + 0.18, c.y + 0.12, 0.95)), role='dynamic', dynamic='junctionLever')
    mb = MB(seed=3051)
    p = Vector((c.x + 0.18, c.y + 0.12, 0.95))
    mb.box(p.x, p.y - 0.02, p.z, p.x + 0.04, p.y + 0.02, p.z + 0.22, 'paper', PAL['red'], edge=None)
    mb.box(p.x - 0.01, p.y - 0.035, p.z + 0.2, p.x + 0.05, p.y + 0.035, p.z + 0.26, 'paper', PAL['ink'], edge=None)
    mb.build('workshop__junction__lever__mesh', parent=lever, col=col, pivot=p, props={'bj_role': 'part'})
    K.anchor('anchor__junction', 'junction', W(anchor_tile['x'] + 0.5, anchor_tile['z'] + 0.5, 0), parent=r, col=col)
    K.proxy('proxy__junction', 'site.junction', Vector((c.x + 0.1, c.y, 1.0)), Vector((0.5, 0.6, 0.8)), parent=r, col=col)


def build():
    K.reset_scene()
    col = K.collection('workshop')
    build_building(col)
    build_eras(col)
    build_junction(col)
    K.add_preview_rig(W(6, 6, 1), 12)
    return K.save_and_export('workshop', notes='Brandt workshop, era dressings, alarm junction box.')


if __name__ == '__main__':
    build()

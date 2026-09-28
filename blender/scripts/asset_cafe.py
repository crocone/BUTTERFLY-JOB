"""Café Kopp (x1–8, z10–14, front facing the square to the east): 1946 empty lot, 1986 café,
2026 open / closed-by-flood / closed-after-losing-its-terrace, terraces and the cellar valve."""
from __future__ import annotations

import math

import bj_arch as A
import bj_build as B
import bj_kit as K
from bj_kit import MB, PAL, W
from mathutils import Vector

CAFE = (1, 10, 8, 14)
BODY = (2, 10, 8, 14)   # building footprint (x=1 is a narrow side passage)
UP = Vector((0, 0, 1))
EAVE = 3.7


def build_building(col):
    root = K.vroot('cafe__building', 'cafe.building', loc=W(5, 12.5, 0), anim='rise', col=col, building='cafe')
    mb = MB(seed=2001)
    B.floor_slab(mb, [BODY], 0.0, PAL['wood_light'], mat='plank')
    # east (front) façade: shop window + door on the ground floor, two windows above
    front_G = [(0, 'window', {'w': 0.8, 'sill': 0.35, 'h': 1.05, 'mullions': 2}), (1, 'window', {'w': 0.8, 'sill': 0.35, 'h': 1.05, 'mullions': 2}),
               (2, 'door', {'w': 0.62, 'h': 1.4, 'glass': True, 'col': PAL['teal']}), (3, 'window', {'w': 0.8, 'sill': 0.35, 'h': 1.05, 'mullions': 2}),
               (4, 'window', {'w': 0.8, 'sill': 0.35, 'h': 1.05, 'mullions': 2})]
    front_U = [(i, 'window', {'w': 0.45, 'h': 0.8, 'sill': 0.55}) for i in (0, 2, 4)]
    side_U = [(i, 'window', {'w': 0.45, 'h': 0.8, 'sill': 0.55}) for i in (1, 3, 5)]
    for side, specG, specU in (('e', front_G, front_U), ('s', [], side_U), ('n', [(2, 'window', {'w': 0.45})], side_U), ('w', [], [])):
        deco, start, along, out = B.exterior_side(mb, side, BODY, 0.0, 1.9, specG, out_mat='brick', out_col=PAL['sage'])
        B.decorate(mb, deco, start, along, out, 0.0, frame_col=PAL['white'], door_col=PAL['teal'])
        deco, start, along, out = B.exterior_side(mb, side, BODY, 1.9, EAVE, specU, out_mat='wall', out_col=PAL['cream'])
        B.decorate(mb, deco, start, along, out, 1.9, frame_col=PAL['white'], shutters=PAL['teal_pale'])
    # string course and cornice
    for side in 'nesw':
        s, e = A.edge_line(side, *BODY)
        along, out = A.dir_vectors(side)
        dn = (e - s).normalized()
        mb.panel(s - dn * 0.05 + out * 0.1 + UP * 1.86, dn * ((e - s).length + 0.1), UP * 0.1, 0.06, 'paper', PAL['stone'])
    # mansard-ish gabled roof, ridge running north–south, dormer toward the square
    A.gable_roof(mb, *BODY, EAVE, 1.3, 'z', PAL['slate'], overhang=0.2, gable_col=PAL['cream'])
    dorm = W(8.0, 12.5, EAVE + 0.2)
    mb.box(dorm.x - 0.6, dorm.y - 0.45, EAVE, dorm.x - 0.05, dorm.y + 0.45, EAVE + 0.75, 'wall', PAL['cream'])
    A.window(mb, Vector((dorm.x - 0.03, dorm.y, EAVE + 0.18)), Vector((0, 1, 0)), Vector((1, 0, 0)), 0.4, 0.45, mullions=0, sill=False)
    mb.panel(Vector((dorm.x + 0.05, dorm.y - 0.55, EAVE + 0.76)), Vector((0, 1.1, 0)), Vector((-0.75, 0, 0.3)), 0.05, 'roof', PAL['slate'])
    # chimney
    K.rect_box(mb, 3, 11, 3, 11, EAVE, EAVE + 1.6, 'brick', PAL['brick'], inset=0.3)
    mb.build('cafe__building__shell', parent=root, col=col, props={'bj_role': 'part', 'bj_anim': 'rise'})
    # side passage wall (x=1 strip) + bins
    mb = MB(seed=2002)
    K.rect_box(mb, 1, 10, 1, 14, 0, 0.9, 'brick', PAL['brick'], inset=0.35)
    mb.build('cafe__building__passage', parent=root, col=col, props={'bj_role': 'part'})
    K.proxy('proxy__cafe', 'site.cafe', W(5, 12.5, 1.8), Vector((7, 5, 3.6)), parent=root, col=col)


def shop_sign(mb, text, board, letters):
    A.sign(mb, W(9.0, 12.5, 2.2) + Vector((0.03, 0, 0)), Vector((0, 1, 0)), Vector((1, 0, 0)), text, 0.3, board, letters, width=4.2)


def build_states(col):
    front = Vector((0, 1, 0))
    out = Vector((1, 0, 0))
    # 1986: teal awning, sign, window lettering
    r = K.vroot('cafe__open1986', 'cafe.open1986', loc=W(9, 12.5, 1.9), anim='unfurl', col=col)
    mb = MB(seed=2010)
    shop_sign(mb, 'CAFE KOPP', PAL['teal'], PAL['white'])
    A.awning(mb, W(9.02, 14.9, 1.75), front, out, 4.8, 0.85, 0.35, [PAL['teal'], PAL['white']], stripes=8)
    mb.build('cafe__open1986__front', parent=r, col=col, props={'bj_role': 'part'})
    # terraces
    for era, vid, cols in ((1986, 'cafe.terrace1986', [PAL['teal'], PAL['white']]), (2026, 'cafe.open2026', [PAL['coral'], PAL['white']])):
        r = K.vroot(f'cafe__terrace{era}' if era == 1986 else 'cafe__open2026', vid, loc=W(9.5, 12.5, 0), anim='pop', col=col)
        mb = MB(seed=2020 + era)
        for (x, z) in ((9, 11), (9, 13)):
            c = W(x + 0.5, z + 0.5, 0)
            mb.cylinder(c, 0.06, 0.05, 0.62, 6, 'paper', PAL['ink'])
            mb.cylinder(c + UP * 0.62, 0.32, 0.32, 0.04, 10, 'paper', PAL['white'])
            for dx, dy in ((0.42, 0), (-0.42, 0), (0, 0.42), (0, -0.42)):
                q = c + Vector((dx, dy, 0))
                mb.box(q.x - 0.12, q.y - 0.12, 0.34, q.x + 0.12, q.y + 0.12, 0.38, 'wood', PAL['wood'])
                for sx, sy in ((-0.1, -0.1), (0.1, -0.1), (0.1, 0.1), (-0.1, 0.1)):
                    mb.box(q.x + sx - 0.012, q.y + sy - 0.012, 0, q.x + sx + 0.012, q.y + sy + 0.012, 0.34, 'paper', PAL['ink'], edge=None)
            # parasol: folded paper umbrella (eight panels)
            pole = c + UP * 0.66
            mb.cylinder(pole, 0.02, 0.02, 0.9, 4, 'paper', PAL['wood'])
            apex = pole + UP * 1.05
            rim = [pole + UP * 0.72 + Vector((math.cos(a) * 0.75, math.sin(a) * 0.75, 0)) for a in [i / 8 * math.tau for i in range(8)]]
            for i in range(8):
                mb.face([rim[i], rim[(i + 1) % 8], apex], 'paper', cols[i % 2])
                mb.face([rim[(i + 1) % 8], rim[i], apex], 'paper', cols[i % 2])
        if era == 2026:
            shop_sign(mb, 'CAFE KOPP', PAL['coral'], PAL['white'])
            A.awning(mb, W(9.02, 14.9, 1.75), front, out, 4.8, 0.85, 0.35, [PAL['coral'], PAL['white']], stripes=8)
            # sandwich board from the mockup
            sb = W(10.6, 14.6, 0)
            mb.panel(sb, Vector((0, 0.45, 0)), Vector((0.15, 0, 0.7)), 0.02, 'paper', PAL['charcoal'])
            mb.panel(sb + Vector((0.3, 0.45, 0)), Vector((0, -0.45, 0)), Vector((-0.15, 0, 0.7)), 0.02, 'paper', PAL['charcoal'])
            A.sign(mb, sb + Vector((0.09, 0.225, 0.45)) + Vector((-0.01, 0, 0)), Vector((0, 1, 0)), Vector((-1, 0, 0.2)).normalized(), 'GOOD DAYS', 0.07, PAL['charcoal'], PAL['white'], board=False)
            # flower pots
            for z in (10.3, 14.7):
                p = W(9.25, z, 0)
                mb.cylinder(p, 0.14, 0.18, 0.28, 7, 'paper', PAL['brick'])
                mb.blob(p + UP * 0.4, Vector((0.2, 0.2, 0.18)), 'foliage', [PAL['leaf1'], PAL['rose']], subdiv=1, seed=int(z * 10))
        mb.build(f'cafe__terrace{era}__set', parent=r, col=col, props={'bj_role': 'part'})
    # 2026 closed: flood damage / lost terrace — boarded windows, notices
    for vid, note in (('cafe.closed.flood', 'CLOSED  -  FLOOD 2003'), ('cafe.closed.terrace', 'CLOSED 1991  -  TO LET')):
        name = 'cafe__' + vid.split('.')[-1] + '_closed'
        r = K.vroot(name, vid, loc=W(9, 12.5, 0), anim='fold', col=col)
        mb = MB(seed=2030 + len(note), jitter=0.06)
        for i, z in enumerate((10.5, 11.5, 13.5, 14.5)):
            c = W(9.02, z, 0.9)
            for k in range(3):
                h = 0.4 + k * 0.28
                tilt = 0.06 * (1 if (k + i) % 2 else -1)
                mb.panel(Vector((c.x + 0.01, c.y - 0.45, h - tilt)), Vector((0, 0.9, 2 * tilt)), Vector((0, 0, 0.16)), 0.02, 'plank', PAL['wood_light'])
        shop_sign(mb, 'CAFE KOPP', PAL['gray'], PAL['stone'])
        A.sign(mb, W(9.05, 12.5, 1.35), Vector((0, 1, 0)), Vector((1, 0, 0)), note, 0.1, PAL['white'], PAL['red'], width=1.9)
        if vid == 'cafe.closed.flood':
            # water line stain on the façade
            a = W(9.03, 14.95, 0.35)
            mb.panel(a, Vector((0, 4.9, 0)), Vector((0, 0, 0.05)), 0.005, 'paper', PAL['water'])
        mb.build(f'{name}__front', parent=r, col=col, props={'bj_role': 'part'})
    # the 1986 backflow valve in the cellar drain (seen in the underground view)
    r = K.vroot('cafe__valve', 'cafe.valve', loc=W(8.5, 12.5, -2.6), anim='pop', col=col, level='S')
    mb = MB(seed=2040)
    c = W(8.5, 12.5, -2.6)
    mb.cylinder(c - Vector((0, 0, 0.35)), 0.09, 0.09, 0.7, 6, 'paper', PAL['pipe'])
    mb.cylinder(c + Vector((0, 0, 0.0)), 0.18, 0.18, 0.12, 8, 'paper', PAL['teal'])
    mb.box(c.x - 0.02, c.y - 0.25, c.z + 0.12, c.x + 0.02, c.y + 0.25, c.z + 0.16, 'paper', PAL['red'], edge=None)
    mb.build('cafe__valve__fitting', parent=r, col=col, props={'bj_role': 'part'})


def build_lot1946(col):
    r = K.vroot('cafe__lot1946', 'cafe.lot1946', loc=W(5, 12.5, 0), anim='pop', col=col)
    mb = MB(seed=2050, jitter=0.05)
    K.rect_box(mb, 2, 10, 8, 14, 0.0, 0.03, 'paper', PAL['soil'], inset=0.1)
    for (x, z) in ((3, 11), (6, 13), (4, 13)):
        K.rect_box(mb, x, z, x, z, 0.03, 0.4, 'brick', PAL['brick'], inset=0.22)
    # plank fence along the square and the promise sign
    for z in range(10, 15):
        a = W(8.9, z + 0.05, 0)
        mb.panel(a, Vector((0, -0.9, 0)), UP * 0.7, 0.03, 'plank', PAL['wood'] if z % 2 else PAL['wood_light'])
    A.sign(mb, W(9.0, 12.5, 1.0), Vector((0, 1, 0)), Vector((1, 0, 0)), 'CAFE KOPP  -  OPENING 1952', 0.14, PAL['ochre'], PAL['ink'])
    for z in (11.0, 14.0):
        p = W(8.95, z, 0)
        mb.box(p.x - 0.03, p.y - 0.03, 0, p.x + 0.03, p.y + 0.03, 1.2, 'wood', PAL['wood'])
    mb.build('cafe__lot1946__site', parent=r, col=col, props={'bj_role': 'part'})
    K.proxy('proxy__cafe1946', 'site.cafe', W(5, 12.5, 0.5), Vector((7, 5, 1)), parent=r, col=col)


def build():
    K.reset_scene()
    col = K.collection('cafe')
    build_building(col)
    build_states(col)
    build_lot1946(col)
    K.add_preview_rig(W(6, 12, 1), 12)
    return K.save_and_export('cafe', notes='Café Kopp in every era and state.')


if __name__ == '__main__':
    build()

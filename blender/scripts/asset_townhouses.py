"""Row of three townhouses (x0–8, z15–18) facing Riverdale Street: 1946 (third house still under
construction), 1986 and 2026 (cream / ochre / sage as in the case-file mockup)."""
from __future__ import annotations

import bj_arch as A
import bj_build as B
import bj_kit as K
from bj_kit import MB, PAL, W
from mathutils import Vector

UP = Vector((0, 0, 1))
HOUSES = [(0, 15, 2, 18), (3, 15, 5, 18), (6, 15, 8, 18)]
EAVE = 3.7


def house(mb: MB, rect, wall_col, trim_col, door_col, roof_col, era, boxes=False, partial=False):
    fronts = [(0, 'window', {'w': 0.5, 'h': 0.8}), (1, 'door', {'w': 0.55, 'h': 1.35, 'col': door_col, 'glass': True}), (2, 'window', {'w': 0.5, 'h': 0.8})]
    uppers = [(i, 'window', {'w': 0.5, 'h': 0.85, 'sill': 0.5}) for i in range(3)]
    top = 1.2 if partial else 1.9
    for side, specG, specU in (('s', fronts, uppers), ('n', [(1, 'window', {'w': 0.5})], [(1, 'window', {'w': 0.5})]),
                               ('e', [], []), ('w', [], [])):
        deco, start, along, out = B.exterior_side(mb, side, rect, 0.0, top, specG, out_mat='brick' if era == 1946 else 'wall', out_col=wall_col)
        B.decorate(mb, deco, start, along, out, 0.0, frame_col=trim_col, door_col=door_col)
        if partial:
            continue
        deco, start, along, out = B.exterior_side(mb, side, rect, 1.9, EAVE, specU, out_mat='wall', out_col=wall_col)
        B.decorate(mb, deco, start, along, out, 1.9, frame_col=trim_col)
        if boxes and side == 's':
            for (i, kind, p) in deco:
                c = start + along * (i + 0.5) + out * 0.2 + UP * (1.9 + 0.42)
                mb.box(c.x - 0.28, c.y - 0.1, c.z, c.x + 0.28, c.y + 0.1, c.z + 0.12, 'wood', PAL['wood'])
                mb.blob(c + UP * 0.17, Vector((0.26, 0.1, 0.08)), 'foliage', [PAL['leaf1'], PAL['rose'], PAL['lilac']], subdiv=1, seed=int(c.x * 10))
    if partial:
        return
    # string course, roof, dormer, chimney, stoop with railing
    s, e = A.edge_line('s', *rect)
    mb.panel(s - Vector((0.03, 0, 0)) + Vector((0, -0.09, 1.86)), Vector((3.06, 0, 0)), UP * 0.08, 0.05, 'paper', trim_col)
    A.gable_roof(mb, *rect, EAVE, 1.25, 'x', roof_col, overhang=0.12, gable_col=wall_col)
    c = W(rect[0] + 1.5, rect[3] + 1.0 - 1.15, EAVE + 0.3)
    mb.box(c.x - 0.35, c.y - 0.3, EAVE + 0.05, c.x + 0.35, c.y + 0.25, EAVE + 0.75, 'wall', wall_col)
    A.window(mb, Vector((c.x, c.y - 0.305, EAVE + 0.22)), Vector((1, 0, 0)), Vector((0, -1, 0)), 0.32, 0.4, mullions=0, sill=False, frame_col=trim_col)
    mb.panel(Vector((c.x - 0.45, c.y - 0.42, EAVE + 0.72)), Vector((0.9, 0, 0)), Vector((0, 0.8, 0.35)), 0.05, 'roof', roof_col)
    K.rect_box(mb, rect[0], rect[1] + 1, rect[0], rect[1] + 1, EAVE, EAVE + 1.7, 'brick', PAL['brick'], inset=0.3)
    st = W(rect[0] + 1.5, rect[3] + 1.05, 0.0)
    A.stairs(mb, st + Vector((0, -0.5, 0)), Vector((0, 1, 0)), Vector((1, 0, 0)), 0.7, 0.2, 0.45, 2, col=PAL['stone'])
    A.railing(mb, st + Vector((0.38, -0.5, 0.02)), st + Vector((0.38, 0.0, 0.2)), height=0.35, posts=2)
    A.railing(mb, st + Vector((-0.38, -0.5, 0.02)), st + Vector((-0.38, 0.0, 0.2)), height=0.35, posts=2)
    # front area railings
    A.iron_fence(mb, W(rect[0] + 0.1, rect[3] + 1.35), W(rect[0] + 1.05, rect[3] + 1.35), height=0.34)
    A.iron_fence(mb, W(rect[0] + 1.95, rect[3] + 1.35), W(rect[2] + 0.9, rect[3] + 1.35), height=0.34)


def build():
    K.reset_scene()
    col = K.collection('townhouses')
    schemes = {
        1946: [(PAL['brick'], PAL['white'], PAL['wood'], PAL['slate']), (PAL['stone'], PAL['white'], PAL['wood'], PAL['slate']), None],
        1986: [(PAL['brick'], PAL['cream'], PAL['teal'], PAL['slate']), (PAL['warmgray'], PAL['white'], PAL['wood'], PAL['slate']),
               (PAL['cream'], PAL['white'], PAL['teal'], PAL['charcoal'])],
        2026: [(PAL['cream'], PAL['white'], PAL['wood'], PAL['slate']), (PAL['mustard'], PAL['white'], PAL['charcoal'], PAL['slate']),
               (PAL['sage'], PAL['white'], PAL['wood'], PAL['slate'])],
    }
    for era, scheme in schemes.items():
        root = K.vroot(f'townhouses__{era}', f'townhouses.{era}', loc=W(4.5, 17, 0), anim='rise', col=col, building='townhouses')
        for i, rect in enumerate(HOUSES):
            mb = MB(seed=4000 + era + i, jitter=0.03)
            if scheme[i] is None:
                # 1946: third house still under construction — partial walls and scaffolding
                house(mb, rect, PAL['brick'], PAL['white'], PAL['wood'], PAL['slate'], era, partial=True)
                for x in (rect[0], rect[2] + 1):
                    for z in (rect[3] + 1.3,):
                        p = W(x, z, 0)
                        mb.box(p.x - 0.03, p.y - 0.03, 0, p.x + 0.03, p.y + 0.03, 2.4, 'wood', PAL['wood'], edge=None)
                a = W(rect[0], rect[3] + 1.2, 1.2)
                mb.box(a.x, a.y - 0.25, 1.2, a.x + 3.0, a.y, 1.25, 'plank', PAL['wood_light'])
                K.rect_box(mb, rect[0] + 1, rect[1] + 1, rect[0] + 1, rect[1] + 1, 0, 0.4, 'brick', PAL['brick'], inset=0.2)
            else:
                wall, trim, door, roof = scheme[i]
                house(mb, rect, wall, trim, door, roof, era, boxes=(era == 2026))
            mb.build(f'townhouses__{era}__house{i}', parent=root, col=col, pivot=W(rect[0] + 1.5, rect[3] + 1, 0),
                     props={'bj_role': 'part', 'bj_anim': 'rise', 'bj_order': i})
    K.proxy('proxy__townhouses', 'site.townhouses', W(4.5, 17, 2.2), Vector((9, 4, 4.4)), col=col)
    K.add_preview_rig(W(4.5, 17, 1), 12)
    return K.save_and_export('townhouses', notes='Townhouse row in three eras.')


if __name__ == '__main__':
    build()

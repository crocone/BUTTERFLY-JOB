"""Riverdale Savings: main block (basement, ground, upper, roof deck), annex, West Wing, Garden
Wing, the 1946 construction site, era trims, service-door slots, hatch, cameras and contract props.

Node structure (cutaway-friendly):
  bank__main (variant bank.main)
    bank__B | bank__G | bank__U | bank__R          (bj_level, pivot on the level floor)
      bank__<L>__floor, bank__<L>__wall_<side> (bj_side), bank__<L>__walls_int, bank__<L>__furniture
"""
from __future__ import annotations

import math

import bj_arch as A
import bj_build as B
import bj_kit as K
from bj_kit import MB, PAL, W
from mathutils import Vector

L = K.layout()
LV = B.LV
MAIN = (11, 2, 20, 9)
ANNEX = (21, 2, 23, 9)
WEST = (9, 2, 10, 9)
GARDEN = (22, 10, 28, 17)
UP = Vector((0, 0, 1))

STONE = PAL['cream']
STONE_DARK = PAL['stone']


def level_group(name, level, parent, col, y):
    return K.group(name, parent=parent, col=col, loc=Vector((0, 0, y)), level=level, building='bank', role='level')


def side_group(name, level, side, parent, col, y):
    return K.group(name, parent=parent, col=col, loc=Vector((0, 0, y)), level=level, side=side, building='bank', role='side')


# ---------------------------------------------------------------------------------------------
# main block
# ---------------------------------------------------------------------------------------------

def build_main(col):
    root = K.vroot('bank__main', 'bank.main', loc=W(16, 6, 0), anim='rise', col=col, building='bank')
    # ---------------- basement
    gB = level_group('bank__B', 'B', root, col, LV['B'])
    mb = MB(seed=101)
    B.floor_slab(mb, [MAIN], LV['B'], PAL['concrete'], mat='paving', thick=0.12)
    mb.build('bank__B__floor', parent=gB, col=col, pivot=W(0, 0, LV['B']), props={'bj_role': 'part'})
    for side in 'nesw':
        sg = side_group(f'bank__B__wall_{side}', 'B', side, gB, col, LV['B'])
        mb = MB(seed=102 + ord(side))
        B.exterior_side(mb, side, MAIN, LV['B'], -0.02, [], out_mat='brick', out_col=PAL['concrete'], in_col=PAL['stone'])
        mb.build(f'bank__B__wall_{side}__mesh', parent=sg, col=col, pivot=W(0, 0, LV['B']), props={'bj_role': 'part'})
    amap = B.building_area_map('bank', 'B')
    runs = B.interior_runs(amap, B.door_edge_set('B'))
    mb = MB(seed=110)
    for p0, p1, holes in runs:
        mb.wall(p0, p1, LV['B'], -0.02, 0.1, holes=holes, out_mat='paper', out_col=PAL['ivory'], in_mat='paper', in_col=PAL['ivory'])
    mb.build('bank__B__walls_int', parent=gB, col=col, pivot=W(0, 0, LV['B']), props={'bj_role': 'part', 'bj_cut': 1})
    furniture_B(gB, col)

    # ---------------- ground floor
    gG = level_group('bank__G', 'G', root, col, 0.0)
    mb = MB(seed=120)
    B.floor_slab(mb, [MAIN], 0.0, PAL['wood_light'], mat='plank', thick=0.1)
    # lobby carpet runner and chequer tiles
    K.rect_box(mb, 14, 6, 19, 8, 0.0, 0.012, 'paper', PAL['coral_pale'], inset=0.25, edge=None)
    mb.build('bank__G__floor', parent=gG, col=col, pivot=W(0, 0, 0), props={'bj_role': 'part'})
    south_G = [(0, 'window', {}), (1, 'gap', {}), (2, 'window', {}), (3, 'window', {}),
               (4, 'wide', {'w': 1.46, 'h': 1.62, 'center': 1.0, 'col': PAL['wood']}),
               (6, 'window', {}), (7, 'window', {}), (8, 'window', {}), (9, 'window', {})]
    north_G = [(i, 'window', {'w': 0.42, 'h': 0.7, 'sill': 0.8}) for i in range(0, 8)] + [(8, 'window', {'w': 0.3, 'h': 0.5, 'sill': 1.1})]
    west_G = [(1, 'gap', {}), (5, 'gap', {})]
    specs_G = {'s': south_G, 'n': north_G, 'e': [], 'w': west_G}
    for side in 'nesw':
        sg = side_group(f'bank__G__wall_{side}', 'G', side, gG, col, 0.0)
        mb = MB(seed=130 + ord(side))
        deco, start, along, out = B.exterior_side(mb, side, MAIN, 0.0, 2.0, specs_G[side], out_mat='brick', out_col=STONE)
        B.decorate(mb, deco, start, along, out, 0.0, frame_col=PAL['white'], door_col=PAL['wood'], arch=True)
        if side in 's':
            facade_details(mb, side, 0.0, 2.0, ground=True)
        mb.build(f'bank__G__wall_{side}__mesh', parent=sg, col=col, pivot=W(0, 0, 0), props={'bj_role': 'part'})
        if side == 's':
            slot_pair(sg, col, 's', 1, 'front', ('door', {'w': 0.6, 'h': 1.36, 'canopy': PAL['slate']}), ('window', {}))
        if side == 'w':
            slot_pair(sg, col, 'w', 5, 'alley', ('door', {'w': 0.6, 'h': 1.36, 'canopy': PAL['slate']}), ('plain', {}))
            slot_pair(sg, col, 'w', 1, 'plant', ('door', {'w': 0.6, 'h': 1.36, 'col': PAL['slate']}), ('plain', {}))
    amap = B.building_area_map('bank', 'G', lambda a: a['id'] not in ('bank.G.plant', 'bank.G.records'))
    runs = B.interior_runs(amap, B.door_edge_set('G', {'door.bank.stair_G', 'door.bank.lobby_service', 'door.bank.lobby_office'}))
    mb = MB(seed=140)
    for p0, p1, holes in runs:
        mb.wall(p0, p1, 0.0, 1.95, 0.1, holes=holes, out_mat='paper', out_col=PAL['ivory'], in_mat='paper', in_col=PAL['ivory'])
    # the security office door stays shut (locked door leaf in the doorway)
    d = W(17.5, 5.0, 0)
    mb.panel(d + Vector((-0.31, 0.02, 0)), Vector((0.62, 0, 0)), UP * 1.4, 0.03, 'wood', PAL['slate'])
    mb.build('bank__G__walls_int', parent=gG, col=col, pivot=W(0, 0, 0), props={'bj_role': 'part', 'bj_cut': 1})
    furniture_G(gG, col)

    # ---------------- upper floor
    gU = level_group('bank__U', 'U', root, col, LV['U'])
    mb = MB(seed=150)
    B.floor_slab(mb, [MAIN], LV['U'], PAL['wood'], mat='plank', thick=0.1)
    mb.build('bank__U__floor', parent=gU, col=col, pivot=W(0, 0, LV['U']), props={'bj_role': 'part'})
    south_U = [(i, 'window', {'h': 0.95, 'sill': 0.55}) for i in (0, 1, 2, 3, 6, 7, 8, 9)]
    north_U = [(i, 'window', {'w': 0.42, 'h': 0.8, 'sill': 0.7}) for i in range(0, 8)]
    east_U = [(i, 'window', {'w': 0.42, 'h': 0.8, 'sill': 0.7}) for i in (0, 2, 3, 6)] + [(4, 'door', {'w': 0.58, 'h': 1.34, 'col': PAL['slate']})]
    specs_U = {'s': south_U, 'n': north_U, 'e': east_U, 'w': []}
    for side in 'nesw':
        sg = side_group(f'bank__U__wall_{side}', 'U', side, gU, col, LV['U'])
        mb = MB(seed=160 + ord(side))
        deco, start, along, out = B.exterior_side(mb, side, MAIN, LV['U'], 4.0, specs_U[side], out_mat='wall', out_col=STONE)
        B.decorate(mb, deco, start, along, out, LV['U'], frame_col=PAL['white'], door_col=PAL['slate'])
        facade_details(mb, side, LV['U'], 4.0, ground=False)
        if side == 'e':
            # iron ladder from the annex roof to the roof deck (portal.roof_ladder)
            base = W(21.06, 8.5, LV['U'])
            for s in (-0.18, 0.18):
                mb.box(base.x, base.y + s - 0.02, LV['U'], base.x + 0.05, base.y + s + 0.02, LV['R'] + 0.55, 'paper', PAL['rust'], edge=None)
            for k in range(8):
                z = LV['U'] + 0.25 + k * 0.28
                mb.box(base.x, base.y - 0.18, z, base.x + 0.05, base.y + 0.18, z + 0.03, 'paper', PAL['rust'], edge=None)
        mb.build(f'bank__U__wall_{side}__mesh', parent=sg, col=col, pivot=W(0, 0, LV['U']), props={'bj_role': 'part'})
    amap = B.building_area_map('bank', 'U', lambda a: a['id'] != 'bank.U.westwing')
    runs = B.interior_runs(amap, B.door_edge_set('U', {'door.bank.stair_U', 'door.bank.glass'}))
    mb = MB(seed=170)
    for p0, p1, holes in runs:
        mb.wall(p0, p1, LV['U'], LV['U'] + 1.95, 0.1, holes=holes, out_mat='paper', out_col=PAL['ivory'], in_mat='paper', in_col=PAL['ivory'])
    # Glass Room frontage: a glazed partition beside the (laser) doorway
    g0 = W(13.05, 5.0, LV['U'] + 0.9)
    mb.panel(g0 + Vector((0, 0.03, 0)), Vector((2.8, 0, 0)), UP * 0.8, 0.02, 'glass', PAL['glass'])
    mb.build('bank__U__walls_int', parent=gU, col=col, pivot=W(0, 0, LV['U']), props={'bj_role': 'part', 'bj_cut': 1})
    furniture_U(gU, col)

    # ---------------- roof deck
    gR = level_group('bank__R', 'R', root, col, LV['R'])
    mb = MB(seed=180)
    A.flat_roof(mb, *MAIN, LV['R'], PAL['warmgray'], parapet_h=0.38, parapet_col=STONE, cap_col=PAL['stone'],
                gaps=[('e', 1.2, 1.8)])
    # cornice band under the parapet
    for side in 'nesw':
        s, e = A.edge_line(side, *MAIN)
        along, out = A.dir_vectors(side)
        dn = (e - s).normalized()
        mb.panel(s - dn * 0.1 + out * 0.14 + UP * (LV['R'] - 0.12), dn * ((e - s).length + 0.2), -out * 0.2 + UP * 0.0, 0.1, 'paper', STONE_DARK)
    # skylight (glass pyramid) over the Glass Room at (15,3): portal.skylight
    c = W(15.5, 3.5, LV['R'])
    s = 0.42
    K.rect_box(mb, 15, 3, 15, 3, LV['R'], LV['R'] + 0.12, 'paper', PAL['slate'], inset=0.05)
    apex = c + UP * 0.55
    corners = [c + Vector((-s, -s, 0.12)), c + Vector((s, -s, 0.12)), c + Vector((s, s, 0.12)), c + Vector((-s, s, 0.12))]
    for i in range(4):
        mb.face([corners[i], corners[(i + 1) % 4], apex], 'glass', PAL['glass'])
    # HVAC units and vent stacks
    for (x, z) in ((18, 7), (12, 7)):
        K.rect_box(mb, x, z, x + 1, z, LV['R'], LV['R'] + 0.45, 'paper', PAL['gray'], inset=0.1)
        cc = W(x + 1.0, z + 0.5, LV['R'] + 0.45)
        mb.cylinder(cc, 0.22, 0.22, 0.04, 10, 'paper', PAL['slate'])
    for (x, z) in ((13.3, 8.6), (19.4, 3.3), (17.2, 8.7)):
        mb.cylinder(W(x, z, LV['R']), 0.07, 0.07, 0.4, 6, 'paper', PAL['slate_light'])
    mb.build('bank__R__deck', parent=gR, col=col, pivot=W(0, 0, LV['R']), props={'bj_role': 'part'})
    return root


def facade_details(mb: MB, side: str, y0: float, y1: float, ground: bool):
    """Pilasters, base course and string course on a façade side."""
    s, e = A.edge_line(side, *MAIN)
    along, out = A.dir_vectors(side)
    dn = (e - s).normalized()
    Lr = (e - s).length
    o = out * (A.WALL_T / 2)
    if ground:
        mb.panel(s - dn * 0.04 + o + out * 0.03 + UP * y0, dn * (Lr + 0.08), UP * 0.26, 0.06, 'paper', PAL['stone_dark'])
    mb.panel(s - dn * 0.04 + o + out * 0.04 + UP * (y1 - 0.12), dn * (Lr + 0.08), UP * 0.12, 0.07, 'paper', PAL['stone'])
    n = int(round(Lr))
    for i in range(0, n + 1, 2 if side in 'ns' else 4):
        p = s + dn * i + o + out * 0.03 + UP * (y0 + (0.26 if ground else 0.0))
        mb.panel(p - dn * 0.07, dn * 0.14, UP * (y1 - y0 - (0.38 if ground else 0.12)), 0.05, 'paper', PAL['ivory'])


def slot_pair(parent, col, side, index, name, a_spec, b_spec):
    """Two alternative fillings for a one-tile gap in a side (door vs wall)."""
    y0 = 0.0
    for kind, spec in (a_spec, b_spec):
        vid = f'bank.slot.{name}.{"door" if kind == "door" else "wall"}'
        s0, e0 = A.edge_line(side, *MAIN)
        hinge = s0 + (e0 - s0).normalized() * (index + 0.5)   # base centre of the slot: fold pivot
        node = K.vroot(f'bank__slot_{name}_{"door" if kind == "door" else "wall"}', vid, loc=hinge, anim='fold', col=col, parent=parent, side=side)
        mb = MB(seed=hash(vid) % 1000)
        B.slot_wall(mb, side, MAIN, index, y0, 2.0, 'door' if kind == 'door' else ('window' if kind == 'window' else 'plain'), spec,
                    out_col=STONE, out_mat='brick', door_col=spec.get('col', PAL['wood']))
        if kind == 'door':
            # step + lamp beside the service door
            s, e = A.edge_line(side, *MAIN)
            along, out = A.dir_vectors(side)
            dn = (e - s).normalized()
            c = s + dn * (index + 0.5) + out * 0.2
            mb.box(c.x - 0.35, c.y - 0.35, 0.0, c.x + 0.35, c.y + 0.35, 0.04, 'paper', PAL['stone_dark'])
        mb.build(f'bank__slot_{name}_{kind}__mesh', parent=node, col=col, pivot=W(0, 0, 0), props={'bj_role': 'part'})


# ---------------------------------------------------------------------------------------------
# furniture
# ---------------------------------------------------------------------------------------------

def furniture_B(parent, col):
    y = LV['B']
    mb = MB(seed=200)
    # stairs: basement → ground (east half of the stairwell)
    A.stairs(mb, W(12.5, 4.95, y), Vector((0, 1, 0)), Vector((1, 0, 0)), 0.9, 2.0, 2.7, 11, col=PAL['stone'])
    # archive shelves along the north and west walls
    for x in range(13, 17):
        K.rect_box(mb, x, 2, x, 2, y, y + 1.5, 'wood', PAL['wood'], inset=0.08)
        for k in range(4):
            yy = y + 0.3 + k * 0.33
            a = W(x + 0.12, 2.35, yy)
            mb.box(a.x, a.y - 0.02, yy, a.x + 0.76, a.y + 0.3, yy + 0.24, 'paper', [PAL['ochre_pale'], PAL['sky'], PAL['rose'], PAL['sage']][(x + k) % 4])
    K.rect_box(mb, 16, 3, 16, 4, y, y + 1.3, 'wood', PAL['wood'], inset=0.1)
    # vault: deposit-box walls along the north and east sides (plank print reads as drawers)
    for (x, z) in ((17, 2), (18, 2), (19, 2), (20, 2), (20, 3), (20, 4)):
        K.rect_box(mb, x, z, x, z, y, y + 1.6, 'plank', PAL['slate_light'], inset=0.12)
    # round vault door (heavy steel disc) in the vault doorway, hinged on its west side
    # boiler, pipes
    K.rect_box(mb, 13, 8, 14, 8, y, y + 1.3, 'paper', PAL['rust'], inset=0.08)
    mb.cylinder(W(14.0, 8.5, y + 1.3), 0.12, 0.12, 0.6, 6, 'paper', PAL['pipe'])
    for x in (11, 12, 13):
        a = W(x, 9.8, y + 1.5)
        mb.box(a.x, a.y - 0.05, a.z, a.x + 1, a.y + 0.05, a.z + 0.1, 'paper', PAL['pipe'], edge=None)
    # storage crates (closed room)
    for (x, z) in ((16, 8), (18, 8), (19, 7)):
        K.rect_box(mb, x, z, x, z, y, y + 0.6, 'plank', PAL['wood_light'], inset=0.12)
    mb.build('bank__B__furniture', parent=parent, col=col, pivot=W(0, 0, y), props={'bj_role': 'part'})
    # vault door leaf (dynamic: swings open when the maglock releases)
    vd = K.group('bank__vaultdoor', parent=parent, col=col, loc=W(18.12, 5.0, y), role='dynamic', dynamic='vaultDoor')
    mb = MB(seed=210)
    c = W(18.5, 5.0, y + 0.75)
    ring = [c + Vector((math.cos(a) * 0.62, 0, math.sin(a) * 0.62)) for a in [i / 12 * math.tau for i in range(12)]]
    ring2 = [p + Vector((0, 0.1, 0)) for p in ring]
    for i in range(12):
        j = (i + 1) % 12
        mb.face([ring[i], ring[j], ring2[j], ring2[i]], 'paper', PAL['slate'])
    mb.face(list(reversed(ring)), 'paper', PAL['slate_light'])
    mb.face(ring2, 'paper', PAL['slate'])
    for k in range(3):
        a = k / 3 * math.tau
        mb.box(c.x + math.cos(a) * 0.3 - 0.03, c.y - 0.06, c.z + math.sin(a) * 0.3 - 0.03, c.x + math.cos(a) * 0.3 + 0.03, c.y, c.z + math.sin(a) * 0.3 + 0.03, 'paper', PAL['copper'], edge=None)
    mb.build('bank__vaultdoor__leaf', parent=vd, col=col, pivot=W(18.12, 5.0, y), props={'bj_role': 'part'})


def furniture_G(parent, col):
    mb = MB(seed=220)
    # teller counter along the lobby's north wall
    a = W(14.1, 5.55, 0)
    b = W(19.9, 5.15, 0)
    mb.box(a.x, b.y, 0, b.x, a.y, 0.62, 'wood', PAL['wood'])
    mb.box(a.x - 0.05, b.y - 0.05, 0.62, b.x + 0.05, a.y + 0.05, 0.68, 'paper', PAL['stone'])
    for i in range(5):
        p = W(14.6 + i * 1.15, 5.35, 0.68)
        mb.box(p.x - 0.02, p.y - 0.02, 0.68, p.x + 0.02, p.y + 0.02, 1.15, 'paper', PAL['copper'], edge=None)
    # waiting bench, rope stands
    K.rect_box(mb, 19, 8, 19, 8, 0, 0.35, 'wood', PAL['wood_light'], inset=0.12)
    for x in (14.2, 15.2, 16.8, 17.8):
        mb.cylinder(W(x, 7.2, 0), 0.05, 0.04, 0.7, 6, 'paper', PAL['copper'])
    # security office: desk + monitors (seen through the cutaway)
    K.rect_box(mb, 18, 2, 19, 2, 0, 0.55, 'wood', PAL['wood'], inset=0.12)
    for i in range(3):
        p = W(18.3 + i * 0.5, 2.35, 0.55)
        mb.box(p.x, p.y, 0.55, p.x + 0.38, p.y + 0.06, 0.85, 'paper', PAL['ink'], edge=None)
        mb.box(p.x + 0.03, p.y - 0.005, 0.58, p.x + 0.35, p.y, 0.82, 'glass', PAL['teal_pale'], edge=None)
    # stairs ground → upper
    A.stairs(mb, W(12.5, 4.95, 0), Vector((0, 1, 0)), Vector((1, 0, 0)), 0.9, 2.0, 2.7, 11, col=PAL['stone'])
    # service corridor lockers
    K.rect_box(mb, 11, 8, 11, 9, 0, 1.2, 'paper', PAL['slate_light'], inset=0.22)
    mb.build('bank__G__furniture', parent=parent, col=col, pivot=W(0, 0, 0), props={'bj_role': 'part'})
    # service doors: dynamic leaves (open during deliveries)
    for name, tile, side in (('front', (12, 9), 's'), ('alley', (11, 7), 'w')):
        s, e = A.edge_line(side, *MAIN)
        along, out = A.dir_vectors(side)
        dn = (e - s).normalized()
        idx = B.side_u(side, MAIN, *tile)
        hinge = s + dn * (idx + 0.5 - 0.3)
        g = K.group(f'bank__servicedoor_{name}', parent=parent, col=col, loc=hinge, role='dynamic', dynamic=f'serviceDoor.{name}')
        mb = MB(seed=230)
        mb.panel(hinge - out * 0.02, dn * 0.6, UP * 1.34, 0.04, 'wood', PAL['slate'])
        mb.build(f'bank__servicedoor_{name}__leaf', parent=g, col=col, pivot=hinge, props={'bj_role': 'part'})


def furniture_U(parent, col):
    y = LV['U']
    mb = MB(seed=240)
    # Glass Room: pedestal with glass case at (15,2); portraits; velvet ropes
    c = W(15.5, 2.5, y)
    mb.cylinder(c, 0.28, 0.24, 0.72, 8, 'paper', PAL['stone'])
    mb.cylinder(c + UP * 0.72, 0.3, 0.3, 0.05, 8, 'paper', PAL['stone_dark'])
    for (dx, dy) in ((-0.2, -0.2), (0.2, -0.2), (0.2, 0.2), (-0.2, 0.2)):
        mb.box(c.x + dx - 0.01, c.y + dy - 0.01, y + 0.77, c.x + dx + 0.01, c.y + dy + 0.01, y + 1.17, 'glass', PAL['glass_dark'], edge=None)
    for (a, b_) in (((-0.2, -0.2), (0.2, -0.2)), ((0.2, -0.2), (0.2, 0.2)), ((0.2, 0.2), (-0.2, 0.2)), ((-0.2, 0.2), (-0.2, -0.2))):
        p = c + Vector((a[0], a[1], 0.77))
        q = c + Vector((b_[0], b_[1], 0.77))
        mb.panel(p, q - p, UP * 0.4, 0.004, 'glass', PAL['glass'])
    for x in (13, 17, 18):
        a = W(x + 0.2, 2.06, y + 0.7)
        mb.box(a.x, a.y - 0.03, a.z, a.x + 0.6, a.y, a.z + 0.7, 'paper', [PAL['ochre_pale'], PAL['rose'], PAL['sky']][x % 3])
        mb.box(a.x + 0.05, a.y - 0.035, a.z + 0.05, a.x + 0.55, a.y - 0.03, a.z + 0.65, 'paper', PAL['sage_dark'])
    for x in (14.2, 16.8):
        mb.cylinder(W(x, 3.6, y), 0.05, 0.04, 0.6, 6, 'paper', PAL['copper'])
    # offices: desks behind the closed doors
    for x in (12, 15, 18):
        K.rect_box(mb, x, 8, x + 1, 8, y, y + 0.55, 'wood', PAL['wood'], inset=0.15)
    K.rect_box(mb, 19, 3, 20, 3, y, y + 0.55, 'wood', PAL['wood'], inset=0.15)
    # stair head rail
    A.railing(mb, W(12.05, 2.1, y), W(12.05, 4.9, y), height=0.4, posts=4)
    mb.build('bank__U__furniture', parent=parent, col=col, pivot=W(0, 0, y), props={'bj_role': 'part'})


# ---------------------------------------------------------------------------------------------
# annex, wings, 1946 site
# ---------------------------------------------------------------------------------------------

def build_annex(col):
    root = K.vroot('bank__annex', 'bank.annex', loc=W(22.5, 6, 0), anim='rise', col=col, building='annex')
    g = K.group('annex__G', parent=root, col=col, level='G', building='annex', role='level')
    mb = MB(seed=300)
    B.floor_slab(mb, [ANNEX], 0.0, PAL['concrete'], mat='paving')
    mb.build('annex__G__floor', parent=g, col=col, pivot=W(0, 0, 0), props={'bj_role': 'part'})
    east = [(1, 'window', {'w': 0.45}), (2, 'wide', {'w': 1.3, 'h': 1.5, 'center': 1.0, 'col': PAL['slate_light']}), (5, 'window', {'w': 0.45}), (6, 'window', {'w': 0.45})]
    south = [(1, 'window', {'w': 0.5})]
    north = [(1, 'window', {'w': 0.5})]
    for side, spec in (('e', east), ('s', south), ('n', north)):
        sg = K.group(f'annex__G__wall_{side}', parent=g, col=col, level='G', side=side, building='annex', role='side')
        mb = MB(seed=310 + ord(side))
        deco, start, along, out = B.exterior_side(mb, side, ANNEX, 0.0, 1.9, spec, out_mat='brick', out_col=PAL['stone'])
        B.decorate(mb, deco, start, along, out, 0.0, frame_col=PAL['white'], door_col=PAL['slate_light'])
        mb.build(f'annex__G__wall_{side}__mesh', parent=sg, col=col, pivot=W(0, 0, 0), props={'bj_role': 'part'})
    # walkable roof with parapet (U level, outdoor)
    r = K.group('annex__roof', parent=root, col=col, level='U', building='annex', role='roof')
    mb = MB(seed=320)
    A.flat_roof(mb, *ANNEX, LV['U'], PAL['warmgray'], parapet_h=0.28, parapet_col=PAL['stone'], cap_col=PAL['stone_dark'])
    # gravel texture strips and a roof drain
    mb.cylinder(W(23.4, 8.6, LV['U']), 0.08, 0.08, 0.03, 8, 'paper', PAL['ink'])
    mb.build('annex__roof__deck', parent=r, col=col, pivot=W(0, 0, LV['U']), props={'bj_role': 'part'})
    K.anchor('anchor__portal_oak_top', 'portal.oak.b', W(23.5, 5.5, LV['U']), parent=root, col=col)
    K.anchor('anchor__portal_ladder_bottom', 'portal.roof_ladder.a', W(21.5, 8.5, LV['U']), parent=root, col=col)
    K.anchor('anchor__door_upper_service', 'door.bank.upper_service', W(21.0, 5.5, LV['U']), parent=root, col=col)
    return root


def build_westwing(col):
    root = K.vroot('bank__westwing', 'bank.westwing', loc=W(10, 6, 0), anim='rise', col=col, building='westwing')
    brick = PAL['brick']
    for lvl, y0, y1 in (('G', 0.0, 2.0), ('U', LV['U'], 4.0)):
        g = K.group(f'westwing__{lvl}', parent=root, col=col, loc=Vector((0, 0, y0)), level=lvl, building='westwing', role='level')
        mb = MB(seed=400 + ord(lvl))
        B.floor_slab(mb, [WEST], y0, PAL['concrete'] if lvl == 'G' else PAL['wood'], mat='paving' if lvl == 'G' else 'plank')
        mb.build(f'westwing__{lvl}__floor', parent=g, col=col, pivot=W(0, 0, y0), props={'bj_role': 'part'})
        specs = {
            's': [(0, 'window', {'w': 0.5, 'h': 0.7, 'sill': 0.7})] if lvl == 'U' else [],
            'n': [(1, 'window', {'w': 0.4, 'h': 0.6, 'sill': 0.8})],
            'w': [],
        }
        for side, spec in specs.items():
            sg = K.group(f'westwing__{lvl}__wall_{side}', parent=g, col=col, loc=Vector((0, 0, y0)), level=lvl, side=side, building='westwing', role='side')
            mb = MB(seed=410 + ord(side) + ord(lvl))
            deco, start, along, out = B.exterior_side(mb, side, WEST, y0, y1, spec, out_mat='brick', out_col=brick)
            B.decorate(mb, deco, start, along, out, y0, frame_col=PAL['teal_pale'])
            mb.build(f'westwing__{lvl}__wall_{side}__mesh', parent=sg, col=col, pivot=W(0, 0, y0), props={'bj_role': 'part'})
        if lvl == 'G':
            # interior: plant room | records, the junction box sits on the workshop wall (x=9 west wall)
            mb = MB(seed=430)
            mb.wall(W(9, 6), W(11, 6), 0.0, 1.95, 0.1, out_mat='paper', out_col=PAL['ivory'], in_mat='paper', in_col=PAL['ivory'])
            # plant room machinery
            K.rect_box(mb, 10, 2, 10, 2, 0, 1.1, 'paper', PAL['gray'], inset=0.1)
            mb.cylinder(W(9.5, 5.5, 0), 0.2, 0.2, 0.9, 8, 'paper', PAL['teal_pale'])
            mb.build('westwing__G__walls_int', parent=g, col=col, pivot=W(0, 0, 0), props={'bj_role': 'part', 'bj_cut': 1})
    r = K.group('westwing__roof', parent=root, col=col, level='R', building='westwing', role='roof')
    mb = MB(seed=440)
    A.flat_roof(mb, *WEST, 4.05, PAL['slate_light'], parapet_h=0.25, parapet_col=brick, cap_col=PAL['stone'])
    mb.build('westwing__roof__deck', parent=r, col=col, pivot=W(0, 0, 4.05), props={'bj_role': 'part'})
    # 1986 sign on the square-facing façade
    mb = MB(jitter=0)
    A.sign(mb, W(10.0, 10.02, 3.2), Vector((1, 0, 0)), Vector((0, -1, 0)), 'WEST WING  1986', 0.16, PAL['teal'], PAL['white'])
    mb.build('westwing__sign', parent=root, col=col, props={'bj_role': 'part'})
    return root


def build_gardenwing(col):
    root = K.vroot('bank__gardenwing', 'bank.gardenwing', loc=W(25.5, 14, 0), anim='rise', col=col, building='gardenwing')
    g = K.group('gardenwing__G', parent=root, col=col, level='G', building='gardenwing', role='level')
    mb = MB(seed=500)
    B.floor_slab(mb, [GARDEN], 0.0, PAL['concrete'], mat='paving')
    mb.build('gardenwing__G__floor', parent=g, col=col, pivot=W(0, 0, 0), props={'bj_role': 'part'})
    ribbon = {'w': 0.8, 'h': 0.55, 'sill': 0.9, 'mullions': 0}
    for side in 'nesw':
        n = 7 if side in 'ns' else 8
        spec = [(i, 'window', ribbon) for i in range(n) if i % 2 == 0]
        if side == 'w':
            spec = [(i, 'window', ribbon) for i in (0, 2, 6)] + [(4, 'door', {'w': 0.9, 'h': 1.4, 'glass': True, 'col': PAL['teal_pale']})]
        sg = K.group(f'gardenwing__G__wall_{side}', parent=g, col=col, level='G', side=side, building='gardenwing', role='side')
        mb = MB(seed=510 + ord(side))
        deco, start, along, out = B.exterior_side(mb, side, GARDEN, 0.0, 2.2, spec, out_mat='paving', out_col=PAL['teal_pale'])
        B.decorate(mb, deco, start, along, out, 0.0, frame_col=PAL['slate'], glass_col=PAL['glass_dark'])
        mb.build(f'gardenwing__G__wall_{side}__mesh', parent=sg, col=col, pivot=W(0, 0, 0), props={'bj_role': 'part'})
    r = K.group('gardenwing__roof', parent=root, col=col, level='R', building='gardenwing', role='roof')
    mb = MB(seed=520)
    A.flat_roof(mb, *GARDEN, 2.3, PAL['slate_light'], parapet_h=0.2, parapet_col=PAL['teal'], cap_col=PAL['slate'])
    for (x, z) in ((24, 12), (26, 15)):
        K.rect_box(mb, x, z, x + 1, z, 2.3, 2.7, 'paper', PAL['gray'], inset=0.1)
    A.sign(mb, W(25.5, 18.02, 1.7), Vector((1, 0, 0)), Vector((0, -1, 0)), 'RIVERDALE SAVINGS  GARDEN WING', 0.17, PAL['slate'], PAL['white'])
    mb.build('gardenwing__roof__deck', parent=r, col=col, pivot=W(0, 0, 2.3), props={'bj_role': 'part'})
    return root


def build_site1946(col):
    root = K.vroot('bank__site1946', 'bank.site1946', loc=W(16, 6, 0), anim='rise', col=col, building='bank')
    mb = MB(seed=600, jitter=0.05)
    # basement walls rising out of the pit (seen in the underground view) and half-built ground floor
    for side in 'nesw':
        B.exterior_side(mb, side, MAIN, LV['B'], -0.02, [], out_mat='brick', out_col=PAL['brick'], in_col=PAL['brick'])
    heights = {'n': 1.3, 'w': 0.9, 's': 0.45, 'e': 0.7}
    for side, h in heights.items():
        s, e = A.edge_line(side, *MAIN)
        dn = (e - s).normalized()
        Lr = (e - s).length
        # stepped unfinished top
        for k in range(int(Lr)):
            hh = h * (0.6 + 0.4 * ((k * 37) % 5) / 4)
            a = s + dn * k
            b = s + dn * (k + 1)
            mb.wall(a, b, 0.0, hh, A.WALL_T, out_mat='brick', out_col=PAL['brick'], in_mat='brick', in_col=PAL['brick_dark'])
    # site hoarding along the square with the opening sign
    for x in range(11, 21):
        a = W(x + 0.05, 10.25, 0)
        mb.panel(a, Vector((0.9, 0, 0)), UP * 0.8, 0.03, 'plank', PAL['wood_light'] if x % 2 else PAL['wood'])
    A.sign(mb, W(15.5, 10.2, 0.9), Vector((1, 0, 0)), Vector((0, -1, 0)), 'RIVERDALE SAVINGS  -  OPENING 1948', 0.15, PAL['ochre'], PAL['ink'])
    # scaffolding along the north side
    for x in range(11, 22, 2):
        for z in (1.35,):
            p = W(x, z, 0)
            mb.box(p.x - 0.03, p.y - 0.03, 0, p.x + 0.03, p.y + 0.03, 2.6, 'wood', PAL['wood'], edge=None)
    for hgt in (1.2, 2.4):
        a = W(11, 1.25, hgt)
        b = W(21, 1.45, hgt)
        mb.box(a.x, b.y, hgt, b.x, a.y, hgt + 0.05, 'plank', PAL['wood_light'])
    # brick stacks, cement mixer, wheelbarrow, cable drum (Brandt Electric)
    for (x, z) in ((13, 7), (18, 4), (22, 6)):
        K.rect_box(mb, x, z, x, z, 0, 0.35, 'brick', PAL['brick'], inset=0.2)
    mix = W(22.5, 3.5, 0)
    mb.cylinder(mix + UP * 0.2, 0.28, 0.2, 0.45, 8, 'paper', PAL['ochre'])
    mb.box(mix.x - 0.3, mix.y - 0.05, 0, mix.x + 0.3, mix.y + 0.05, 0.25, 'paper', PAL['slate'], edge=None)
    drum = W(10.5, 4.5, 0.3)
    ring = [drum + Vector((0, math.cos(a) * 0.3, math.sin(a) * 0.3)) for a in [i / 10 * math.tau for i in range(10)]]
    for i in range(10):
        j = (i + 1) % 10
        mb.face([ring[i], ring[j], ring[j] + Vector((0.3, 0, 0)), ring[i] + Vector((0.3, 0, 0))], 'wood', PAL['wood'])
    mb.face(list(reversed(ring)), 'wood', PAL['wood_light'])
    mb.face([p + Vector((0.3, 0, 0)) for p in ring], 'wood', PAL['wood_light'])
    mb.build('bank__site1946__works', parent=root, col=col, props={'bj_role': 'part', 'bj_anim': 'rise'})
    # tower crane on the annex lot
    cr = K.group('bank__site1946__crane', parent=root, col=col, loc=W(22.5, 7.5, 0), role='part', anim='rise')
    mb = MB(seed=610)
    base = W(22.5, 7.5, 0)
    for k in range(6):
        z0, z1 = k * 0.9, (k + 1) * 0.9
        for (dx, dy) in ((-0.15, -0.15), (0.15, -0.15), (0.15, 0.15), (-0.15, 0.15)):
            mb.box(base.x + dx - 0.02, base.y + dy - 0.02, z0, base.x + dx + 0.02, base.y + dy + 0.02, z1, 'paper', PAL['ochre'], edge=None)
        mb.box(base.x - 0.17, base.y - 0.17, z1 - 0.03, base.x + 0.17, base.y + 0.17, z1, 'paper', PAL['ochre'], edge=None)
    top = base + UP * 5.4
    mb.box(top.x - 4.5, top.y - 0.08, top.z, top.x + 1.5, top.y + 0.08, top.z + 0.16, 'paper', PAL['ochre'], edge=None)
    mb.box(top.x + 1.0, top.y - 0.2, top.z - 0.3, top.x + 1.5, top.y + 0.2, top.z + 0.1, 'paper', PAL['concrete'])
    mb.box(top.x - 0.25, top.y - 0.25, top.z - 0.4, top.x + 0.25, top.y + 0.25, top.z, 'paper', PAL['ochre_pale'])
    hook = top + Vector((-3.6, 0, 0))
    mb.box(hook.x - 0.01, hook.y - 0.01, hook.z - 2.5, hook.x + 0.01, hook.y + 0.01, hook.z, 'paper', PAL['ink'], edge=None)
    mb.box(hook.x - 0.3, hook.y - 0.2, hook.z - 2.85, hook.x + 0.3, hook.y + 0.2, hook.z - 2.5, 'brick', PAL['brick'])
    mb.build('bank__site1946__crane__mesh', parent=cr, col=col, pivot=base, props={'bj_role': 'part'})
    return root


# ---------------------------------------------------------------------------------------------
# era trims, hatch, cameras, contract props
# ---------------------------------------------------------------------------------------------

def build_trims(col):
    for era, accent, accent_pale in ((1986, PAL['teal'], PAL['teal_pale']), (2026, PAL['coral'], PAL['coral_pale'])):
        root = K.vroot(f'bank__trim{era}', f'bank.trim{era}', loc=W(16, 10, 0), anim='unfurl', col=col, building='bank')
        mb = MB(seed=700 + era, jitter=0.02)
        s_along, s_out = A.dir_vectors('s')
        # name sign above the entrance (U level façade)
        A.sign(mb, W(16.0, 10.0, 2.55) + s_out * 0.08, s_along, s_out, 'RIVERDALE SAVINGS', 0.26, PAL['stone'], PAL['charcoal'] if era == 1986 else PAL['ink'], width=4.1)
        # banners either side of the doors
        for x in (13.5, 18.5):
            A.banner(mb, W(x, 10.0, 3.7) + s_out * 0.08, s_along, s_out, 0.5, 1.2, accent, PAL['white'])
        # entrance canopy
        c0 = W(14.6, 10.0, 1.78)
        mb.panel(c0 + s_out * 0.55 + UP * 0.02, s_along * 2.8, -s_out * 0.55 + UP * 0.1, 0.05, 'paper', accent)
        # parapet cap stripe in the era accent
        for side in 'nesw':
            s, e = A.edge_line(side, *MAIN)
            along, out = A.dir_vectors(side)
            dn = (e - s).normalized()
            mb.panel(s - dn * 0.12 + out * 0.1 + UP * (LV['R'] + 0.43), dn * ((e - s).length + 0.24), -out * 0.24, 0.04, 'paper', accent)
        # steps in front of the main door
        A.stairs(mb, W(16.0, 10.95, 0.0), Vector((0, 1, 0)), Vector((1, 0, 0)), 2.2, 0.1, 0.6, 2, col=PAL['stone'])
        if era == 2026:
            # security lights and a card reader by the service door; brass plaque
            for x in (11.3, 20.7):
                p = W(x, 10.0, 1.7) + s_out * 0.1
                mb.box(p.x - 0.08, p.y - 0.06, p.z, p.x + 0.08, p.y + 0.06, p.z + 0.1, 'paper', PAL['charcoal'], edge=None)
            A.sign(mb, W(17.6, 10.0, 1.2) + s_out * 0.08, s_along, s_out, 'EST. 1948', 0.09, PAL['copper'], PAL['ink'])
        else:
            A.sign(mb, W(17.6, 10.0, 1.2) + s_out * 0.08, s_along, s_out, 'OPEN 9-4', 0.09, PAL['teal_pale'], PAL['ink'])
        mb.build(f'bank__trim{era}__mesh', parent=root, col=col, props={'bj_role': 'part'})


def build_hatch(col):
    root = K.vroot('bank__hatch', 'bank.hatch', loc=W(12.5, 8.5, LV['B']), anim='pop', col=col, level='B')
    y = LV['B']
    c = W(12.5, 8.5, y)
    mb = MB(seed=800)
    K.rect_box(mb, 12, 8, 12, 8, y, y + 0.03, 'paper', PAL['slate'], inset=0.12)
    mb.build('bank__hatch__frame', parent=root, col=col, props={'bj_role': 'part'})
    lid = K.group('bank__hatch__lid', parent=root, col=col, loc=c + Vector((-0.34, 0, 0.03)), role='dynamic', dynamic='hatchLid')
    mb = MB(seed=801)
    mb.box(c.x - 0.34, c.y - 0.34, y + 0.03, c.x + 0.34, c.y + 0.34, y + 0.07, 'paper', PAL['rust'])
    for k in range(3):
        mb.box(c.x - 0.28 + k * 0.25, c.y - 0.3, y + 0.07, c.x - 0.24 + k * 0.25, c.y + 0.3, y + 0.085, 'paper', PAL['ink'], edge=None)
    mb.build('bank__hatch__lid__mesh', parent=lid, col=col, pivot=c + Vector((-0.34, 0, 0.03)), props={'bj_role': 'part'})
    K.anchor('anchor__portal_hatch_top', 'portal.hatch.b', W(12.5, 8.5, y), parent=root, col=col)


def camera_model(mb: MB, origin: Vector, dome=False):
    """Security camera facing +X (yaw 0 in grid space) with its pivot at `origin`."""
    if dome:
        mb.cylinder(origin - UP * 0.02, 0.14, 0.14, 0.04, 10, 'paper', PAL['charcoal'])
        mb.blob(origin - UP * 0.06, Vector((0.12, 0.12, 0.09)), 'glass', [PAL['ink']], subdiv=1, seed=5)
        mb.box(origin.x + 0.05, origin.y - 0.02, origin.z - 0.14, origin.x + 0.13, origin.y + 0.02, origin.z - 0.1, 'paper', PAL['red'], edge=None)
        return
    mb.box(origin.x - 0.05, origin.y - 0.05, origin.z - 0.05, origin.x + 0.05, origin.y + 0.05, origin.z + 0.05, 'paper', PAL['charcoal'], edge=None)
    body0 = origin + Vector((0.02, 0, -0.08))
    mb.box(body0.x, body0.y - 0.07, body0.z - 0.06, body0.x + 0.34, body0.y + 0.07, body0.z + 0.06, 'paper', PAL['white'])
    mb.box(body0.x + 0.34, body0.y - 0.05, body0.z - 0.045, body0.x + 0.38, body0.y + 0.05, body0.z + 0.045, 'glass', PAL['ink'], edge=None)
    mb.box(body0.x - 0.02, body0.y - 0.09, body0.z + 0.06, body0.x + 0.4, body0.y + 0.09, body0.z + 0.08, 'paper', PAL['charcoal'], edge=None)
    mb.box(body0.x + 0.28, body0.y - 0.02, body0.z - 0.1, body0.x + 0.31, body0.y + 0.02, body0.z - 0.06, 'paper', PAL['red'], edge=None)


def build_cameras(col):
    mounts = {c['id']: c for c in L['cameras']}
    root = K.vroot('bank__cams2026', 'bank.cams2026', anim='pop', col=col)
    for cid, m in mounts.items():
        parent = root
        if cid == 'C6':
            parent = K.vroot('bank__cam_C6', 'bank.cam.C6', anim='pop', col=col)
        y = LV[m['level']] + m['mount']
        # mount point: against the wall the camera hangs on (tile centre otherwise)
        pos = W(m['x'] + 0.5, m['z'] + 0.5, y)
        if m['wall'] == 'ne':
            pos = W(m['x'] + 0.85, m['z'] + 0.15, y)
        elif m['wall'] == 'e':
            pos = W(m['x'] + 0.9, m['z'] + 0.5, y)
        elif m['wall'] == 'w':
            pos = W(m['x'] + 0.1, m['z'] + 0.5, y)
        # static bracket / pole (not rotating)
        mb = MB(seed=900 + int(cid[1]))
        if m['wall'] == 'pole':
            base = W(m['x'] + 0.5, m['z'] + 0.5, 0)
            mb.cylinder(base, 0.06, 0.05, 0.1, 6, 'paper', PAL['charcoal'])
            mb.cylinder(base + UP * 0.1, 0.035, 0.03, y - 0.1, 6, 'paper', PAL['charcoal'])
            A.lamp(mb, base + Vector((0.0, 0.0, 0.0)), 2026)
        elif m['wall'] == 'ne' and m['level'] == 'G' and cid == 'C3':
            base = W(m['x'] + 0.5, m['z'] + 0.5, 0)
            pos = base + UP * y
            mb.cylinder(base, 0.05, 0.04, y, 6, 'paper', PAL['charcoal'])
        elif m['wall'] != 'ceiling':
            mb.box(pos.x - 0.04, pos.y - 0.04, pos.z, pos.x + 0.04, pos.y + 0.04, pos.z + 0.18, 'paper', PAL['charcoal'], edge=None)
        if mb.faces:
            mb.build(f'cam__{cid}__mount', parent=parent, col=col, props={'bj_role': 'part'})
        head = K.empty(f'cam__{cid}', pos, parent=parent, col=col,
                       props={'bj_role': 'camera', 'bj_camera': cid, 'bj_level': m['level'], 'bj_yaw0': 0})
        mb = MB(seed=950 + int(cid[1]))
        camera_model(mb, pos, dome=(cid == 'C4'))
        mb.build(f'cam__{cid}__head', parent=head, col=col, pivot=pos, props={'bj_role': 'part'})


def build_contract_props(col):
    yB, yU = LV['B'], LV['U']
    # Linden file (c1): an amber-ribboned box file on the archive shelf at (13,2)
    r = K.vroot('prop__lindenFile', 'prop.lindenFile', loc=W(13.5, 2.55, yB + 0.95), anim='pop', col=col)
    mb = MB(seed=1000)
    c = W(13.5, 2.55, yB + 0.95)
    mb.box(c.x - 0.18, c.y - 0.12, c.z, c.x + 0.18, c.y + 0.12, c.z + 0.3, 'paper', PAL['amber'])
    mb.box(c.x - 0.19, c.y - 0.02, c.z - 0.005, c.x + 0.19, c.y + 0.02, c.z + 0.305, 'paper', PAL['coral'], edge=None)
    mb.build('prop__lindenFile__box', parent=r, col=col, props={'bj_role': 'part'})
    K.anchor('anchor__target_c1', 'target.c1', W(13.5, 2.5, yB), parent=r, col=col)
    # the Glass Diamond (c2)
    r = K.vroot('prop__diamond', 'prop.diamond', loc=W(15.5, 2.5, yU + 0.95), anim='pop', col=col)
    mb = MB(seed=1001, jitter=0)
    c = W(15.5, 2.5, yU + 0.95)
    ring = [c + Vector((math.cos(a) * 0.11, math.sin(a) * 0.11, 0)) for a in [i / 8 * math.tau for i in range(8)]]
    top = c + UP * 0.05
    bot = c - UP * 0.14
    for i in range(8):
        j = (i + 1) % 8
        mb.face([ring[i], ring[j], top], 'glass', PAL['sky'] if i % 2 else PAL['white'], vary=False)
        mb.face([ring[j], ring[i], bot], 'glass', PAL['glass'] if i % 2 else PAL['sky'], vary=False)
    mb.build('prop__diamond__gem', parent=r, col=col, pivot=c, props={'bj_role': 'part', 'bj_spin': 1})
    K.anchor('anchor__target_c2', 'target.c2', W(15.5, 3.5, yU), parent=r, col=col)
    # deposit box 46 (c3) pulled half out of the vault wall
    r = K.vroot('prop__depositBox', 'prop.depositBox', loc=W(20.4, 3.5, yB + 0.8), anim='pop', col=col)
    mb = MB(seed=1002)
    c = W(20.55, 3.5, yB + 0.8)
    mb.box(c.x - 0.25, c.y - 0.12, c.z, c.x, c.y + 0.12, c.z + 0.12, 'paper', PAL['copper'])
    A.sign(mb, c + Vector((-0.26, 0, 0.05)), Vector((0, 1, 0)), Vector((-1, 0, 0)), '46', 0.06, PAL['copper'], PAL['ink'], board=False)
    mb.build('prop__depositBox__box', parent=r, col=col, props={'bj_role': 'part'})
    K.anchor('anchor__target_c3', 'target.c3', W(20.5, 3.5, yB), parent=r, col=col)
    # laser curtain (c2): emitters + beams across the Glass Room doorway
    r = K.vroot('bank__laser', 'bank.laser', loc=W(16.5, 5.0, yU), anim='pop', col=col)
    mb = MB(seed=1003, jitter=0)
    for x in (16.18, 16.82):
        p = W(x, 5.0, yU)
        mb.box(p.x - 0.04, p.y - 0.05, yU, p.x + 0.04, p.y + 0.05, yU + 1.35, 'paper', PAL['charcoal'], edge=None)
    mb.build('bank__laser__emitters', parent=r, col=col, props={'bj_role': 'part'})
    beams = K.group('bank__laser__beams', parent=r, col=col, role='dynamic', dynamic='laserBeams')
    mb = MB(seed=1004, jitter=0)
    for k in range(5):
        z = yU + 0.2 + k * 0.26
        a = W(16.22, 5.0, z)
        b = W(16.78, 5.0, z)
        mb.box(a.x, a.y - 0.008, z, b.x, a.y + 0.008, z + 0.016, 'paper', PAL['red'], edge=None)
    mb.build('bank__laser__beams__mesh', parent=beams, col=col, props={'bj_role': 'part'})


def build_anchors(col):
    """Helper nodes for doors, stairs and roof landings (non-rendered)."""
    root = K.group('bank__anchors', col=col, role='anchors')
    for d in L['doors']:
        if not d['id'].startswith('door.bank'):
            continue
        a, b = d['a'], d['b']
        mid = W((a[0] + b[0]) / 2 + 0.5, (a[1] + b[1]) / 2 + 0.5, LV[d['level']])
        K.anchor(f'anchor__{d["id"].replace(".", "_")}', d['id'], mid, parent=root, col=col, level=d['level'], kind=d['kind'])
    for p in L['portals']:
        for end, key in ((p['a'], 'a'), (p['b'], 'b')):
            K.anchor(f'anchor__{p["id"].replace(".", "_")}_{key}', f'{p["id"]}.{key}', W(end['x'] + 0.5, end['z'] + 0.5, LV[end['level']]),
                     parent=root, col=col, level=end['level'], kind=p['kind'])
    # pick proxies for planning inspection
    K.proxy('proxy__bank', 'site.bank', W(16, 6, 2.2), Vector((10, 8, 4.4)), parent=root, col=col)
    K.proxy('proxy__bankService', 'site.bankService', W(12.5, 10.3, 0.8), Vector((1.2, 0.8, 1.6)), parent=root, col=col)
    K.proxy('proxy__annexRoof', 'site.annex', W(22.5, 6, 2.1), Vector((3, 8, 0.4)), parent=root, col=col)


def build():
    K.reset_scene()
    col = K.collection('bank')
    build_main(col)
    build_annex(col)
    build_westwing(col)
    build_gardenwing(col)
    build_site1946(col)
    build_trims(col)
    build_hatch(col)
    build_cameras(col)
    build_contract_props(col)
    build_anchors(col)
    K.add_preview_rig(W(16, 6, 1), 22)
    return K.save_and_export('bank', notes='Riverdale Savings: main block, annex, wings, 1946 site, trims, cameras, props.')


if __name__ == '__main__':
    build()

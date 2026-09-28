"""Folded-paper characters on one shared armature ('char__rig') with authored animation clips.

All bodies are skinned (rigid, one bone per part) to the same skeleton, so the runtime clones
the scene once per character and shows a single body.  Characters face +X (grid east = yaw 0).
Clips: idle, walk, climb, crouch, interact, sit.
"""
from __future__ import annotations

import math
import zlib

import bj_kit as K
import bpy
from bj_kit import MB, PAL
from mathutils import Matrix, Quaternion, Vector

FPS = 30
SKIN = (0.91, 0.83, 0.72)
BONES = {
    # name: (head, tail, parent)
    'root': ((0, 0, 0), (0, 0, 0.1), None),
    'hips': ((0, 0, 0.38), (0, 0, 0.46), 'root'),
    'torso': ((0, 0, 0.46), (0, 0, 0.7), 'hips'),
    'head': ((0, 0, 0.7), (0, 0, 0.9), 'torso'),
    'armL': ((0, 0.18, 0.67), (0, 0.18, 0.4), 'torso'),
    'armR': ((0, -0.18, 0.67), (0, -0.18, 0.4), 'torso'),
    'legL': ((0, 0.075, 0.38), (0, 0.075, 0.03), 'hips'),
    'legR': ((0, -0.075, 0.38), (0, -0.075, 0.03), 'hips'),
}


def make_rig(col):
    arm = bpy.data.armatures.new('char__rig')
    obj = bpy.data.objects.new('char__rig', arm)
    col.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for name, (h, t, parent) in BONES.items():
        eb = arm.edit_bones.new(name)
        eb.head = Vector(h)
        eb.tail = Vector(t)
        eb.roll = 0.0
        if parent:
            eb.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    obj['bj_role'] = 'rig'
    return obj


class Body:
    """Mesh builder that remembers which bone owns which vertices."""

    def __init__(self, seed):
        self.mb = MB(seed=seed, jitter=0.03)
        self.ranges = []

    def part(self, bone, fn):
        start = len(self.mb.verts)
        fn(self.mb)
        self.ranges.append((bone, start, len(self.mb.verts)))

    def build(self, name, rig, col, props):
        obj = self.mb.build(name, col=col, props=props)
        for bone in BONES:
            vg = obj.vertex_groups.new(name=bone)
            idx = [i for (b, s, e) in self.ranges if b == bone for i in range(s, e)]
            if idx:
                vg.add(idx, 1.0, 'REPLACE')
        obj.parent = rig
        mod = obj.modifiers.new('Armature', 'ARMATURE')
        mod.object = rig
        return obj


def box(mb, x0, y0, z0, x1, y1, z1, mat, col):
    mb.box(x0, y0, z0, x1, y1, z1, mat, col, edge=None)


def torso_prism(mb, col, z0=0.36, z1=0.7, w0=0.25, w1=0.33, d=0.16, flare=None):
    """Folded trapezoid torso; optional coat flare below the waist."""
    pts_b = [(-d / 2, -w0 / 2), (d / 2, -w0 / 2), (d / 2, w0 / 2), (-d / 2, w0 / 2)]
    pts_t = [(-d / 2, -w1 / 2), (d / 2, -w1 / 2), (d / 2, w1 / 2), (-d / 2, w1 / 2)]
    B = [Vector((x, y, z0)) for x, y in pts_b]
    T = [Vector((x, y, z1)) for x, y in pts_t]
    for i in range(4):
        j = (i + 1) % 4
        mb.face([B[i], B[j], T[j], T[i]], 'paper', col)
    mb.face(list(reversed(B)), 'paper', col)
    mb.face(T, 'paper', col)
    if flare:
        fc, fz = flare
        F = [Vector((x * 1.15, y * 1.35, fz)) for x, y in pts_b]
        Bf = [Vector((x, y, z0 + 0.02)) for x, y in pts_b]
        for i in range(4):
            j = (i + 1) % 4
            mb.face([F[i], F[j], Bf[j], Bf[i]], 'paper', fc)
            mb.face([Bf[i], Bf[j], F[j], F[i]], 'paper', fc)


def head_ball(mb, col=SKIN, z=0.8):
    mb.blob(Vector((0, 0, z)), Vector((0.095, 0.095, 0.1)), 'paper', [col], subdiv=1, seed=11, rough=0.06)
    # eyes on the facing side (+X) make the heading readable
    for s in (-0.035, 0.035):
        box(mb, 0.085, s - 0.012, z + 0.01, 0.1, s + 0.012, z + 0.035, 'paper', PAL['ink'])


def legs(mb, body, trouser, shoe):
    for bone, y in (('legL', 0.075), ('legR', -0.075)):
        def fn(m, y=y):
            box(m, -0.04, y - 0.04, 0.05, 0.04, y + 0.04, 0.38, 'paper', trouser)
            box(m, -0.05, y - 0.045, 0.0, 0.08, y + 0.045, 0.06, 'paper', shoe)
        body.part(bone, fn)


def arms(mb, body, sleeve, hand=SKIN, hold=None):
    for bone, y in (('armL', 0.19), ('armR', -0.19)):
        def fn(m, y=y):
            box(m, -0.035, y - 0.035, 0.42, 0.035, y + 0.035, 0.68, 'paper', sleeve)
            box(m, -0.03, y - 0.03, 0.36, 0.03, y + 0.03, 0.42, 'paper', hand)
        body.part(bone, fn)


def build_bodies(rig, col):
    specs = {
        'thief': dict(coat=PAL['beige'], flare=(PAL['beige'], 0.2), trouser=PAL['charcoal'], shoe=PAL['ink'], sleeve=PAL['beige'],
                      hat='fedora', hat_col=PAL['charcoal'], band=PAL['coral'], extra='backpack'),
        'guard': dict(coat=PAL['navy'], trouser=PAL['navy'], shoe=PAL['ink'], sleeve=PAL['navy'], hat='cap', hat_col=PAL['navy'],
                      band=PAL['amber'], extra='badge'),
        'courier': dict(coat=PAL['wood'], trouser=PAL['trunk_dark'], shoe=PAL['ink'], sleeve=PAL['wood'], hat='cap', hat_col=PAL['coral'],
                        band=PAL['white'], extra='parcel'),
        'gardener': dict(coat=PAL['sage'], flare=(PAL['ochre'], 0.15), trouser=PAL['soil_dark'], shoe=PAL['trunk_dark'], sleeve=PAL['cream'],
                         hat='straw', hat_col=PAL['ochre_pale'], band=PAL['ochre']),
        'worker': dict(coat=PAL['teal'], trouser=PAL['teal'], shoe=PAL['ink'], sleeve=PAL['teal'], hat='hardhat', hat_col=PAL['mustard'],
                       band=PAL['mustard']),
        'civA': dict(coat=PAL['coral'], trouser=PAL['slate'], shoe=PAL['ink'], sleeve=PAL['coral'], hat=None, hair=PAL['trunk_dark']),
        'civB': dict(coat=PAL['teal_pale'], flare=(PAL['teal_pale'], 0.18), trouser=PAL['slate_light'], shoe=PAL['wood'], sleeve=PAL['teal_pale'],
                     hat=None, hair=PAL['ochre']),
        'civC': dict(coat=PAL['gray'], flare=(PAL['gray'], 0.14), trouser=PAL['charcoal'], shoe=PAL['ink'], sleeve=PAL['gray'],
                     hat='fedora', hat_col=PAL['slate'], band=PAL['ink']),
    }
    for name, s in specs.items():
        body = Body(seed=zlib.crc32(str(name).encode()) % 997)
        legs(body.mb, body, s['trouser'], s['shoe'])
        body.part('torso', lambda m, s=s: torso_prism(m, s['coat'], flare=s.get('flare')))
        arms(body.mb, body, s['sleeve'])

        def head_fn(m, s=s):
            head_ball(m)
            hat = s.get('hat')
            if hat == 'fedora':
                m.cylinder(Vector((0, 0, 0.87)), 0.16, 0.16, 0.015, 10, 'paper', s['hat_col'])
                m.cylinder(Vector((0, 0, 0.885)), 0.095, 0.08, 0.1, 8, 'paper', s['hat_col'])
                m.cylinder(Vector((0, 0, 0.885)), 0.097, 0.097, 0.025, 8, 'paper', s['band'])
            elif hat == 'cap':
                m.cylinder(Vector((0, 0, 0.86)), 0.1, 0.1, 0.07, 8, 'paper', s['hat_col'])
                box(m, 0.05, -0.08, 0.86, 0.17, 0.08, 0.875, 'paper', s['hat_col'])
                box(m, 0.07, -0.02, 0.9, 0.105, 0.02, 0.925, 'paper', s['band'])
            elif hat == 'straw':
                m.cylinder(Vector((0, 0, 0.87)), 0.19, 0.19, 0.012, 10, 'paper', s['hat_col'])
                m.cylinder(Vector((0, 0, 0.88)), 0.09, 0.07, 0.07, 8, 'paper', s['hat_col'])
            elif hat == 'hardhat':
                m.blob(Vector((0, 0, 0.9)), Vector((0.11, 0.11, 0.07)), 'paper', [s['hat_col']], subdiv=1, seed=4, flat_bottom=0.0)
                m.cylinder(Vector((0, 0, 0.865)), 0.13, 0.13, 0.012, 10, 'paper', s['hat_col'])
            else:
                m.blob(Vector((-0.02, 0, 0.86)), Vector((0.1, 0.1, 0.06)), 'paper', [s['hair']], subdiv=1, seed=6)
        body.part('head', head_fn)

        extra = s.get('extra')
        if extra == 'backpack':
            body.part('torso', lambda m: (box(m, -0.17, -0.11, 0.42, -0.08, 0.11, 0.66, 'paper', PAL['sage_dark']),
                                          box(m, -0.18, -0.08, 0.6, -0.16, 0.08, 0.63, 'paper', PAL['ink'])))
        elif extra == 'badge':
            body.part('torso', lambda m: box(m, 0.08, 0.05, 0.6, 0.095, 0.11, 0.65, 'paper', PAL['amber']))
        elif extra == 'parcel':
            body.part('torso', lambda m: box(m, 0.09, -0.12, 0.44, 0.3, 0.12, 0.62, 'paper', PAL['card']))
        body.build(f'char__{name}', rig, col, {'bj_role': 'character', 'bj_character': name})


# ---------------------------------------------------------------------------------------------
# animation clips
# ---------------------------------------------------------------------------------------------

def swing(rig, bone, deg):
    """Rotation of `bone` about the world Y axis (forward/back swing for a +X-facing body),
    expressed in the bone's local space (quaternion)."""
    b = rig.data.bones[bone]
    axis_local = (b.matrix_local.to_3x3().inverted() @ Vector((0, 1, 0))).normalized()
    return Quaternion(axis_local, math.radians(deg))


def lean(rig, bone, deg):
    b = rig.data.bones[bone]
    axis_local = (b.matrix_local.to_3x3().inverted() @ Vector((1, 0, 0))).normalized()
    return Quaternion(axis_local, math.radians(deg))


def make_action(rig, name, frames, pose_fn):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    for f in range(0, frames + 1, 2):
        t = f / frames
        pose = pose_fn(t)
        for pb in rig.pose.bones:
            q, loc = pose.get(pb.name, (Quaternion(), Vector((0, 0, 0))))
            pb.rotation_quaternion = q
            pb.location = loc
            pb.keyframe_insert('rotation_quaternion', frame=f)
            pb.keyframe_insert('location', frame=f)
    return act


def build_clips(rig):
    tau = math.tau
    Z = Vector((0, 0, 0))

    def up(dz):
        # hips bone points up: local Y is world Z
        return Vector((0, dz, 0))

    def idle(t):
        s = math.sin(t * tau)
        return {'hips': (Quaternion(), up(0.006 * s)), 'armL': (swing(rig, 'armL', 3 * s), Z), 'armR': (swing(rig, 'armR', -3 * s), Z),
                'torso': (lean(rig, 'torso', 1.5 * s), Z)}

    def walk(t):
        s = math.sin(t * tau)
        return {'legL': (swing(rig, 'legL', 30 * s), Z), 'legR': (swing(rig, 'legR', -30 * s), Z),
                'armL': (swing(rig, 'armL', -24 * s), Z), 'armR': (swing(rig, 'armR', 24 * s), Z),
                'hips': (Quaternion(), up(0.025 * abs(math.sin(t * tau * 1.0)) - 0.01)), 'torso': (swing(rig, 'torso', 4), Z)}

    def climb(t):
        s = math.sin(t * tau)
        return {'armL': (swing(rig, 'armL', -140 - 25 * s), Z), 'armR': (swing(rig, 'armR', -140 + 25 * s), Z),
                'legL': (swing(rig, 'legL', -30 - 25 * s), Z), 'legR': (swing(rig, 'legR', -30 + 25 * s), Z),
                'hips': (Quaternion(), up(0.02 * s))}

    def crouch(t):
        s = math.sin(t * tau)
        return {'hips': (Quaternion(), up(-0.11 + 0.005 * s)), 'legL': (swing(rig, 'legL', -38), Z), 'legR': (swing(rig, 'legR', -30), Z),
                'torso': (swing(rig, 'torso', 22), Z), 'armL': (swing(rig, 'armL', -25), Z), 'armR': (swing(rig, 'armR', -15), Z),
                'head': (swing(rig, 'head', -14 + 2 * s), Z)}

    def interact(t):
        s = math.sin(t * tau * 2)
        return {'armL': (swing(rig, 'armL', -80 + 12 * s), Z), 'armR': (swing(rig, 'armR', -80 - 12 * s), Z),
                'torso': (swing(rig, 'torso', 10), Z), 'head': (swing(rig, 'head', 12), Z)}

    def sit(t):
        s = math.sin(t * tau)
        return {'hips': (Quaternion(), up(-0.16)), 'legL': (swing(rig, 'legL', -85), Z), 'legR': (swing(rig, 'legR', -85), Z),
                'armL': (swing(rig, 'armL', -35 + 3 * s), Z), 'armR': (swing(rig, 'armR', -30), Z), 'torso': (lean(rig, 'torso', 2 * s), Z)}

    clips = [('idle', 60, idle), ('walk', 24, walk), ('climb', 30, climb), ('crouch', 30, crouch), ('interact', 30, interact), ('sit', 60, sit)]
    for name, frames, fn in clips:
        make_action(rig, name, frames, fn)
    rig.animation_data.action = bpy.data.actions['idle']
    # reset pose so the rest pose is what gets saved
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector((0, 0, 0))


def build():
    K.reset_scene()
    bpy.context.scene.render.fps = FPS
    col = K.collection('characters')
    rig = make_rig(col)
    build_bodies(rig, col)
    build_clips(rig)
    K.add_preview_rig(Vector((0, 0, 0.5)), 3)
    return K.save_and_export('characters', notes='Shared-rig paper characters with animation clips.')


if __name__ == '__main__':
    build()

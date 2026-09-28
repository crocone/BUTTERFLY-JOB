import * as THREE from 'three';
import { INTERVENTION_BY_ID } from '../data/interventions';
import { T } from '../data/text.en';
import { COLORS } from '../render/Overlays';
import { activeConsequences, computeTimeline, originalTimeline } from '../sim/causality';
import type { Snapshot } from '../sim/heist';
import { levelY } from '../sim/layout';
import { orderedDecisions } from '../sim/plan';
import type { Era, Facts, Level } from '../sim/types';
import type { App, HeistOutcome } from './App';
import { siteTile } from './sites';

/**
 * The replay after a successful job: the obstacle in the original present, each change in its
 * era (in timeline order), what those changes did to 2026, the route taken, and then the recorded
 * heist itself played back from the simulation's snapshots.  Every stage can be skipped.
 */
export async function runReplay(app: App, o: HeistOutcome, skipped: () => boolean): Promise<void> {
  const rig = app.stage.rig;
  const reduced = app.save.settings.reducedMotion;
  const contract = o.contract.id;
  const facts = o.timeline.facts;

  const setWorld = (era: Era, f: Facts, animate: boolean) => {
    app.era = era;
    app.ui.setEra(era);
    app.world.apply(era, f, contract, { animate, reducedMotion: reduced });
    app.actors.showDecor(era, f, String(f['oak.location']));
    app.audio.setAmbience(era);
  };
  const eraChange = (era: Era, f: Facts) => {
    app.world.animator.finishAll();
    if (!reduced) app.ui.sweep();
    app.audio.timeMechanism();
    setWorld(era, f, true);
  };
  const at = (x: number, z: number, level: Level, lift = 0) => new THREE.Vector3(x - 15, levelY(level) + lift, z - 11);

  app.actors.hideHeistActors();
  app.overlays.hideFans();
  app.overlays.clearCausal();
  app.labels.hidePrefix('obs:');
  app.cutaway.setFocus({ building: null, level: 'G', xray: false }, rig.viewDirXZ());
  rig.followPoint = null;

  // 1 — the obstacle: the present as it was, sealed
  setWorld(2026, originalTimeline().facts, false);
  const tgt = o.contract.target;
  void rig.flyTo({ target: at(16, 8, 'G', 1.2), viewSize: 7.5 }, reduced ? 0 : 1.2);
  app.ui.caption(T.replay.obstacle, T.replay.obstacleSmall);
  await play(0.6, skipped);
  app.overlays.pulse(at(15.5, 9.6, 'G'), COLORS.danger, 1.8, 1.2);
  app.overlays.pulse(at(tgt.x + 0.5, tgt.z + 0.5, tgt.level), COLORS.danger, 1.8, 0.9);
  await play(2.2, skipped);

  // 2 — the changes, one by one, in their eras
  const applied: Record<string, string> = {};
  for (const { id, option } of orderedDecisions(o.plan)) {
    if (skipped()) break;
    const def = INTERVENTION_BY_ID.get(id);
    if (!def) continue;
    const before = computeTimeline(applied).facts;
    applied[id] = option;
    const after = computeTimeline(applied).facts;
    if (app.era !== def.era) {
      eraChange(def.era, before);
      await play(reduced ? 0.3 : 1.0, skipped);
    }
    const site = siteTile(def.site, after);
    void rig.flyTo({ target: new THREE.Vector3(site.x - 15, site.y * 0.5, site.z - 11), viewSize: 5.6 }, reduced ? 0 : 1.1);
    app.ui.caption(T.interventions[id].options[option].log, String(def.era));
    await play(reduced ? 0.4 : 1.0, skipped);
    if (skipped()) break;
    setWorld(def.era, after, true);
    app.audio.paper();
    app.overlays.pulse(new THREE.Vector3(site.x - 15, 0, site.z - 11), COLORS.amber, 1.6, 1.1);
    await play(2.0, skipped);
  }

  // 3 — what the changes did to 2026
  if (!skipped()) {
    eraChange(2026, facts);
    void rig.flyTo({ target: new THREE.Vector3(0.5, 0.4, 0.2), viewSize: 11 }, reduced ? 0 : 1.3);
    app.ui.caption(T.replay.consequences, T.contracts[contract].name);
    await play(reduced ? 0.4 : 1.1, skipped);
    const cons = activeConsequences(o.timeline);
    for (const c of cons) {
      const p = at(c.def.at.x + 0.5, c.def.at.z + 0.5, c.def.at.level, 0.1);
      const color = c.def.kind === 'route' ? COLORS.route : c.def.kind === 'obstacle' || c.def.kind === 'side' ? COLORS.danger : COLORS.amber;
      app.overlays.pulse(p, color, 2.0, 0.9);
      for (const cause of c.causes) {
        const s = INTERVENTION_BY_ID.get(cause)?.site;
        if (!s) continue;
        const st = siteTile(s, facts);
        app.overlays.causalLine(new THREE.Vector3(st.x - 15, st.y, st.z - 11), p, 3.6);
      }
    }
    if (cons.length) app.audio.chime();
    await play(3.2, skipped);
  }
  app.overlays.clearCausal();
  if (app.era !== 2026) setWorld(2026, facts, false);

  // 4 — the route, drawn from the recording
  const rec = o.sim.recording;
  if (!skipped() && rec.length > 1) {
    const pts: Array<{ x: number; z: number; level: Level }> = [];
    let underground = false;
    for (const s of rec) {
      const p = { x: s.thief.x, z: s.thief.z, level: s.thief.level };
      const last = pts[pts.length - 1];
      if (!last || last.level !== p.level || Math.hypot(last.x - p.x, last.z - p.z) > 0.2) pts.push(p);
      if (p.level === 'S' || p.level === 'B') underground = true;
    }
    const box = new THREE.Box3();
    for (const p of pts) box.expandByPoint(at(p.x, p.z, 'G'));
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    app.overlays.setPath(pts, true);
    app.cutaway.setFocus({ building: null, level: 'G', xray: underground }, rig.viewDirXZ());
    void rig.flyTo({ target: centre, viewSize: THREE.MathUtils.clamp(Math.max(size.x, size.z) * 0.62 + 2, 6, 14) }, reduced ? 0 : 1.2);
    const approach = o.sim.approach().map((a) => T.approaches[a] ?? a).join(' + ');
    app.ui.caption(T.replay.route, approach || undefined);
    await play(3.0, skipped);
    app.overlays.setPath(null, true);
  }

  // 5 — the theft and the escape, played back from the snapshots
  if (!skipped() && rec.length > 1) {
    const pickupT = o.sim.events.find((e) => e.type === 'pickup')?.t ?? Infinity;
    const hatchT = o.sim.events.find((e) => e.type === 'portal' && e.id === 'portal.hatch')?.t ?? Infinity;
    const t0 = rec[0].t;
    const t1 = rec[rec.length - 1].t;
    const speed = Math.max(3, (t1 - t0) / 26); // keep the playback under half a minute
    const w = o.sim.world;
    app.actors.vanStop = w.delivery?.stop ?? 'square';
    let t = t0;
    let i = 0;
    let focusIn = 0;
    let caption = '';
    const first = rec[0].thief;
    rig.followPoint = null;
    await rig.flyTo({ target: at(first.x, first.z, first.level, 0.6), viewSize: 7 }, reduced ? 0 : 0.8);
    rig.followPoint = at(first.x, first.z, first.level, 0.6);
    await play(Infinity, skipped, (dt) => {
      t = Math.min(t1, t + dt * speed);
      while (i < rec.length - 2 && rec[i + 1].t <= t) i++;
      const a = rec[i];
      const b = rec[Math.min(i + 1, rec.length - 1)];
      const s = lerpSnapshot(a, b, b.t > a.t ? THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1) : 0);
      app.actors.applySnapshot(s, {
        showThief: true,
        laser: o.contract.glassDoor === 'laser',
        vault: o.contract.vaultDoor === 'maglock' && !s.power,
        hatchUsed: t >= hatchT,
        dt,
      });
      app.drawFans(s, w, o.sim.sightContext(t), true, true);
      rig.followPoint?.copy(at(s.thief.x, s.thief.z, s.thief.level, 0.6));
      focusIn -= dt;
      if (focusIn <= 0) {
        focusIn = 0.2;
        app.focusOnThief(w.grid, s.thief);
      }
      const want = t < pickupT ? T.replay.theft : T.replay.escape;
      if (want !== caption) {
        caption = want;
        app.ui.caption(want, T.contracts[contract].target);
      }
      return t >= t1;
    });
    if (!skipped()) await play(0.8, skipped);
  }

  // leave the diorama as the plan's present, camera back to the overview
  rig.followPoint = null;
  app.actors.hideHeistActors();
  app.overlays.hideFans();
  app.labels.hidePrefix('obs:');
  app.overlays.clearCausal();
  app.cutaway.setFocus({ building: null, level: 'G', xray: false }, rig.viewDirXZ());
  app.world.animator.finishAll();
  setWorld(2026, facts, false);
  void rig.reset(reduced ? 0 : 0.9);
}

/** Resolve after `seconds` of real time, when skipped, or when `each` returns true. */
function play(seconds: number, skipped: () => boolean, each?: (dt: number) => boolean | void): Promise<void> {
  return new Promise((resolve) => {
    let last = performance.now();
    let elapsed = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      elapsed += dt;
      const done = each?.(dt) === true;
      if (done || skipped() || elapsed >= seconds) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function lerpAngle(a: number, b: number, f: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * f;
}

/** Blend two recorded snapshots (positions and headings; discrete state comes from the nearer one). */
function lerpSnapshot(a: Snapshot, b: Snapshot, f: number): Snapshot {
  const near = f < 0.5 ? a : b;
  const ta = a.thief;
  const tb = b.thief;
  const sameLevel = ta.level === tb.level;
  const thief = {
    ...near.thief,
    x: sameLevel || ta.portal || tb.portal ? ta.x + (tb.x - ta.x) * f : near.thief.x,
    z: sameLevel || ta.portal || tb.portal ? ta.z + (tb.z - ta.z) * f : near.thief.z,
    yaw: lerpAngle(ta.yaw, tb.yaw, f),
    portal: ta.portal && tb.portal && ta.portal.id === tb.portal.id ? { ...ta.portal, f: ta.portal.f + (tb.portal.f - ta.portal.f) * f } : near.thief.portal,
  };
  const guards = a.guards.map((g, k) => {
    const h = b.guards[k] ?? g;
    return { ...(f < 0.5 ? g : h), x: g.x + (h.x - g.x) * f, z: g.z + (h.z - g.z) * f, yaw: lerpAngle(g.yaw, h.yaw, f) };
  });
  const cameras = a.cameras.map((c, k) => {
    const d = b.cameras[k] ?? c;
    return { ...(f < 0.5 ? c : d), yaw: lerpAngle(c.yaw, d.yaw, f) };
  });
  const ca = a.delivery.courier;
  const cb = b.delivery.courier;
  const courier = ca && cb ? { x: ca.x + (cb.x - ca.x) * f, z: ca.z + (cb.z - ca.z) * f, yaw: lerpAngle(ca.yaw, cb.yaw, f) } : near.delivery.courier;
  const delivery = { ...near.delivery, courier, vanArrive: a.delivery.vanArrive + (b.delivery.vanArrive - a.delivery.vanArrive) * f };
  return { ...near, t: a.t + (b.t - a.t) * f, thief, guards, cameras, delivery, meter: a.meter + (b.meter - a.meter) * f };
}

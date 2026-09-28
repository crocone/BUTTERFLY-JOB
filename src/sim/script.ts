import { HeistSim, sameTile, type Interactable, type PresentWorld } from './heist';
import type { Level } from './types';

/**
 * Scripted thief runs (tests, verification, attract mode).
 * A script is a list of steps executed one after another.  `safeWait` marks a point where the
 * solver may insert a wait so that the next leg stays unseen.
 */
export type ScriptStep =
  | { move: [Level, number, number] }
  | { interact: Interactable }
  | { wait: number }
  | { safeWait: true; max?: number };

export interface ScriptRun {
  sim: HeistSim;
  ok: boolean;
  reason: string;
  waits: number[];
}

/** Execute a script with concrete waits for each safeWait marker. */
export function runScript(world: PresentWorld, steps: ScriptStep[], waits: number[], opts: { maxTime?: number; stopAt?: number } = {}): ScriptRun {
  const sim = new HeistSim(world);
  const maxTime = opts.maxTime ?? 400;
  let w = 0;
  let reason = 'ok';
  for (let i = 0; i < steps.length; i++) {
    if (opts.stopAt !== undefined && i >= opts.stopAt) break;
    const s = steps[i];
    if ('wait' in s || 'safeWait' in s) {
      const secs = 'wait' in s ? s.wait : waits[w++] ?? 0;
      sim.run(secs);
    } else if ('move' in s) {
      const [level, x, z] = s.move;
      const r = sim.moveTo({ level, x, z });
      if (!r.ok) {
        reason = `step ${i}: cannot move to ${level}:${x},${z} (${r.failure?.reason ?? 'busy'}${r.failure?.door ? ' ' + r.failure.door.id : ''})`;
        return { sim, ok: false, reason, waits };
      }
      while (sim.status === 'running' && sim.busy && sim.t < maxTime) sim.step();
      if (sim.status === 'running' && !sameTile(sim.thiefTile, { level, x, z })) {
        reason = `step ${i}: stopped before ${level}:${x},${z}`;
        return { sim, ok: false, reason, waits };
      }
    } else if ('interact' in s) {
      const r = sim.interact(s.interact);
      if (!r.ok) {
        reason = `step ${i}: cannot interact with ${s.interact}${r.failure ? ` (${r.failure.reason})` : ''}`;
        return { sim, ok: false, reason, waits };
      }
      while (sim.status === 'running' && sim.busy && sim.t < maxTime) sim.step();
    }
    if (sim.status === 'caught') {
      reason = `caught by ${sim.caughtBy?.observer} at step ${i} (t=${sim.t.toFixed(1)})`;
      return { sim, ok: false, reason, waits };
    }
    if (sim.t >= maxTime) return { sim, ok: false, reason: 'timeout', waits };
  }
  const done = opts.stopAt !== undefined || sim.status === 'escaped';
  return { sim, ok: done, reason: done ? 'ok' : `script ended with status ${sim.status}`, waits };
}

/**
 * Solver: depth-first over safeWait markers.  At each marker try waits in increasing order
 * (`step` seconds apart) and keep the first that lets the run reach the next marker without
 * exceeding `allowDetections`; backtrack when a later marker has no safe wait.  Deterministic.
 */
export function solveScript(
  world: PresentWorld,
  steps: ScriptStep[],
  opts: { step?: number; allowDetections?: number; budget?: number } = {},
): ScriptRun {
  const inc = opts.step ?? 0.25;
  const allowed = opts.allowDetections ?? 0;
  let budget = opts.budget ?? 6000;
  const markers = steps.map((s, i) => ('safeWait' in s ? i : -1)).filter((i) => i >= 0);
  let deepest = { m: -1, reason: '', waits: [] as number[] };

  const dfs = (m: number, waits: number[]): number[] | null => {
    if (m === markers.length) return waits;
    const nextMarker = m + 1 < markers.length ? markers[m + 1] : steps.length;
    const max = (steps[markers[m]] as { max?: number }).max ?? 30;
    // 1) evaluate every candidate wait for this leg
    const good: number[] = [];
    for (let w = 0; w <= max + 1e-9; w += inc) {
      if (--budget < 0) return null;
      const trial = [...waits, w];
      const run = runScript(world, steps, trial, { stopAt: nextMarker });
      if (run.ok && run.sim.detections <= allowed && run.sim.status !== 'caught') good.push(w);
      else if (m > deepest.m) deepest = { m, reason: run.reason + `; detections ${run.sim.detections}`, waits: trial };
    }
    // 2) group contiguous safe waits into windows; try the start, middle and end of each window
    const candidates: number[] = [];
    let i = 0;
    while (i < good.length) {
      let j = i;
      while (j + 1 < good.length && good[j + 1] - good[j] <= inc + 1e-9) j++;
      const mid = good[Math.floor((i + j) / 2)];
      for (const c of [good[i], mid, good[j]]) if (!candidates.includes(c)) candidates.push(c);
      i = j + 1;
    }
    for (const c of candidates) {
      const res = dfs(m + 1, [...waits, c]);
      if (res) return res;
      if (budget < 0) return null;
    }
    return null;
  };

  const found = dfs(0, []);
  if (!found) {
    const run = runScript(world, steps, deepest.waits);
    return { sim: run.sim, ok: false, reason: `no safe wait at marker ${deepest.m} (step ${markers[deepest.m]}): ${deepest.reason}`, waits: deepest.waits };
  }
  const final = runScript(world, steps, found);
  if (final.ok && final.sim.detections > allowed) {
    return { ...final, ok: false, reason: `escaped but spotted ${final.sim.detections} time(s)` };
  }
  return final;
}

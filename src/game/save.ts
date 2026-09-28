import { isContractId, type ContractId } from '../data/contracts';
import { effectiveDecisions } from '../sim/causality';

/** Local progress + settings (localStorage).  Every field is validated on load. */
export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  volume: number;
  muted: boolean;
  reducedMotion: boolean;
  quality: Quality;
  showFps: boolean;
  overlays: boolean;
}

export interface ResultRecord {
  time: number;
  detections: number;
  cost: number;
  changes: number;
  approach: string[];
  conditions: string[];
}

export interface SaveData {
  v: 1;
  current: ContractId;
  unlocked: ContractId[];
  completed: Partial<Record<ContractId, ResultRecord>>;
  approaches: Partial<Record<ContractId, string[]>>;
  plans: Partial<Record<ContractId, Record<string, string>>>;
  discovered: string[];
  hintLevel: Partial<Record<ContractId, number>>;
  introSeen: boolean;
  onboardingDone: boolean;
  settings: Settings;
}

const KEY = 'butterfly-job.save.v1';

export function defaultSettings(): Settings {
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { volume: 0.7, muted: false, reducedMotion: reduce, quality: 'medium', showFps: false, overlays: true };
}

export function defaultSave(): SaveData {
  return {
    v: 1,
    current: 'c1',
    unlocked: ['c1'],
    completed: {},
    approaches: {},
    plans: {},
    discovered: [],
    hintLevel: {},
    introSeen: false,
    onboardingDone: false,
    settings: defaultSettings(),
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function sanitize(raw: unknown): SaveData {
  const d = defaultSave();
  if (!isObj(raw) || raw.v !== 1) return d;
  if (isContractId(raw.current)) d.current = raw.current;
  if (Array.isArray(raw.unlocked)) d.unlocked = [...new Set(['c1', ...raw.unlocked.filter(isContractId)])] as ContractId[];
  if (!d.unlocked.includes(d.current)) d.current = 'c1';
  if (isObj(raw.completed)) {
    for (const [k, v] of Object.entries(raw.completed)) {
      if (!isContractId(k) || !isObj(v)) continue;
      d.completed[k] = {
        time: Number(v.time) || 0,
        detections: Number(v.detections) || 0,
        cost: Number(v.cost) || 0,
        changes: Number(v.changes) || 0,
        approach: Array.isArray(v.approach) ? v.approach.map(String).slice(0, 6) : [],
        conditions: Array.isArray(v.conditions) ? v.conditions.map(String).slice(0, 6) : [],
      };
    }
  }
  if (isObj(raw.approaches)) {
    for (const [k, v] of Object.entries(raw.approaches)) if (isContractId(k) && Array.isArray(v)) d.approaches[k] = v.map(String).slice(0, 20);
  }
  if (isObj(raw.plans)) {
    for (const [k, v] of Object.entries(raw.plans)) {
      if (!isContractId(k) || !isObj(v)) continue;
      const plan: Record<string, string> = {};
      for (const [a, b] of Object.entries(v)) if (typeof b === 'string') plan[a] = b;
      d.plans[k] = effectiveDecisions(plan);
    }
  }
  if (Array.isArray(raw.discovered)) d.discovered = raw.discovered.map(String).slice(0, 200);
  if (isObj(raw.hintLevel)) {
    for (const [k, v] of Object.entries(raw.hintLevel)) if (isContractId(k)) d.hintLevel[k] = Math.max(0, Math.min(3, Number(v) || 0));
  }
  d.introSeen = raw.introSeen === true;
  d.onboardingDone = raw.onboardingDone === true;
  if (isObj(raw.settings)) {
    const s = raw.settings;
    const q = s.quality;
    d.settings = {
      volume: Math.max(0, Math.min(1, Number(s.volume ?? d.settings.volume))),
      muted: s.muted === true,
      reducedMotion: typeof s.reducedMotion === 'boolean' ? s.reducedMotion : d.settings.reducedMotion,
      quality: q === 'low' || q === 'medium' || q === 'high' ? q : d.settings.quality,
      showFps: s.showFps === true,
      overlays: s.overlays !== false,
    };
  }
  return d;
}

export function loadSave(storage: Storage | null = safeStorage()): SaveData {
  if (!storage) return defaultSave();
  try {
    const raw = storage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : defaultSave();
  } catch {
    return defaultSave();
  }
}

export function writeSave(d: SaveData, storage: Storage | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage full or blocked: progress stays in memory */
  }
}

export function clearSave(storage: Storage | null = safeStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

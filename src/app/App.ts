import * as THREE from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { CONTRACTS, CONTRACT_BY_ID, type ContractDef, type ContractId } from '../data/contracts';
import { INTERVENTION_BY_ID, optionCost, originalOption } from '../data/interventions';
import { T, fmt } from '../data/text.en';
import { failingRequirements, heistConditionHolds, nextContract } from '../game/progress';
import { clearSave, defaultSave, loadSave, writeSave, type SaveData } from '../game/save';
import { decodePlan, planFromHash, planUrl } from '../game/share';
import { Actors, simToWorld } from '../render/Actors';
import { AssetError, AssetLibrary } from '../render/assets';
import { DEFAULT_VIEW } from '../render/CameraRig';
import { Cutaway } from '../render/Cutaway';
import { COLORS, Labels, Overlays } from '../render/Overlays';
import { paperMaterial, paperKeyOf, type PaperKey } from '../render/paper';
import { Stage } from '../render/Stage';
import { World, WORLD_ASSETS } from '../render/World';
import { visibleVariantSet } from '../render/variants';
import {
  activeConsequences,
  blockedPrereqs,
  computeTimeline,
  CONSEQUENCES,
  originalTimeline,
  type ActiveConsequence,
  type Timeline,
} from '../sim/causality';
import { DELIVERY } from '../data/security';
import { DT, HeistSim, presentWorld, type HeistEvent, type Interactable, type PresentWorld, type Snapshot } from '../sim/heist';
import { areaAt, isWalkable, levelY, type WorldGrid } from '../sim/layout';
import { isPathFailure, type PathFailure, type PathResult } from '../sim/nav';
import { PlanHistory, orderedDecisions, planCost, setDecision } from '../sim/plan';
import { solveScript, type ScriptStep } from '../sim/script';
import { SOLUTIONS } from '../sim/solutions';
import type { Era, Level, TileRef } from '../sim/types';
import { visionFan, type Observer, type SightContext } from '../sim/vision';
import { h, UI, type CardModel } from '../ui/UI';
import { runReplay } from './Replay';
import { erasWithIntervention, interventionAt, siteStatus, siteTile } from './sites';

type Mode = 'loading' | 'intro' | 'planning' | 'heist' | 'paused' | 'failed' | 'replay' | 'results' | 'error';
const DEG = Math.PI / 180;
const LEVELS_UP: Level[] = ['R', 'U', 'G', 'B', 'S'];

export interface HeistOutcome {
  success: boolean;
  practice: boolean;
  sim: HeistSim;
  plan: Record<string, string>;
  timeline: Timeline;
  contract: ContractDef;
}

export class App {
  readonly ui: UI;
  readonly stage: Stage;
  readonly audio = new AudioEngine();
  readonly lib = new AssetLibrary('./');
  world!: World;
  actors!: Actors;
  cutaway!: Cutaway;
  overlays!: Overlays;
  labels!: Labels;
  save: SaveData;
  mode: Mode = 'loading';
  contract: ContractDef;
  decisions: Record<string, string> = {};
  timeline: Timeline;
  era: Era = 2026;
  private history = new PlanHistory();
  compare = false;
  overlaysOn = true;
  underground = false;
  selected: string | null = null;
  private timer = new THREE.Timer();
  private preview: HeistSim | null = null;
  sim: HeistSim | null = null;
  private practice = false;
  private acc = 0;
  private holdSpace = false;
  private eventCursor = 0;
  private hatchUsed = false;
  private hover: { tile: TileRef | null; interact: Interactable | null; path: PathResult | PathFailure | null } = { tile: null, interact: null, path: null };
  private pointer = { x: 0, y: 0, down: false, button: 0, moved: 0, startX: 0, startY: 0, inside: false };
  private raycaster = new THREE.Raycaster();
  private hoverSite: string | null = null;
  private hoverMeshes: Array<{ mesh: THREE.Mesh; mat: THREE.Material | THREE.Material[] }> = [];
  private compareGhosts = new THREE.Group();
  private compareHighlighted: Array<{ mesh: THREE.Mesh; mat: THREE.Material | THREE.Material[] }> = [];
  private discovered: Set<string>;
  private onboarding: 'inspect' | 'choose' | 'visit2026' | 'visit1986' | 'preserve' | 'final2026' | 'done' = 'done';
  private lastFocusCheck = 0;
  private autoplay: { steps: ScriptStep[]; waits: number[]; i: number; w: number; state: 'idle' | 'moving' | 'acting' | 'waiting'; until: number; done: boolean; error?: string } | null = null;
  timeScale = 1;
  private lastOutcome: HeistOutcome | null = null;
  private skipRequested = false;
  private freshTimeline = new Set<string>();
  private wasBusy = false;
  private pendingEraHighlight: Era | null = null;

  constructor(root: HTMLElement) {
    this.save = loadSave();
    this.contract = CONTRACT_BY_ID.get(this.save.current)!;
    this.decisions = { ...(this.save.plans[this.contract.id] ?? {}) };
    this.timeline = computeTimeline(this.decisions);
    this.discovered = new Set(this.save.discovered);
    this.overlaysOn = this.save.settings.overlays;
    this.ui = new UI(root, {
      era: (e) => this.setEra(e),
      choose: (id, o) => this.choose(id, o),
      undo: () => this.undo(),
      reset: () => this.resetPlan(),
      start: () => this.startJob(false),
      toggle: (n, on) => this.toggle(n, on),
      hint: () => this.showHints(),
      contracts: () => this.showContracts(),
      settings: () => this.showSettings(),
      share: () => void this.sharePlan(),
      closeCard: () => this.select(null),
    });
    this.stage = new Stage(this.ui.stageEl, this.save.settings.quality);
    this.stage.rig.reducedMotion = this.save.settings.reducedMotion;
    this.audio.setVolume(this.save.settings.volume);
    this.audio.setMuted(this.save.settings.muted);
    this.ui.setFps(this.save.settings.showFps ? '…' : null);
  }

  // ==================================================================================== boot
  async boot(): Promise<void> {
    if (!this.webglOk()) {
      this.mode = 'error';
      this.ui.loadingError(T.errors.webgl);
      return;
    }
    this.ui.loading(0, '');
    try {
      await this.lib.loadManifest();
      const labels: Record<string, string> = { terrain: 'the base', bank: 'the bank', cafe: 'Café Kopp', workshop: 'the workshop', townhouses: 'the townhouses', trees: 'the trees', props: 'the street', characters: 'the people' };
      await this.lib.loadAll([...WORLD_ASSETS, 'characters'], (done, total, id) => this.ui.loading(done / total, id ? labels[id] ?? id : ''));
    } catch (err) {
      this.mode = 'error';
      const file = err instanceof AssetError ? err.file : String(err);
      this.ui.loadingError(fmt(T.errors.assets, { file }));
      console.error(err);
      return;
    }
    this.world = new World(this.lib);
    this.stage.scene.add(this.world.root);
    this.actors = new Actors(this.lib, this.world);
    this.stage.scene.add(this.actors.root);
    this.cutaway = new Cutaway(this.world);
    this.cutaway.reducedMotion = this.save.settings.reducedMotion;
    this.overlays = new Overlays();
    this.stage.scene.add(this.overlays.root);
    this.stage.scene.add(this.compareGhosts);
    this.labels = new Labels(this.ui.root);
    this.ui.root.insertBefore(this.labels.el, this.ui.root.children[1]);
    this.bindInput();

    // plan from a shared link
    const fromLink = planFromHash(location.hash);
    if (fromLink) {
      if (fromLink.ok && this.save.unlocked.includes(fromLink.contract)) {
        this.contract = CONTRACT_BY_ID.get(fromLink.contract)!;
        this.save.current = fromLink.contract;
        this.decisions = { ...fromLink.decisions };
        this.save.plans[fromLink.contract] = { ...this.decisions };
        setTimeout(() => this.ui.toast(`Plan loaded from link: ${this.contractLine()}`, 'green'), 400);
      } else if (fromLink.ok) {
        setTimeout(() => this.ui.toast(T.errors.linkLocked, 'danger', 6000), 400);
      } else {
        setTimeout(() => this.ui.toast(T.errors.link, 'danger', 6000), 400);
      }
      history.replaceState(null, '', location.pathname + location.search);
    }
    this.timeline = computeTimeline(this.decisions);
    this.world.apply(this.era, this.timeline.facts, this.contract.id, { animate: false, reducedMotion: true });
    this.rebuildPreview();
    this.ui.hideLoading();
    requestAnimationFrame((t) => this.frame(t));
    this.exposeDebug();
    const params = new URLSearchParams(location.search);
    if (!this.save.introSeen && !params.has('nointro')) await this.playIntro();
    else this.enterPlanning();
  }

  private webglOk(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  }

  // ==================================================================================== frame loop
  private frame(t: number): void {
    this.timer.update(t);
    const dt = Math.min(0.1, this.timer.getDelta());
    this.audio.update();
    if (this.mode === 'heist' && this.sim) this.stepHeist(dt);
    else if (this.preview && this.era === 2026 && (this.mode === 'planning' || this.mode === 'intro')) {
      this.preview.run(dt);
      if (this.preview.status !== 'running') this.rebuildPreview();
    }
    this.world.update(dt);
    if (this.world.busy !== this.wasBusy) {
      // options are disabled while a transition plays: re-enable them when it ends
      this.wasBusy = this.world.busy;
      if (!this.wasBusy && this.mode === 'planning') this.refreshCard();
    }
    this.cutaway.update(dt);
    this.updateActors(dt);
    this.overlays.update(dt);
    this.stage.rig.update(dt);
    this.stage.render();
    const { width, height } = this.stage.size;
    this.labels.update(this.stage.rig.camera, width, height);
    if (this.save.settings.showFps) {
      const i = this.stage.info();
      this.ui.setFps(`${this.stage.fps.toFixed(0)} fps · ${i.calls} draws · ${(i.triangles / 1000).toFixed(0)}k tris`);
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  private updateActors(dt: number): void {
    const inHeist = this.mode === 'heist' || this.mode === 'paused' || this.mode === 'failed';
    const s = inHeist && this.sim ? this.sim.snapshot() : this.era === 2026 && this.preview && this.mode !== 'replay' && this.mode !== 'results' ? this.preview.snapshot() : null;
    if (s && this.mode !== 'replay') {
      const w = (this.sim ?? this.preview)!.world;
      this.actors.vanStop = w.delivery?.stop ?? 'square';
      this.actors.applySnapshot(s, {
        showThief: inHeist,
        laser: this.contract.glassDoor === 'laser',
        vault: this.contract.vaultDoor === 'maglock' && !s.power,
        hatchUsed: this.hatchUsed,
        dt,
      });
      const show = inHeist || (this.overlaysOn && this.era === 2026 && this.mode === 'planning');
      this.drawFans(s, w, (this.sim && inHeist ? this.sim : this.preview!).sightContext(), show, inHeist);
    } else if (this.mode !== 'replay') {
      this.actors.hideHeistActors();
      this.overlays.hideFans();
      this.labels.hidePrefix('obs:');
    }
    this.actors.update(dt, this.mode !== 'heist');
  }

  /** Vision fans (and, with `markers`, the ?/! icons) for a snapshot: live heist, planning preview or replay. */
  drawFans(s: Snapshot, w: PresentWorld, ctx: SightContext, show: boolean, markers: boolean): void {
    this.overlays.fanOpacity = markers ? 0.13 : 0.2;
    for (const g of s.guards) {
      const route = w.routes.find((r) => r.guard.id === g.id)!;
      const obs: Observer = { level: g.level, x: g.x, z: g.z, yaw: g.yaw, fov: route.guard.fov * DEG, range: route.guard.range };
      const visible = show && this.levelVisible(g.level, g.x, g.z, w.grid);
      this.overlays.setFan(g.id, g.level, [g.x, g.z], visible ? visionFan(ctx, obs, 18) : [], g.alert ? 'alert' : g.seeing ? 'seeing' : 'calm', visible);
      const p = simToWorld(g.x, g.z, g.level).add(new THREE.Vector3(0, 1.25, 0));
      if (markers && (g.seeing || g.alert)) this.labels.set(`obs:${g.id}`, p, `<span class="icon ${g.alert ? 'alert' : 'warn'}">${g.alert ? '!' : '?'}</span>`);
      else this.labels.hide(`obs:${g.id}`);
    }
    for (const c of s.cameras) {
      const cam = w.cameras.find((x) => x.def.id === c.id)!;
      const visible = show && c.powered && this.levelVisible(cam.level, cam.x, cam.z, w.grid);
      const obs: Observer = { level: cam.level, x: cam.x, z: cam.z, yaw: c.yaw, fov: cam.def.fov * DEG, range: cam.def.range };
      this.overlays.setFan(c.id, cam.level, [cam.x, cam.z], visible ? visionFan(ctx, obs, 16) : [], c.seeing ? 'seeing' : 'calm', visible);
      if (markers && c.seeing) this.labels.set(`obs:${c.id}`, simToWorld(cam.x, cam.z, cam.level).add(new THREE.Vector3(0, 2.4, 0)), `<span class="icon warn">?</span>`);
      else this.labels.hide(`obs:${c.id}`);
    }
    const cr = s.delivery.courier;
    if (cr) {
      const obs: Observer = { level: 'G', x: cr.x, z: cr.z, yaw: cr.yaw, fov: DELIVERY.courierFov * DEG, range: DELIVERY.courierRange };
      this.overlays.setFan('courier', 'G', [cr.x, cr.z], show ? visionFan(ctx, obs, 10) : [], 'calm', show);
    } else this.overlays.setFan('courier', 'G', [0, 0], [], 'calm', false);
  }

  /** Is an observer on this level drawn?  Planning shows the ground (or, in X-ray, the underground). */
  private levelVisible(level: Level, x: number, z: number, grid: WorldGrid): boolean {
    if (this.mode === 'planning') {
      if (this.underground) return level === 'S' || level === 'B';
      return level === 'G' || (level === 'U' && x >= 21); // the annex roof is outdoors
    }
    const area = areaAt(grid, { level, x: Math.floor(x), z: Math.floor(z) });
    return this.cutaway.levelShown(area?.building, level);
  }

  // ==================================================================================== planning
  enterPlanning(): void {
    this.mode = 'planning';
    this.sim = null;
    this.ui.setMode('planning');
    this.ui.closeDialog();
    this.ui.caption(null);
    this.stage.rig.followPoint = null;
    this.cutaway.setFocus({ building: null, level: 'G', xray: this.underground }, this.stage.rig.viewDirXZ());
    this.overlays.setPath(null, true);
    this.overlays.setHover(null, true);
    this.labels.hidePrefix('it:');
    this.labels.hidePrefix('obs:');
    this.audio.setAmbience(this.era);
    this.world.apply(this.era, this.timeline.facts, this.contract.id, { animate: false, reducedMotion: true });
    this.actors.showDecor(this.era, this.timeline.facts, String(this.timeline.facts['oak.location']));
    this.rebuildPreview();
    this.refreshAll();
    if (!this.save.onboardingDone && this.contract.id === 'c1' && Object.keys(this.decisions).length === 0) this.setOnboarding('inspect');
    else this.setOnboarding('done');
  }

  private contractLine(): string {
    const c = T.contracts[this.contract.id];
    return `${c.short} · ${c.name}`;
  }

  refreshAll(): void {
    this.ui.setObjective(this.contractLine(), T.contracts[this.contract.id].objective);
    this.ui.setEra(this.era);
    this.ui.setToggle('compare', this.compare);
    this.ui.setToggle('overlays', this.overlaysOn);
    this.ui.setToggle('underground', this.underground);
    this.refreshTimeline();
    this.refreshCard();
    this.updatePatrols();
    this.updateCompare();
    this.markDiscovered();
  }

  private refreshTimeline(): void {
    const entries = orderedDecisions(this.decisions).map(({ id, option }) => ({
      era: INTERVENTION_BY_ID.get(id)!.era,
      text: T.interventions[id].options[option].log,
      fresh: this.freshTimeline.has(id),
    }));
    this.freshTimeline.clear();
    this.ui.setTimeline(entries, planCost(this.decisions), this.contract.budget, this.history.size > 0, Object.keys(this.decisions).length > 0);
  }

  private refreshCard(): void {
    if (!this.selected) {
      this.ui.setCard(null);
      return;
    }
    this.ui.setCard(this.cardModel(this.selected));
  }

  private cardModel(site: string): CardModel {
    const f = this.timeline.facts;
    let title = T.sites[site]?.name ?? site.toUpperCase();
    let description = T.sites[site]?.eras[this.era] ?? '';
    let status = siteStatus(site, this.era, f);
    let hint: string | undefined;
    if (site.startsWith('camera:')) {
      const id = site.split(':')[1];
      title = T.sites.cameras.name;
      description = T.cameraInfo[id] ?? '';
      status = this.contract.circuitCameras.includes(id) ? [T.circuitNote] : [];
    }
    const ivId = interventionAt(site, this.era);
    let intervention: CardModel['intervention'];
    if (ivId) {
      const def = INTERVENTION_BY_ID.get(ivId)!;
      const text = T.interventions[ivId];
      const blocked = blockedPrereqs(ivId, this.decisions);
      const current = this.decisions[ivId] ?? originalOption(ivId);
      const cost = planCost(this.decisions);
      intervention = {
        id: ivId,
        question: text.question,
        blocked: blocked.length ? T.prereqs[blocked[0][0]] : undefined,
        options: def.options.map((o) => {
          const chosen = o.id === current;
          const extra = chosen ? 0 : optionCost(ivId, o.id) - (current !== def.options[0].id ? optionCost(ivId, current) : 0);
          return {
            id: o.id,
            label: text.options[o.id].label,
            note: text.options[o.id].note,
            cost: o.cost,
            chosen,
            original: o.id === def.options[0].id,
            disabled: (blocked.length > 0 && o.id !== def.options[0].id) || (!chosen && extra > 0 && cost + extra > this.contract.budget) || this.world.busy,
          };
        }),
      };
    }
    const elsewhere = !ivId && erasWithIntervention(site).length ? fmt(T.ui.changeIn, { era: erasWithIntervention(site).join(' / ') }) : undefined;
    const consequences = activeConsequences(this.timeline)
      .filter((c) => c.def.sites.includes(site) && this.discovered.has(c.def.id))
      .map((c) => T.consequences[c.def.id]);
    if (this.onboarding === 'choose' && site === 'oak') hint = T.onboarding.changeSomething;
    return { site, title, era: this.era, description, status, intervention, elsewhere, consequences, hint };
  }

  select(site: string | null): void {
    this.selected = site;
    this.refreshCard();
    if (site) {
      this.audio.paper();
      if (this.onboarding === 'inspect' && site === 'oak') this.setOnboarding('choose');
      // show causal lines to this site's discovered consequences
      this.overlays.clearCausal();
      const from = this.sitePoint(site);
      for (const c of activeConsequences(this.timeline)) {
        if (c.def.sites.includes(site) && this.discovered.has(c.def.id) && c.def.era >= this.era) this.overlays.causalLine(from, this.consequencePoint(c), 3.5);
      }
    }
  }

  private sitePoint(site: string): THREE.Vector3 {
    const t = siteTile(site, this.timeline.facts);
    return new THREE.Vector3(t.x - 15, t.y, t.z - 11);
  }

  private consequencePoint(c: ActiveConsequence): THREE.Vector3 {
    return new THREE.Vector3(c.def.at.x + 0.5 - 15, levelY(c.def.at.level) + 0.1, c.def.at.z + 0.5 - 11);
  }

  setEra(e: Era, opts: { quiet?: boolean } = {}): void {
    if (this.mode !== 'planning' && this.mode !== 'intro' && this.mode !== 'replay') return;
    if (e === this.era) return;
    this.world.animator.finishAll();
    this.era = e;
    if (!opts.quiet) {
      this.audio.timeMechanism();
      if (!this.save.settings.reducedMotion) this.ui.sweep();
    }
    this.audio.setAmbience(e);
    this.world.apply(e, this.timeline.facts, this.contract.id, { animate: true, reducedMotion: this.save.settings.reducedMotion });
    this.actors.showDecor(e, this.timeline.facts, String(this.timeline.facts['oak.location']));
    this.ui.setEra(e);
    if (this.mode !== 'planning') return;
    this.pendingEraHighlight = e;
    setTimeout(() => this.highlightEra(e), this.save.settings.reducedMotion ? 100 : 900);
    this.refreshCard();
    this.updatePatrols();
    this.updateCompare();
    this.cutaway.setFocus({ building: null, level: 'G', xray: this.underground }, this.stage.rig.viewDirXZ());
    if (e === 2026 && (this.onboarding === 'visit2026' || this.onboarding === 'final2026')) this.onboardingAfter2026();
    else if (e === 1986 && this.onboarding === 'visit1986') this.setOnboarding('preserve');
    else if (this.onboarding === 'inspect' || this.onboarding === 'preserve') this.setOnboarding(this.onboarding);
  }

  /** after an era switch: pulse changed places, draw causal lines, toast the headline */
  private highlightEra(e: Era): void {
    if (this.pendingEraHighlight !== e || this.era !== e || this.mode !== 'planning') return;
    const cons = activeConsequences(this.timeline).filter((c) => c.def.era <= e && (e === 2026 || c.def.era === e));
    const fresh = cons.filter((c) => !this.discovered.has(c.def.id));
    this.markDiscovered();
    for (const c of cons) this.overlays.pulse(this.consequencePoint(c), c.def.kind === 'obstacle' || c.def.kind === 'side' ? COLORS.danger : COLORS.amber, 1.6, 0.9);
    for (const c of fresh) {
      for (const cause of c.causes) {
        const site = INTERVENTION_BY_ID.get(cause)?.site;
        if (site) this.overlays.causalLine(this.sitePoint(site), this.consequencePoint(c), 4.5);
      }
    }
    fresh.slice(0, 3).forEach((c, i) => setTimeout(() => this.ui.toast(T.consequences[c.def.id], c.def.kind === 'route' ? 'amber' : 'danger', 5200), i * 350));
    if (fresh.length) this.audio.chime();
    this.refreshCard();
  }

  private markDiscovered(): void {
    let changed = false;
    for (const c of activeConsequences(this.timeline)) {
      if (c.def.era <= this.era && !this.discovered.has(c.def.id)) {
        this.discovered.add(c.def.id);
        changed = true;
      }
    }
    if (changed) {
      this.save.discovered = [...this.discovered];
      this.persist();
    }
  }

  choose(id: string, option: string): void {
    if (this.mode !== 'planning') return;
    if (this.world.busy) {
      this.ui.toast(T.ui.transitioning);
      return;
    }
    const r = setDecision(this.decisions, id, option, this.contract.budget);
    if (!r.ok) {
      this.audio.error();
      if (r.error === 'budget') this.ui.toast(fmt(T.budgetFull, { budget: this.contract.budget }), 'danger');
      else if (r.error === 'prereq' && r.blockedBy) this.ui.toast(T.prereqs[r.blockedBy[0][0]], 'danger');
      return;
    }
    if (JSON.stringify(r.decisions) === JSON.stringify(this.decisions)) return;
    this.history.push(this.decisions);
    const before = activeConsequences(this.timeline).map((c) => c.def.id);
    this.decisions = r.decisions;
    this.timeline = computeTimeline(this.decisions);
    const opt = T.interventions[id].options[option];
    this.ui.toast(opt.log, 'amber');
    for (const rem of r.removed) {
      const log = T.interventions[rem.id].options[rem.option].log;
      this.ui.toast(fmt(T.removed, { log, reason: T.prereqs[rem.reasons[0]?.[0] ?? ''] ?? '' }), 'danger', 6500);
    }
    this.freshTimeline.add(id);
    this.audio.paper();
    this.audio.chime();
    this.afterPlanChange(before);
    if (this.onboarding === 'choose') this.setOnboarding('visit2026');
    if (this.onboarding === 'preserve' && id === 'oak.renovation' && option === 'preserve') this.setOnboarding('final2026');
  }

  private afterPlanChange(beforeIds: string[]): void {
    this.world.apply(this.era, this.timeline.facts, this.contract.id, { animate: true, reducedMotion: this.save.settings.reducedMotion });
    this.actors.showDecor(this.era, this.timeline.facts, String(this.timeline.facts['oak.location']));
    const now = activeConsequences(this.timeline);
    // pulse newly caused consequences that are visible in this era
    for (const c of now) {
      if (!beforeIds.includes(c.def.id) && c.def.era <= this.era) this.overlays.pulse(this.consequencePoint(c), COLORS.amber, 1.6);
    }
    this.save.plans[this.contract.id] = { ...this.decisions };
    this.persist();
    this.rebuildPreview();
    this.refreshAll();
  }

  undo(): void {
    if (this.mode !== 'planning' || this.world.busy) return;
    const prev = this.history.pop();
    if (!prev) return;
    const before = activeConsequences(this.timeline).map((c) => c.def.id);
    this.decisions = prev;
    this.timeline = computeTimeline(this.decisions);
    this.audio.undo();
    this.ui.toast(T.ui.undo, '');
    this.afterPlanChange(before);
  }

  resetPlan(): void {
    if (this.mode !== 'planning' && this.mode !== 'results') return;
    if (!Object.keys(this.decisions).length) return;
    if (this.world.busy) this.world.animator.finishAll();
    this.history.push(this.decisions);
    const before = activeConsequences(this.timeline).map((c) => c.def.id);
    this.decisions = {};
    this.timeline = computeTimeline(this.decisions);
    this.audio.undo();
    this.afterPlanChange(before);
  }

  toggle(name: 'compare' | 'overlays' | 'underground', on: boolean): void {
    if (name === 'compare') {
      this.compare = on;
      this.updateCompare();
    } else if (name === 'overlays') {
      this.overlaysOn = on;
      this.save.settings.overlays = on;
      this.persist();
      this.updatePatrols();
    } else {
      this.underground = on;
      this.cutaway.setFocus({ building: null, level: on ? 'S' : 'G', xray: on }, this.stage.rig.viewDirXZ());
    }
    this.ui.setToggle(name, on);
    this.audio.click();
  }

  private updatePatrols(): void {
    const w = this.preview?.world;
    const show = !!w && this.overlaysOn && this.era === 2026 && this.mode === 'planning';
    if (!w) return this.overlays.setPatrols([], false);
    this.overlays.setPatrols(w.routes.map((r) => ({ level: r.guard.level, polyline: r.polyline })), show);
    this.labels.hidePrefix('stop:');
    if (show) {
      for (const r of w.routes) {
        r.stops.forEach((s, i) => {
          if (r.guard.level !== 'G') return;
          this.labels.set(`stop:${r.guard.id}:${i}`, simToWorld(s.x + 0.5, s.z + 0.5, r.guard.level).add(new THREE.Vector3(0, 0.15, 0)), `<span class="pause-time">${s.pause}s</span>`);
        });
      }
    }
  }

  /** Compare mode: ghosts of the original timeline + amber tint on what changed. */
  private updateCompare(): void {
    for (const c of [...this.compareGhosts.children]) this.compareGhosts.remove(c);
    for (const { mesh, mat } of this.compareHighlighted) mesh.material = mat;
    this.compareHighlighted = [];
    if (!this.compare || this.mode !== 'planning') return;
    const mine = visibleVariantSet(this.era, this.timeline.facts, this.contract.id);
    const orig = visibleVariantSet(this.era, originalTimeline().facts, this.contract.id);
    const ghostMat = new THREE.MeshBasicMaterial({ color: '#8fa7bd', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    for (const id of orig) {
      if (mine.has(id) || id.startsWith('ground.')) continue;
      for (const n of this.world.variants.get(id) ?? []) {
        n.updateWorldMatrix(true, true);
        n.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const g = new THREE.Mesh(m.geometry, ghostMat);
          g.matrixAutoUpdate = false;
          g.matrix.copy(m.matrixWorld);
          g.renderOrder = 6;
          this.compareGhosts.add(g);
        });
      }
    }
    for (const id of mine) {
      if (orig.has(id) || id.startsWith('ground.') || id === 'terrain.plinth') continue;
      for (const n of this.world.variants.get(id) ?? []) {
        n.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          this.compareHighlighted.push({ mesh: m, mat: m.material });
          const hl = (mm: THREE.Material) => paperMaterial({ key: paperKeyOf(String(mm.name).replace(/^paper_/, '').replace(/_(normal|highlight)$/, '')) as PaperKey, map: (mm as THREE.MeshLambertMaterial).map ?? null, state: 'highlight' });
          m.material = Array.isArray(m.material) ? m.material.map(hl) : hl(m.material);
        });
      }
    }
  }

  // ==================================================================================== preview sim
  private rebuildPreview(): void {
    const w = presentWorld(this.contract, this.timeline.facts);
    const t = this.preview ? this.preview.t : 0;
    this.preview = new HeistSim(w, { preview: true, startTime: t % 600 });
    this.actors.vanStop = w.delivery?.stop ?? 'square';
    this.updatePatrols();
  }

  // ==================================================================================== onboarding
  private setOnboarding(step: App['onboarding']): void {
    this.onboarding = step;
    this.labels.hidePrefix('onb:');
    if (step === 'done') return;
    if (step === 'inspect') {
      if (this.era !== 1946) return;
      const p = this.sitePoint('oak').add(new THREE.Vector3(0, 0.8, 0));
      this.labels.set('onb:oak', p, `<span class="pointer">${T.onboarding.clickSapling}</span>`);
    } else if (step === 'visit2026') {
      this.ui.toast(T.onboarding.visit2026, 'amber', 6000);
    } else if (step === 'visit1986') {
      this.ui.toast(T.onboarding.visit1986, 'amber', 6000);
    } else if (step === 'preserve') {
      if (this.era !== 1986) return;
      const p = this.sitePoint('oak').add(new THREE.Vector3(0, 1.8, 0));
      this.labels.set('onb:oak', p, `<span class="pointer">${T.interventions['oak.renovation'].options.preserve.label}?</span>`);
    } else if (step === 'final2026') {
      this.ui.toast(T.onboarding.visit2026, 'amber', 6000);
    }
  }

  private onboardingAfter2026(): void {
    const f = this.timeline.facts;
    if (f['oak.roofAccess'] || f['drain.hatch'] || f['service.door'] === 'alley' || f['oak.squareCanopy']) {
      setTimeout(() => this.ui.toast(T.onboarding.ready, 'green', 7000), 1300);
      this.finishOnboarding();
    } else if (f['oak.pruned'] && f['oak.location'] === 'yard') {
      this.setOnboarding('visit1986');
    } else {
      setTimeout(() => this.ui.toast(T.onboarding.independent, 'amber', 6000), 1300);
      this.finishOnboarding();
    }
  }

  private finishOnboarding(): void {
    this.onboarding = 'done';
    this.labels.hidePrefix('onb:');
    this.save.onboardingDone = true;
    this.persist();
  }

  // ==================================================================================== intro
  private async playIntro(): Promise<void> {
    this.mode = 'intro';
    this.ui.setMode('intro');
    this.era = 2026;
    this.audio.setAmbience(2026);
    const skipBtn = h('button', { class: 'chip skip', onclick: () => (this.skipRequested = true) }, T.intro.skip);
    this.ui.root.append(skipBtn);
    this.skipRequested = false;
    const rig = this.stage.rig;
    const wait = (s: number) => new Promise<void>((res) => {
      const t0 = performance.now();
      const tick = () => (this.skipRequested || performance.now() - t0 > s * 1000 ? res() : requestAnimationFrame(tick));
      tick();
    });
    await rig.flyTo({ target: new THREE.Vector3(1.5, 1.2, -3), azimuth: 20 * DEG, elevation: 26 * DEG, viewSize: 6.5 }, 0);
    this.world.apply(2026, originalTimeline().facts, this.contract.id, { animate: false, reducedMotion: true });
    if (!this.skipRequested) {
      this.ui.caption(T.intro.lines[0], 'RIVERDALE · LINDEN SQUARE');
      void rig.flyTo({ target: new THREE.Vector3(1, 1.5, -4), azimuth: 55 * DEG, elevation: 30 * DEG, viewSize: 7.5 }, 4);
      await wait(3.2);
    }
    if (!this.skipRequested) {
      this.ui.caption(T.intro.lines[1]);
      await wait(2.4);
    }
    if (!this.skipRequested) {
      this.ui.caption(T.intro.lines[2], '1946');
      this.setEra(1946);
      const oak = this.sitePoint('oak');
      void rig.flyTo({ target: oak.clone().add(new THREE.Vector3(0, 0.2, 0)), azimuth: 40 * DEG, elevation: 32 * DEG, viewSize: 4.2 }, 2.4);
      await wait(3.4);
    }
    skipBtn.remove();
    this.ui.caption(null);
    this.save.introSeen = true;
    this.persist();
    this.era = 1946; // also when the intro was skipped before the jump to 1946
    this.enterPlanning();
    await rig.flyTo({ target: DEFAULT_VIEW.target.clone(), azimuth: DEFAULT_VIEW.azimuth, elevation: DEFAULT_VIEW.elevation, viewSize: 10.5 }, 1.6);
  }

  // ==================================================================================== heist
  startJob(force: boolean): void {
    if (this.mode !== 'planning') return;
    const f = this.timeline.facts;
    const fails = failingRequirements(this.contract, f, Object.keys(this.decisions).length);
    if (fails.length && !force) {
      const items = fails.map((id) => h('li', {}, h('span', { class: 'no', text: '✗ ' }), `${T.conditions[id]} — ${T.conditionFailed[id]}`));
      this.ui.dialog([
        h('div', { class: 'kicker', text: this.contractLine() }),
        h('h2', { text: T.startCheck.title }),
        h('p', { text: T.startCheck.body }),
        h('ul', { class: 'conds' }, ...items),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', onclick: () => this.ui.closeDialog() }, T.startCheck.back),
          h('button', { class: 'btn primary', onclick: () => (this.ui.closeDialog(), this.enterHeist(true)) }, T.startCheck.practice)),
      ], { onClose: () => this.ui.closeDialog() });
      return;
    }
    this.enterHeist(fails.length > 0);
  }

  enterHeist(practice: boolean): void {
    this.world.animator.finishAll();
    this.practice = practice;
    this.select(null);
    if (this.era !== 2026) {
      this.era = 2026;
      this.world.apply(2026, this.timeline.facts, this.contract.id, { animate: false, reducedMotion: true });
      this.actors.showDecor(2026, this.timeline.facts, String(this.timeline.facts['oak.location']));
    }
    this.compare = false;
    this.updateCompare();
    this.underground = false;
    this.ui.setToggle('underground', false);
    const w = presentWorld(this.contract, this.timeline.facts);
    this.sim = new HeistSim(w);
    this.eventCursor = 0;
    this.hatchUsed = false;
    this.acc = 0;
    this.holdSpace = false;
    this.mode = 'heist';
    this.ui.setMode('heist');
    this.overlays.setPatrolsVisible(false);
    this.labels.hidePrefix('stop:');
    this.overlays.clearCausal();
    this.audio.setAmbience('heist');
    this.setTargetProps(true);
    this.placeInteractableLabels();
    const start = simToWorld(w.start.x + 0.5, w.start.z + 0.5, 'G');
    this.stage.rig.followPoint = null;
    void this.stage.rig.flyTo({ target: start, viewSize: 8.5 }, 1.0).then(() => {
      if (this.mode === 'heist') this.stage.rig.followPoint = new THREE.Vector3();
    });
  }

  private setTargetProps(visible: boolean): void {
    for (const id of ['prop.lindenFile', 'prop.diamond', 'prop.depositBox']) {
      for (const n of this.world.variants.get(id) ?? []) n.visible = visible && this.world.isVisible(id);
    }
  }

  private placeInteractableLabels(): void {
    const w = this.sim!.world;
    this.labels.hidePrefix('it:');
    const tgt = w.target;
    this.labels.set('it:target', simToWorld(tgt.x + 0.5, tgt.z + 0.5, tgt.level).add(new THREE.Vector3(0, 1.3, 0)), `<span class="icon target"><span>◆</span></span>`);
    this.labels.set('it:exit', simToWorld(w.exit.x + 0.5, w.exit.z + 0.5, 'G').add(new THREE.Vector3(0, 1.2, 0)), `<span class="icon exit">⚑</span>`);
    if (w.junction) this.labels.set('it:junction', simToWorld(w.junction.x + 0.2, w.junction.z + 0.5, 'G').add(new THREE.Vector3(0, 1.7, 0)), `<span class="icon power">ϟ</span>`);
  }

  private stepHeist(dt: number): void {
    const sim = this.sim!;
    this.acc += dt * this.timeScale;
    let steps = 0;
    const maxSteps = Math.max(12, Math.ceil(this.timeScale * 8));
    while (this.acc >= DT && steps < maxSteps && sim.status === 'running') {
      sim.setHold(this.holdSpace);
      if (this.autoplay) this.autoplayTick(sim);
      sim.step();
      this.acc -= DT;
      steps++;
    }
    if (steps >= maxSteps) this.acc = 0;
    this.consumeEvents(sim);
    // camera follow + cutaway focus
    const th = sim.thiefView();
    const p = simToWorld(th.x, th.z, th.level);
    if (this.stage.rig.followPoint) this.stage.rig.followPoint.copy(p).add(new THREE.Vector3(0, 0.6, 0));
    this.lastFocusCheck -= dt;
    if (this.lastFocusCheck <= 0) {
      this.lastFocusCheck = 0.2;
      this.updateHeistFocus();
    }
    const tgtLabel = sim.carrying ? T.heist.escape : fmt(T.heist.getTarget, { target: T.contracts[this.contract.id].target });
    const lines: string[] = [];
    const del = sim.delivery();
    if (sim.world.delivery) {
      lines.push(del.doorOpen ? fmt(T.heist.deliveryOpen, { s: Math.ceil(del.closesIn) }) : fmt(T.heist.delivery, { s: Math.ceil(del.nextOpenIn) }));
    }
    if (this.contract.circuitCameras.length || this.contract.glassDoor === 'laser' || this.contract.vaultDoor === 'maglock') {
      lines.push(fmt(T.heist.power, { state: sim.power ? `<b>${T.heist.powerOn}</b>` : `<b style="color:var(--route)">${T.heist.powerOff}</b>` }));
    }
    if (sim.waitingForDoor) lines.push(`<i>${T.heist.waitingDoor}</i>`);
    this.ui.setHud({ meter: sim.meter, time: sim.t, objective: tgtLabel, carrying: sim.carrying, lines, practice: this.practice });
    this.audio.tension = sim.meter;
    if (sim.status === 'caught') this.onCaught();
    else if (sim.status === 'escaped') void this.onEscaped();
  }

  private updateHeistFocus(): void {
    const sim = this.sim!;
    const th = sim.thiefView();
    this.focusOnThief(sim.world.grid, { level: sim.thiefTile.level, x: th.x, z: th.z });
  }

  /** Cut away whatever hides the thief: the building they are in, or the bank complex in front of them. */
  focusOnThief(grid: WorldGrid, th: { level: Level; x: number; z: number }): void {
    const area = areaAt(grid, { level: th.level, x: Math.floor(th.x), z: Math.floor(th.z) });
    let building = area?.kind === 'indoor' ? area.building ?? null : null;
    const xray = th.level === 'S' || th.level === 'B';
    if (!building && !xray) building = this.findOccluder(th);
    this.cutaway.setFocus({ building, level: th.level, xray }, this.stage.rig.viewDirXZ());
  }

  private findOccluder(th: { level: Level; x: number; z: number }): string | null {
    const p = simToWorld(th.x, th.z, th.level).add(new THREE.Vector3(0, 0.5, 0));
    const cam = this.stage.rig.camera;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const origin = p.clone().addScaledVector(dir, -80);
    this.raycaster.set(origin, dir);
    this.raycaster.far = 80 - 0.3;
    const hits = this.raycaster.intersectObject(this.world.root, true);
    for (const hit of hits) {
      if (!hit.object.visible) continue;
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.bj_building) o = o.parent;
      const b = o?.userData.bj_building as string | undefined;
      if (b === 'bank' || b === 'westwing' || b === 'annex') return 'bank';
    }
    return null;
  }

  private consumeEvents(sim: HeistSim): void {
    const evs = sim.events;
    for (; this.eventCursor < evs.length; this.eventCursor++) this.onHeistEvent(evs[this.eventCursor]);
  }

  private onHeistEvent(e: HeistEvent): void {
    switch (e.type) {
      case 'spotted':
        this.audio.spotted();
        this.ui.toast(fmt(T.heist.spotted, { who: T.observers[e.observer ?? ''] ?? e.observer ?? '' }), 'danger', 2200);
        break;
      case 'pickup':
        this.audio.pickup();
        this.ui.toast(fmt(T.heist.pickup, { target: T.contracts[this.contract.id].target }), 'green');
        this.setTargetProps(false);
        this.labels.hide('it:target');
        break;
      case 'powerCut':
        this.audio.powerCut();
        this.ui.toast(T.heist.powerCut, 'amber');
        this.labels.hide('it:junction');
        break;
      case 'portal':
        if (e.id === 'portal.hatch' || e.id === 'portal.manhole') this.hatchUsed = this.hatchUsed || e.id === 'portal.hatch';
        this.audio.climb();
        break;
      case 'door':
        this.audio.door();
        break;
      default:
        break;
    }
  }

  private onCaught(): void {
    const sim = this.sim!;
    this.mode = 'failed';
    this.audio.caught();
    this.audio.setAmbience(2026);
    this.stage.rig.followPoint = null;
    const ev = sim.caughtBy!;
    const who = T.observers[ev.observer ?? ''] ?? ev.observer ?? '?';
    const area = areaAt(sim.world.grid, { level: ev.level ?? 'G', x: Math.floor(ev.x ?? 0), z: Math.floor(ev.z ?? 0) });
    const where = T.places[area?.kind ?? 'outdoor'] ?? T.places.outdoor;
    const time = `${Math.floor(sim.t / 60)}:${String(Math.floor(sim.t % 60)).padStart(2, '0')}`;
    setTimeout(() => {
      if (this.mode !== 'failed') return;
      this.ui.dialog([
        h('div', { class: 'kicker', text: this.contractLine() }),
        h('h2', { text: T.failure.title }),
        h('p', { text: `${fmt(T.failure.body, { who: cap(who), time })} ${fmt(T.failure.where, { where })}` }),
        h('p', { style: 'font-style:italic;color:var(--ink-soft)', text: T.failure.tip }),
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary', onclick: () => (this.ui.closeDialog(), this.enterHeist(this.practice)) }, T.failure.retry),
          h('button', { class: 'btn', onclick: () => this.backToPlanning() }, T.failure.back)),
      ], { stamp: { text: 'CAUGHT', cls: 'red' } });
    }, 900);
  }

  backToPlanning(): void {
    this.ui.closeDialog();
    this.autoplay = null;
    this.timeScale = 1;
    this.setTargetProps(true);
    this.labels.hidePrefix('it:');
    this.labels.hidePrefix('obs:');
    this.enterPlanning();
    void this.stage.rig.reset(1.0);
  }

  private async onEscaped(): Promise<void> {
    const sim = this.sim!;
    this.mode = 'replay';
    this.autoplay = null;
    this.audio.success();
    this.audio.setAmbience(2026);
    this.stage.rig.followPoint = null;
    this.labels.hidePrefix('it:');
    this.labels.hidePrefix('obs:');
    this.overlays.hideFans();
    const outcome: HeistOutcome = { success: true, practice: this.practice, sim, plan: { ...this.decisions }, timeline: this.timeline, contract: this.contract };
    this.lastOutcome = outcome;
    this.recordResult(outcome);
    await this.playReplay(outcome);
    this.showResults(outcome);
  }

  private recordResult(o: HeistOutcome): void {
    if (o.practice) return;
    const id = o.contract.id;
    const changes = Object.keys(o.plan).length;
    const conditions = o.contract.optional.filter((c) => heistConditionHolds(c, o.timeline.facts, changes, { detections: o.sim.detections, powerCut: !o.sim.power }));
    const rec = { time: Math.round(o.sim.t * 10) / 10, detections: o.sim.detections, cost: planCost(o.plan), changes, approach: o.sim.approach(), conditions };
    const prev = this.save.completed[id];
    if (!prev || rec.time < prev.time || rec.detections < prev.detections) this.save.completed[id] = rec;
    const used = new Set([...(this.save.approaches[id] ?? []), rec.approach.slice().sort().join('+')]);
    this.save.approaches[id] = [...used];
    const next = nextContract(id);
    if (next && !this.save.unlocked.includes(next)) this.save.unlocked.push(next);
    this.persist();
  }

  async playReplay(o: HeistOutcome): Promise<void> {
    this.mode = 'replay';
    this.ui.setMode('replay');
    this.skipRequested = false;
    const skip = h('button', { class: 'chip skip', onclick: () => (this.skipRequested = true) }, T.replay.skip);
    this.ui.root.append(skip);
    try {
      await runReplay(this, o, () => this.skipRequested);
    } finally {
      skip.remove();
      this.ui.caption(null);
      this.overlays.setPath(null, true);
    }
  }

  private showResults(o: HeistOutcome): void {
    this.mode = 'results';
    this.ui.setMode('results');
    this.era = 2026;
    this.world.apply(2026, this.timeline.facts, this.contract.id, { animate: false, reducedMotion: true });
    this.setTargetProps(true);
    const sim = o.sim;
    const changes = Object.keys(o.plan).length;
    const opt = o.contract.optional.map((c) => {
      const ok = heistConditionHolds(c, o.timeline.facts, changes, { detections: sim.detections, powerCut: !sim.power });
      return h('li', {}, h('span', { class: ok ? 'ok' : 'no', text: ok ? '✓ ' : '✗ ' }), T.conditions[c]);
    });
    const req = o.contract.required.map((c) => {
      const ok = heistConditionHolds(c, o.timeline.facts, changes, { detections: sim.detections, powerCut: !sim.power });
      return h('li', {}, h('span', { class: ok ? 'ok' : 'no', text: ok ? '✓ ' : '✗ ' }), T.conditions[c]);
    });
    const approach = sim.approach().map((a) => T.approaches[a] ?? a).join(' + ') || '—';
    const next = nextContract(o.contract.id);
    const time = `${Math.floor(sim.t / 60)}:${String(Math.floor(sim.t % 60)).padStart(2, '0')}`;
    const actions: HTMLElement[] = [];
    if (next && !o.practice) actions.push(h('button', { class: 'btn primary', onclick: () => this.switchContract(next) }, T.results.next));
    actions.push(
      h('button', { class: 'btn', onclick: () => this.backToPlanning() }, T.results.another),
      h('button', { class: 'btn', onclick: () => void this.replayAgain() }, T.results.replay),
      h('button', { class: 'btn', onclick: () => (this.backToPlanning(), this.resetPlan()) }, T.results.reset),
      h('button', { class: 'btn', onclick: () => void this.sharePlan() }, T.results.share),
    );
    this.ui.dialog([
      h('div', { class: 'kicker', text: T.contracts[o.contract.id].short }),
      h('h2', { text: o.practice ? T.results.practice : T.results.title }),
      o.practice ? h('p', { style: 'color:var(--danger)', text: T.results.practiceNote }) : h('p', { text: T.contracts[o.contract.id].name }),
      h('dl', { class: 'stats' },
        h('dt', { text: T.results.contract }), h('dd', { text: T.contracts[o.contract.id].name }),
        h('dt', { text: T.results.interventions }), h('dd', { text: String(changes) }),
        h('dt', { text: T.results.cost }), h('dd', { text: `${planCost(o.plan)} / ${o.contract.budget}` }),
        h('dt', { text: T.results.time }), h('dd', { text: time }),
        h('dt', { text: T.results.detections }), h('dd', { text: String(sim.detections) }),
        h('dt', { text: T.results.approach }), h('dd', { text: approach })),
      h('div', { class: 'kicker', text: T.results.conditions }),
      h('ul', { class: 'conds' }, ...req, ...opt),
      !next && !o.practice ? h('p', { style: 'font-style:italic', text: T.results.allDone }) : null,
      h('div', { class: 'actions' }, ...actions),
    ].filter(Boolean) as HTMLElement[], { stamp: o.practice ? { text: 'PRACTICE', cls: 'ink' } : { text: 'CLOSED', cls: 'green' } });
  }

  private async replayAgain(): Promise<void> {
    if (!this.lastOutcome) return;
    this.ui.closeDialog();
    await this.playReplay(this.lastOutcome);
    this.showResults(this.lastOutcome);
  }

  // ==================================================================================== dialogs
  switchContract(id: ContractId): void {
    if (!this.save.unlocked.includes(id)) {
      this.ui.toast(T.ui.contractLocked, 'danger');
      return;
    }
    this.ui.closeDialog();
    this.contract = CONTRACT_BY_ID.get(id)!;
    this.save.current = id;
    this.decisions = { ...(this.save.plans[id] ?? {}) };
    this.timeline = computeTimeline(this.decisions);
    this.history.clear();
    this.persist();
    this.selected = null;
    this.setTargetProps(true);
    this.labels.hidePrefix('it:');
    this.enterPlanning();
    void this.stage.rig.reset(0.8);
    this.ui.toast(`${this.contractLine()} — ${T.contracts[id].objective}`, 'amber', 5000);
    setTimeout(() => this.showBrief(), 300);
  }

  private showBrief(): void {
    const c = T.contracts[this.contract.id];
    this.ui.dialog([
      h('div', { class: 'kicker', text: `${c.short} · ${T.ui.budget}: ${this.contract.budget}` }),
      h('h2', { text: c.name }),
      h('p', { text: c.brief }),
      this.contract.required.length ? h('ul', { class: 'conds' }, ...this.contract.required.map((r) => h('li', { text: `• ${T.conditions[r]}` }))) : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => this.ui.closeDialog() }, 'Open the case file')),
    ].filter(Boolean) as HTMLElement[], { stamp: { text: 'NEW JOB', cls: 'ink' }, onClose: () => this.ui.closeDialog() });
  }

  showContracts(): void {
    if (this.mode !== 'planning') return;
    const items = CONTRACTS.map((c) => {
      const unlocked = this.save.unlocked.includes(c.id);
      const done = !!this.save.completed[c.id];
      const tx = T.contracts[c.id];
      return h('button', { class: 'contract-item', disabled: !unlocked, onclick: () => this.switchContract(c.id) },
        h('div', { class: 'n', text: `${tx.short}${done ? ' · ' + T.ui.completed : !unlocked ? ' · ' + T.ui.locked : ''}${c.id === this.contract.id ? ' · ●' : ''}` }),
        h('div', { class: 't', text: tx.name }),
        h('div', { class: 's', text: unlocked ? tx.objective : T.ui.contractLocked }));
    });
    this.ui.dialog([h('h2', { text: T.ui.contracts.toUpperCase() }), h('div', { class: 'contract-list' }, ...items),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => this.ui.closeDialog() }, T.ui.close))], { onClose: () => this.ui.closeDialog() });
  }

  showHints(): void {
    if (this.mode !== 'planning') return;
    const id = this.contract.id;
    const lvl = this.save.hintLevel[id] ?? 0;
    const render = (n: number) => {
      const hints = T.contracts[id].hints.slice(0, n);
      const list = h('ol', {}, ...hints.map((x) => h('li', { style: 'margin:6px 0;font-size:17px', text: x })));
      const actions = h('div', { class: 'actions' });
      if (n < 3) actions.append(h('button', { class: 'btn primary', onclick: () => {
        this.save.hintLevel[id] = n + 1;
        this.persist();
        this.audio.hint();
        render(n + 1);
      } }, n === 0 ? 'Show a hint' : 'A more specific hint'));
      actions.append(h('button', { class: 'btn', onclick: () => this.ui.closeDialog() }, T.ui.close));
      this.ui.dialog([h('div', { class: 'kicker', text: this.contractLine() }), h('h2', { text: 'HINTS' }),
        n ? list : h('p', { style: 'font-style:italic', text: 'Hints go from a direction, to specifics, to the answer for one obstacle.' }), actions], { onClose: () => this.ui.closeDialog() });
    };
    render(lvl);
  }

  showSettings(): void {
    const s = this.save.settings;
    const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s.volume) }) as HTMLInputElement;
    vol.oninput = () => {
      s.volume = Number(vol.value);
      this.audio.setVolume(s.volume);
      this.persist();
    };
    const cb = (checked: boolean, fn: (v: boolean) => void) => {
      const i = h('input', { type: 'checkbox' }) as HTMLInputElement;
      i.checked = checked;
      i.onchange = () => fn(i.checked);
      return i;
    };
    const quality = h('select', {}, ...(['low', 'medium', 'high'] as const).map((q) => {
      const o = h('option', { value: q, text: T.settings[`quality${q[0].toUpperCase()}${q.slice(1)}` as 'qualityLow'] });
      if (q === s.quality) o.selected = true;
      return o;
    })) as HTMLSelectElement;
    quality.onchange = () => {
      s.quality = quality.value as 'low' | 'medium' | 'high';
      this.stage.setQuality(s.quality);
      this.persist();
    };
    const wasPaused = this.mode === 'heist';
    if (wasPaused) this.mode = 'paused';
    const close = () => {
      this.ui.closeDialog();
      if (wasPaused && this.mode === 'paused') this.showPause();
    };
    this.ui.dialog([
      h('h2', { text: T.settings.title }),
      h('div', { class: 'setting-row' }, T.settings.volume, vol),
      h('label', { class: 'setting-row' }, T.settings.mute, cb(s.muted, (v) => ((s.muted = v), this.audio.setMuted(v), this.persist()))),
      h('label', { class: 'setting-row' }, T.settings.reducedMotion, cb(s.reducedMotion, (v) => {
        s.reducedMotion = v;
        this.stage.rig.reducedMotion = v;
        this.cutaway.reducedMotion = v;
        this.persist();
      })),
      h('div', { class: 'setting-row' }, T.settings.quality, quality),
      h('label', { class: 'setting-row' }, T.settings.fps, cb(s.showFps, (v) => ((s.showFps = v), this.ui.setFps(v ? '…' : null), this.persist()))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => {
          if (!confirm(T.settings.resetConfirm)) return;
          clearSave();
          this.save = defaultSave();
          location.hash = '';
          location.reload();
        } }, T.settings.resetProgress),
        h('button', { class: 'btn primary', onclick: close }, T.ui.close)),
    ], { onClose: close });
  }

  private showPause(): void {
    if (this.mode !== 'heist' && this.mode !== 'paused') return;
    this.mode = 'paused';
    this.holdSpace = false;
    this.ui.dialog([
      h('h2', { text: T.heist.paused }),
      h('p', { text: T.contracts[this.contract.id].objective }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: () => this.resume() }, T.heist.resume),
        h('button', { class: 'btn', onclick: () => (this.ui.closeDialog(), this.enterHeist(this.practice)) }, T.heist.restart),
        h('button', { class: 'btn', onclick: () => this.showSettings() }, T.ui.settings),
        h('button', { class: 'btn', onclick: () => this.backToPlanning() }, T.heist.abort)),
    ], { onClose: () => this.resume() });
  }

  private resume(): void {
    this.ui.closeDialog();
    if (this.mode === 'paused') this.mode = 'heist';
    this.timer.reset();
  }

  async sharePlan(): Promise<void> {
    const url = planUrl(location.href, this.contract.id, this.decisions);
    history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url);
      this.ui.toast(T.ui.shareCopied, 'green');
    } catch {
      this.ui.toast(T.ui.shareFailed, 'amber', 5000);
    }
  }

  persist(): void {
    this.save.current = this.contract.id;
    writeSave(this.save);
  }

  // ==================================================================================== input
  private bindInput(): void {
    const el = this.stage.renderer.domElement;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      this.audio.init();
      this.pointer.down = true;
      this.pointer.button = e.button;
      this.pointer.moved = 0;
      this.pointer.startX = this.pointer.x = e.clientX;
      this.pointer.startY = this.pointer.y = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      const dx = e.clientX - this.pointer.x;
      const dy = e.clientY - this.pointer.y;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.inside = true;
      if (this.pointer.down) {
        this.pointer.moved += Math.abs(dx) + Math.abs(dy);
        if (this.pointer.moved > 6 && this.mode !== 'intro') {
          if (this.pointer.button === 2 || e.shiftKey) this.stage.rig.pan(dx, dy, this.stage.size.height);
          else this.stage.rig.rotate(dx, dy);
          this.ui.stageEl.classList.add('drag');
          if (this.cutaway && (this.mode === 'heist' || this.underground)) this.lastFocusCheck = 0;
        }
      } else this.onHover();
    });
    el.addEventListener('pointerup', (e) => {
      this.ui.stageEl.classList.remove('drag');
      const wasClick = this.pointer.down && this.pointer.moved <= 6;
      this.pointer.down = false;
      if (wasClick && e.button === 0) this.onClick();
    });
    el.addEventListener('pointerleave', () => {
      this.pointer.inside = false;
      this.clearHover();
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.mode === 'intro') return;
      this.stage.rig.zoom(e.deltaY);
    }, { passive: false });
    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('resize', () => this.stage.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'heist') this.showPause();
      this.timer.reset();
    });
    addEventListener('hashchange', () => {
      const r = planFromHash(location.hash);
      if (!r || this.mode !== 'planning') return;
      if (r.ok && this.save.unlocked.includes(r.contract)) {
        if (r.contract !== this.contract.id) this.switchContract(r.contract);
        const before = activeConsequences(this.timeline).map((c) => c.def.id);
        this.history.push(this.decisions);
        this.decisions = r.decisions;
        this.timeline = computeTimeline(this.decisions);
        this.afterPlanChange(before);
        this.ui.toast('Plan loaded from link.', 'green');
      } else this.ui.toast(r.ok ? T.errors.linkLocked : T.errors.link, 'danger', 6000);
    });
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (down) this.audio.init();
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.code === 'Space') {
      if (this.mode === 'heist') {
        this.holdSpace = down;
        e.preventDefault();
      }
      return;
    }
    if (!down) return;
    if (e.key === 'Escape') {
      if (this.mode === 'intro' || this.mode === 'replay') this.skipRequested = true;
      else if (this.mode === 'heist') this.showPause();
      else if (this.mode === 'paused') this.resume();
      else if (this.ui.dialogOpen && this.mode === 'planning') this.ui.closeDialog();
      else if (this.mode === 'planning') this.select(null);
      return;
    }
    if (this.mode !== 'planning' || this.ui.dialogOpen) return;
    if (e.key === '1') this.setEra(1946);
    else if (e.key === '2') this.setEra(1986);
    else if (e.key === '3') this.setEra(2026);
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.undo();
    } else if (e.key.toLowerCase() === 'h') this.showHints();
    else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) void this.stage.rig.reset(0.6);
  }

  private ndc(): THREE.Vector2 {
    const r = this.stage.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((this.pointer.x - r.left) / r.width) * 2 - 1, -((this.pointer.y - r.top) / r.height) * 2 + 1);
  }

  private onHover(): void {
    if (this.mode === 'planning') {
      const site = this.pickSite();
      if (site !== this.hoverSite) {
        this.hoverSite = site;
        this.setHoverHighlight(site);
      }
      this.ui.stageEl.classList.toggle('pick', !!site);
      if (site) this.labels.set('hover', this.sitePoint(site.startsWith('camera:') ? 'bank' : site).add(new THREE.Vector3(0, 1.6, 0)), `<span class="tag site">${this.siteName(site)}</span>`);
      else this.labels.hide('hover');
    } else if (this.mode === 'heist' && this.sim) {
      this.heistHover();
    }
  }

  private clearHover(): void {
    this.hoverSite = null;
    this.setHoverHighlight(null);
    this.labels.hide('hover');
    this.overlays?.setHover(null, true);
    this.overlays?.setPath(null, true);
  }

  private siteName(site: string): string {
    if (site.startsWith('camera:')) return `${T.sites.cameras.name} ${site.split(':')[1]}`;
    return T.sites[site]?.name ?? site;
  }

  private setHoverHighlight(site: string | null): void {
    for (const { mesh, mat } of this.hoverMeshes) mesh.material = mat;
    this.hoverMeshes = [];
    if (!site || this.compare) return;
    const meshes = site.startsWith('camera:') ? [] : this.world.meshesOfSite(site);
    for (const m of meshes) {
      this.hoverMeshes.push({ mesh: m, mat: m.material });
      const hl = (mm: THREE.Material) => paperMaterial({ key: paperKeyOf(String(mm.name).replace(/^paper_/, '').replace(/_(normal|highlight)$/, '')) as PaperKey, map: (mm as THREE.MeshLambertMaterial).map ?? null, state: 'highlight' });
      m.material = Array.isArray(m.material) ? m.material.map(hl) : hl(m.material);
    }
  }

  private pickSite(): string | null {
    this.raycaster.setFromCamera(this.ndc(), this.stage.rig.camera);
    this.raycaster.far = Infinity;
    const hits = this.raycaster.intersectObject(this.world.root, true);
    for (const hit of hits) {
      if (!isShown(hit.object)) continue;
      const site = this.world.siteOf(hit.object);
      if (site) return site;
      return null;
    }
    return null;
  }

  private onClick(): void {
    if (this.mode === 'intro' || this.mode === 'replay') {
      this.skipRequested = true;
      return;
    }
    if (this.mode === 'planning') {
      const site = this.pickSite();
      this.select(site);
      return;
    }
    if (this.mode === 'heist' && this.sim) {
      this.heistHover();
      const sim = this.sim;
      if (this.hover.interact) {
        const r = sim.interact(this.hover.interact);
        if (!r.ok) this.explainFailure(r.failure);
        else this.audio.click();
      } else if (this.hover.tile) {
        const r = sim.moveTo(this.hover.tile);
        if (!r.ok) this.explainFailure(r.failure);
        else this.audio.click();
      }
    }
  }

  private explainFailure(f?: PathFailure): void {
    this.audio.error();
    if (!f) return;
    if (f.reason === 'blocked-door' && f.door) this.ui.toast(fmt(T.heist.blockedDoor, { door: T.doors[f.door.kind] ?? f.door.kind }), 'danger', 2400);
    else if (f.reason === 'not-walkable') this.ui.toast(T.heist.notWalkable, 'danger', 1800);
    else this.ui.toast(T.heist.unreachable, 'danger', 1800);
  }

  /** Heist hover: interactables first, then walkable tiles on the levels currently shown. */
  private heistHover(): void {
    const sim = this.sim!;
    const cam = this.stage.rig.camera;
    this.raycaster.setFromCamera(this.ndc(), cam);
    const ray = this.raycaster.ray;
    // interactables (screen-space proximity)
    const w = sim.world;
    const cands: Array<[Interactable, TileRef | null]> = [['target', sim.carrying ? null : w.target], ['junction', sim.power ? w.junction : null], ['exit', w.exit]];
    const r = this.stage.renderer.domElement.getBoundingClientRect();
    let pick: Interactable | null = null;
    for (const [id, t] of cands) {
      if (!t) continue;
      const p = simToWorld(t.x + 0.5, t.z + 0.5, t.level).add(new THREE.Vector3(0, 0.6, 0)).project(cam);
      const sx = (p.x * 0.5 + 0.5) * r.width + r.left;
      const sy = (-p.y * 0.5 + 0.5) * r.height + r.top;
      if (Math.hypot(sx - this.pointer.x, sy - this.pointer.y) < 26 && this.levelVisible(t.level, t.x, t.z, w.grid)) pick = id;
    }
    let tile: TileRef | null = null;
    for (const level of LEVELS_UP) {
      const y = levelY(level);
      if (Math.abs(ray.direction.y) < 1e-6) continue;
      const tt = (y - ray.origin.y) / ray.direction.y;
      if (tt < 0) continue;
      const p = ray.origin.clone().addScaledVector(ray.direction, tt);
      const cand: TileRef = { level, x: Math.floor(p.x + 15), z: Math.floor(p.z + 11) };
      if (!isWalkable(w.grid, cand)) continue;
      const area = areaAt(w.grid, cand);
      if (!this.cutaway.levelShown(area?.building, level)) continue;
      tile = cand;
      break;
    }
    this.hover.interact = pick;
    this.hover.tile = tile;
    const dest = pick ? sim.interactionTile(pick) : tile;
    if (!dest) {
      this.overlays.setHover(null, true);
      this.overlays.setPath(null, true);
      this.ui.stageEl.classList.remove('walk', 'pick', 'blocked');
      return;
    }
    const res = sim.planTo(dest);
    this.hover.path = res;
    const ok = !isPathFailure(res);
    this.overlays.setHover(tile && !pick ? tile : null, ok);
    if (ok) {
      const pts = [{ x: sim.thiefView().x, z: sim.thiefView().z, level: sim.thiefView().level }, ...res.steps.slice(1).map((s) => ({ x: s.x + 0.5, z: s.z + 0.5, level: s.level }))];
      const waits = res.steps.filter((s) => s.wait).map((s) => ({ x: s.x + 0.5, z: s.z + 0.5, level: s.level }));
      this.overlays.setPath(pts, true, waits);
    } else this.overlays.setPath([{ x: dest.x + 0.5, z: dest.z + 0.5, level: dest.level }], false);
    this.ui.stageEl.classList.toggle('pick', !!pick && ok);
    this.ui.stageEl.classList.toggle('walk', !pick && ok);
    this.ui.stageEl.classList.toggle('blocked', !ok);
    if (pick) {
      const label = pick === 'target' ? fmt(T.heist.take, { target: T.contracts[this.contract.id].target }) : pick === 'junction' ? T.heist.junction : T.heist.exit;
      this.labels.set('hover', simToWorld(dest.x + 0.5, dest.z + 0.5, dest.level).add(new THREE.Vector3(0, 1.9, 0)), `<span class="tag">${label}</span>`);
    } else this.labels.hide('hover');
  }

  // ==================================================================================== automation (tests)
  /** Drive the live heist with a reference script (issues commands between fixed ticks). */
  startAutoplay(steps: ScriptStep[], waits: number[]): void {
    this.autoplay = { steps, waits, i: 0, w: 0, state: 'idle', until: 0, done: false };
  }

  private autoplayTick(sim: HeistSim): void {
    const ap = this.autoplay!;
    if (ap.done) return;
    for (let guard = 0; guard < 4; guard++) {
      if (ap.state === 'moving' || ap.state === 'acting') {
        if (sim.busy) return;
        ap.state = 'idle';
        ap.i++;
      }
      if (ap.state === 'waiting') {
        if (sim.t + 1e-9 < ap.until) return;
        ap.state = 'idle';
        ap.i++;
      }
      if (ap.i >= ap.steps.length) {
        ap.done = true;
        return;
      }
      const s = ap.steps[ap.i];
      if ('wait' in s || 'safeWait' in s) {
        const secs = 'wait' in s ? s.wait : ap.waits[ap.w++] ?? 0;
        ap.until = sim.t + Math.round(secs / DT) * DT;
        ap.state = 'waiting';
        if (secs <= 0) {
          ap.state = 'idle';
          ap.i++;
          continue;
        }
        return;
      }
      if ('move' in s) {
        const r = sim.moveTo({ level: s.move[0], x: s.move[1], z: s.move[2] });
        if (!r.ok) {
          ap.done = true;
          ap.error = `move failed at step ${ap.i}`;
          return;
        }
        ap.state = 'moving';
        return;
      }
      if ('interact' in s) {
        const r = sim.interact(s.interact);
        if (!r.ok) {
          ap.done = true;
          ap.error = `interact failed at step ${ap.i}`;
          return;
        }
        ap.state = 'acting';
        return;
      }
    }
  }

  private exposeDebug(): void {
    const app = this;
    (window as unknown as { __bj: unknown }).__bj = {
      get ready() {
        return app.mode !== 'loading';
      },
      get mode() {
        return app.mode;
      },
      get era() {
        return app.era;
      },
      get contract() {
        return app.contract.id;
      },
      get decisions() {
        return { ...app.decisions };
      },
      get transitioning() {
        return app.world.busy;
      },
      facts: () => ({ ...app.timeline.facts }),
      setEra: (e: Era) => app.setEra(e),
      choose: (id: string, o: string) => app.choose(id, o),
      undo: () => app.undo(),
      reset: () => app.resetPlan(),
      select: (s: string | null) => app.select(s),
      toggle: (n: 'compare' | 'overlays' | 'underground', on: boolean) => app.toggle(n, on),
      start: (force = false) => app.startJob(force),
      skip: () => (app.skipRequested = true),
      contracts: () => app.showContracts(),
      switchContract: (id: ContractId) => app.switchContract(id),
      unlockAll: () => {
        app.save.unlocked = ['c1', 'c2', 'c3'];
        app.persist();
      },
      heist: () => (app.sim ? { status: app.sim.status, t: app.sim.t, detections: app.sim.detections, carrying: app.sim.carrying, meter: app.sim.meter, power: app.sim.power, tile: app.sim.thiefTile } : null),
      /** solve a reference solution offline and play it in the live game at `speed`× */
      playSolution: (id: string, speed = 6) => {
        const sol = SOLUTIONS.find((s) => s.id === id);
        if (!sol) return { ok: false, error: 'unknown solution' };
        const w = presentWorld(CONTRACT_BY_ID.get(sol.contract)!, computeTimeline(sol.plan).facts);
        const solved = solveScript(w, sol.steps, { step: 0.5 });
        if (!solved.ok) return { ok: false, error: solved.reason };
        app.timeScale = speed;
        app.startAutoplay(sol.steps, solved.waits);
        return { ok: true, waits: solved.waits };
      },
      setTimeScale: (s: number) => (app.timeScale = s),
      autoplay: () => (app.autoplay ? { done: app.autoplay.done, error: app.autoplay.error, step: app.autoplay.i } : null),
      decodePlan: (s: string) => decodePlan(s),
      consequences: () => activeConsequences(app.timeline).map((c) => c.def.id),
      discovered: () => [...app.discovered],
      debug: () => ({ ...app.stage.info(), fps: app.stage.fps, mode: app.mode, era: app.era, quality: app.stage.quality }),
      world: app.world,
      stage: app.stage,
      allConsequenceIds: CONSEQUENCES.map((c) => c.id),
    };
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isShown(o: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p) {
    if (!p.visible) return false;
    p = p.parent;
  }
  return true;
}

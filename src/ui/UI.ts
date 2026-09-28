import { T, fmt } from '../data/text.en';
import type { Era } from '../sim/types';
import './style.css';

/** Minimal DOM helper. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...kids: Array<Node | string | null | undefined | false>): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export const ERA_COLORS: Record<number, string> = { 1946: '#d2a04c', 1986: '#5e9a96', 2026: '#e57560' };

export interface UIActions {
  era(e: Era): void;
  choose(interventionId: string, option: string): void;
  undo(): void;
  reset(): void;
  start(): void;
  toggle(name: 'compare' | 'overlays' | 'underground', on: boolean): void;
  hint(): void;
  contracts(): void;
  settings(): void;
  share(): void;
  closeCard(): void;
}

export interface CardOption {
  id: string;
  label: string;
  note?: string;
  cost: number;
  chosen: boolean;
  original: boolean;
  disabled: boolean;
}

export interface CardModel {
  site: string;
  title: string;
  era: Era;
  description: string;
  status: string[];
  intervention?: { id: string; question: string; options: CardOption[]; blocked?: string };
  elsewhere?: string;
  consequences: string[];
  hint?: string;
}

export interface TimelineEntry {
  era: Era;
  text: string;
  fresh?: boolean;
}

const LEAF = `<svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="#6d7a5c" stroke-width="1.2"><path d="M15 28 C15 20 15 12 20 4"/><path d="M15.5 20 C9 18 7 13 8 9 C12 11 15 14 15.5 20Z" fill="#a7b792" fill-opacity=".5"/><path d="M16.5 15 C21 14 24 10 24 6 C20 7 17 10 16.5 15Z" fill="#a7b792" fill-opacity=".5"/></svg>`;
const MOUSE = `<svg width="22" height="34" viewBox="0 0 22 34" fill="none" stroke="#2e2d30" stroke-width="1.4"><rect x="1.5" y="1.5" width="19" height="31" rx="9.5"/><path d="M11 6v6"/></svg>`;

export class UI {
  readonly root: HTMLElement;
  readonly stageEl: HTMLDivElement;
  private topGoal: HTMLDivElement;
  private topContract: HTMLDivElement;
  private modeEl: HTMLDivElement;
  private left: HTMLElement;
  private right: HTMLElement;
  private tlList: HTMLUListElement;
  private budgetEl: HTMLDivElement;
  private undoBtn: HTMLButtonElement;
  private resetBtn: HTMLButtonElement;
  private toggles: Record<string, HTMLInputElement> = {};
  private eraBtns: Record<number, HTMLButtonElement> = {};
  private startBtn: HTMLButtonElement;
  private bottom: HTMLElement;
  private controlsHint: HTMLDivElement;
  private toasts: HTMLDivElement;
  private modal: HTMLDivElement;
  private hud: HTMLDivElement;
  private heistInfo: HTMLElement;
  private sweepEl: HTMLDivElement;
  private captionEl: HTMLDivElement | null = null;
  private fpsEl: HTMLDivElement;
  private legend: HTMLDivElement;
  private loadingEl: HTMLDivElement | null = null;
  private hintBtn: HTMLButtonElement;
  private cardSite: string | null = null;

  constructor(root: HTMLElement, private readonly act: UIActions) {
    this.root = root;
    this.stageEl = h('div', { class: 'stage' });
    root.append(this.stageEl);

    // top bar
    this.topContract = h('div', { class: 'contract' });
    this.topGoal = h('div', { class: 'goal' });
    this.hintBtn = h('button', { class: 'chip', onclick: () => act.hint(), title: 'Progressive hints (H)' }, T.ui.hint);
    const actions = h('div', { class: 'actions' }, this.hintBtn, h('button', { class: 'chip', onclick: () => act.contracts() }, T.ui.contracts),
      h('button', { class: 'chip', onclick: () => act.share(), title: T.ui.share }, T.ui.share), h('button', { class: 'chip', onclick: () => act.settings() }, T.ui.settings));
    this.modeEl = h('div', { class: 'mode' }, T.modes.planning);
    root.append(h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('h1', { text: T.title }), h('div', { class: 'sub', text: T.subtitle })),
      h('div', { class: 'objective' }, h('div', { class: 'rule' }), h('div', { class: 'text' }, this.topContract, this.topGoal, actions), h('div', { class: 'rule' })),
      this.modeEl));

    // left: timeline
    this.tlList = h('ul', { class: 'tl-list' });
    this.budgetEl = h('div', { class: 'budget' });
    this.undoBtn = h('button', { class: 'btn', onclick: () => act.undo(), title: 'Ctrl/Cmd + Z' }, T.ui.undo);
    this.resetBtn = h('button', { class: 'btn', onclick: () => act.reset() }, T.ui.reset);
    const tg = (name: 'compare' | 'overlays' | 'underground', label: string) => {
      const input = h('input', { type: 'checkbox', onchange: () => act.toggle(name, input.checked) }) as HTMLInputElement;
      this.toggles[name] = input;
      return h('label', { class: 'toggle' }, input, label);
    };
    this.left = h('aside', { class: 'panel left', 'aria-label': 'Your timeline' },
      h('h2', { text: T.ui.timeline }), this.tlList, this.budgetEl, h('div', { class: 'row' }, this.undoBtn, this.resetBtn),
      h('div', { class: 'toggles' }, tg('compare', T.ui.compare), tg('overlays', T.ui.overlays), tg('underground', T.ui.underground)),
      h('div', { class: 'quote', html: `${LEAF}“Same places.<br/>New stories.”` }));
    root.append(this.left);

    // right: object card
    this.right = h('aside', { class: 'panel right card', 'aria-live': 'polite' });
    root.append(this.right);
    this.setCard(null);

    // bottom: controls hint, eras, start
    this.controlsHint = h('div', { class: 'controls-hint', html: `${MOUSE}<span>${T.controls.planning}</span>` });
    const eras = h('nav', { class: 'eras', 'aria-label': 'Era' });
    ([1946, 1986, 2026] as Era[]).forEach((e, i) => {
      const b = h('button', { class: 'era', dataset: { era: String(e) }, onclick: () => act.era(e), 'aria-label': `${e}: ${T.eras[e].tagline}`, title: T.eras[e].tagline },
        h('span', { class: 'key', text: String(i + 1) }), String(e));
      this.eraBtns[e] = b;
      eras.append(b);
    });
    this.startBtn = h('button', { class: 'start', onclick: () => act.start() }, T.ui.start, h('span', { class: 'arrow', text: '→' }));
    this.bottom = h('footer', { class: 'bottombar' }, this.controlsHint, eras, this.startBtn);
    root.append(this.bottom);

    // heist HUD
    this.hud = h('div', { class: 'hud', hidden: true });
    this.heistInfo = h('aside', { class: 'panel heist-info', hidden: true });
    root.append(this.hud, this.heistInfo);

    this.legend = h('div', { class: 'compare-legend', hidden: true, html: `<i></i>original timeline <b></b>changed` });
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    this.modal = h('div', { class: 'modal', hidden: true });
    this.sweepEl = h('div', { class: 'sweep' });
    this.fpsEl = h('div', { class: 'fps', hidden: true });
    root.append(this.legend, this.sweepEl, this.toasts, this.modal, this.fpsEl);
    this.sweepEl.addEventListener('animationend', () => this.sweepEl.classList.remove('go'));

    if (matchMedia('(pointer: coarse)').matches || innerWidth < 700) {
      const n = h('div', { class: 'notice', text: T.ui.desktop });
      root.append(n);
      setTimeout(() => n.remove(), 9000);
    }
  }

  // ------------------------------------------------------------------ planning chrome
  setMode(mode: 'planning' | 'heist' | 'replay' | 'results' | 'intro'): void {
    this.modeEl.textContent = T.modes[mode];
    this.modeEl.classList.toggle('heist', mode === 'heist');
    const planning = mode === 'planning';
    this.left.hidden = !planning;
    this.right.hidden = !planning;
    this.startBtn.hidden = !planning;
    this.bottom.querySelector('.eras')!.toggleAttribute('hidden', !(planning || mode === 'replay'));
    for (const b of Object.values(this.eraBtns)) b.disabled = !planning;
    this.hud.hidden = mode !== 'heist';
    this.heistInfo.hidden = mode !== 'heist';
    this.controlsHint.querySelector('span')!.textContent = mode === 'heist' ? T.controls.heist : T.controls.planning;
    this.controlsHint.hidden = mode === 'intro' || mode === 'results';
    this.hintBtn.hidden = !planning;
    if (!planning) this.legend.hidden = true;
  }

  setObjective(contractLine: string, goal: string): void {
    this.topContract.textContent = contractLine;
    this.topGoal.textContent = goal;
  }

  setEra(e: Era): void {
    for (const [k, b] of Object.entries(this.eraBtns)) {
      b.classList.toggle('active', Number(k) === e);
      b.setAttribute('aria-pressed', String(Number(k) === e));
    }
  }

  setTimeline(entries: TimelineEntry[], cost: number, budget: number, canUndo: boolean, canReset: boolean): void {
    this.tlList.innerHTML = '';
    if (!entries.length) this.tlList.append(h('li', { class: 'tl-empty', text: T.ui.noChanges }));
    for (const e of entries) {
      const li = h('li', { class: e.fresh ? 'fresh' : '' },
        h('span', { class: 'dot', style: `background:${ERA_COLORS[e.era]}` }),
        h('span', { class: 'era', text: String(e.era) }),
        h('span', { class: 'txt', text: e.text.replace(/^\d{4} — /, '') }));
      this.tlList.append(li);
    }
    this.budgetEl.className = `budget${cost >= budget ? ' full' : ''}`;
    this.budgetEl.innerHTML = `<span class="ring"></span><span>${T.ui.changes}</span><span class="num">${cost} / ${budget}</span>`;
    this.undoBtn.disabled = !canUndo;
    this.resetBtn.disabled = !canReset;
  }

  setToggle(name: 'compare' | 'overlays' | 'underground', on: boolean): void {
    this.toggles[name].checked = on;
    if (name === 'compare') this.legend.hidden = !on;
  }

  setStartEnabled(on: boolean): void {
    this.startBtn.disabled = !on;
  }

  get selectedSite(): string | null {
    return this.cardSite;
  }

  setCard(m: CardModel | null): void {
    this.cardSite = m?.site ?? null;
    this.right.classList.toggle('has-card', !!m);
    this.right.innerHTML = '';
    if (!m) {
      this.right.append(h('h2', { text: 'CASE NOTES' }), h('div', { class: 'placeholder', text: T.ui.selectHint }),
        h('div', { class: 'quote', html: `${LEAF}“Bigger tomorrows<br/>often start small.”` }));
      return;
    }
    this.right.append(h('h2', { text: m.title }), h('div', { class: 'era-line', html: `<span class="swatch" style="background:${ERA_COLORS[m.era]}"></span>${m.era}` }),
      h('p', { class: 'desc', text: m.description }));
    if (m.status.length) {
      this.right.append(h('h3', { text: T.ui.status }), h('ul', { class: 'status' }, ...m.status.map((s) => h('li', { text: s }))));
    }
    this.right.append(h('h3', { text: T.ui.whatCanChange }));
    if (m.intervention) {
      const iv = m.intervention;
      this.right.append(h('div', { class: 'question', text: iv.question }));
      if (iv.blocked) this.right.append(h('div', { class: 'blocked', text: iv.blocked }));
      for (const o of iv.options) {
        const tag = o.chosen ? T.ui.current : o.original ? T.ui.original : o.cost ? `${T.ui.cost} ${o.cost}` : T.ui.free;
        const b = h('button', { class: `opt${o.chosen ? ' chosen' : ''}`, disabled: o.disabled, 'aria-pressed': String(o.chosen), onclick: () => this.act.choose(iv.id, o.id) },
          h('span', { class: 'tag', text: tag }), o.label, o.note ? h('span', { class: 'note', text: o.note }) : null);
        this.right.append(b);
      }
    } else {
      this.right.append(h('div', { class: 'empty', text: m.elsewhere ?? T.ui.nothingToChange }));
    }
    this.right.append(h('h3', { text: T.ui.consequences }));
    if (m.consequences.length) this.right.append(h('ul', { class: 'cons' }, ...m.consequences.map((c) => h('li', { text: c }))));
    else this.right.append(h('div', { class: 'empty', text: T.ui.noConsequences }));
    if (m.hint) this.right.append(h('div', { class: 'card-hint', text: m.hint }));
    this.right.append(h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn', onclick: () => this.act.closeCard() }, T.ui.close)));
  }

  // ------------------------------------------------------------------ heist HUD
  setHud(m: { meter: number; time: number; objective: string; carrying: boolean; lines: string[]; practice: boolean }): void {
    if (!this.hud.firstChild) {
      this.hud.innerHTML = `<div class="box"><div class="lbl">${T.heist.detection}</div><div class="meter"><div class="fill"></div></div></div>
        <div class="box"><div class="lbl">${T.heist.time}</div><div class="val time">0:00</div></div>`;
    }
    const fill = this.hud.querySelector('.fill') as HTMLDivElement;
    fill.style.width = `${Math.round(m.meter * 100)}%`;
    (this.hud.querySelector('.meter') as HTMLDivElement).classList.toggle('hot', m.meter > 0.45);
    const mm = Math.floor(m.time / 60);
    const ss = Math.floor(m.time % 60);
    (this.hud.querySelector('.time') as HTMLDivElement).textContent = `${mm}:${String(ss).padStart(2, '0')}`;
    this.heistInfo.innerHTML = '';
    this.heistInfo.append(h('h2', { text: T.ui.objective.toUpperCase() }), h('div', { class: `line${m.carrying ? ' carry' : ''}`, text: m.objective }));
    for (const l of m.lines) this.heistInfo.append(h('div', { class: 'line', html: l }));
    if (m.practice) this.heistInfo.append(h('div', { class: 'line', style: 'color:var(--danger)', text: T.heist.practice }));
  }

  // ------------------------------------------------------------------ feedback
  toast(text: string, kind: '' | 'amber' | 'danger' | 'green' = '', ms = 3600): void {
    const el = h('div', { class: `toast ${kind}`, text });
    this.toasts.prepend(el);
    while (this.toasts.children.length > 4) this.toasts.lastElementChild!.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, ms);
  }

  sweep(): void {
    this.sweepEl.classList.remove('go');
    void this.sweepEl.offsetWidth;
    this.sweepEl.classList.add('go');
  }

  caption(text: string | null, small?: string): void {
    this.captionEl?.remove();
    this.captionEl = null;
    if (!text) return;
    this.captionEl = h('div', { class: 'caption' }, text, small ? h('small', { text: small }) : null);
    this.root.append(this.captionEl);
  }

  setFps(text: string | null): void {
    this.fpsEl.hidden = text === null;
    if (text !== null) this.fpsEl.textContent = text;
  }

  // ------------------------------------------------------------------ dialogs
  dialog(content: HTMLElement[], opts: { stamp?: { text: string; cls: string }; onClose?: () => void } = {}): HTMLElement {
    this.modal.innerHTML = '';
    const d = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' });
    if (opts.stamp) d.append(h('div', { class: `stamp ${opts.stamp.cls}`, text: opts.stamp.text }));
    for (const c of content) d.append(c);
    this.modal.append(d);
    this.modal.hidden = false;
    this.modal.onclick = (e) => {
      if (e.target === this.modal && opts.onClose) {
        opts.onClose();
      }
    };
    const first = d.querySelector('button');
    (first as HTMLButtonElement | null)?.focus();
    return d;
  }

  closeDialog(): void {
    this.modal.hidden = true;
    this.modal.innerHTML = '';
  }

  get dialogOpen(): boolean {
    return !this.modal.hidden;
  }

  // ------------------------------------------------------------------ loading
  loading(progress: number, label: string): void {
    if (!this.loadingEl) {
      this.loadingEl = h('div', { class: 'loading' }, h('div', { class: 'file' }, h('h1', { text: T.title }), h('div', { class: 'sub', text: T.subtitle }),
        h('div', { class: 'bar' }, h('i')), h('div', { class: 'detail' })));
      this.root.append(this.loadingEl);
    }
    (this.loadingEl.querySelector('.bar i') as HTMLElement).style.width = `${Math.round(progress * 100)}%`;
    (this.loadingEl.querySelector('.detail') as HTMLElement).textContent = label ? fmt(T.loading.detail, { label }) : T.loading.title;
  }

  loadingError(message: string): void {
    this.loading(0, '');
    const f = this.loadingEl!.querySelector('.file')!;
    f.append(h('div', { class: 'error', text: message }), h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn', onclick: () => location.reload() }, T.errors.reload)));
  }

  hideLoading(): void {
    this.loadingEl?.remove();
    this.loadingEl = null;
  }
}

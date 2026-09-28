/**
 * Procedural sound (Web Audio API, no samples).  Nothing plays until init() is called from a user
 * gesture.  Ambience: wind + era details (1946 hammering and birds, 1986 traffic and a bicycle
 * bell, 2026 electric hum and birds); heist: a tense pulse whose drone brightens with detection.
 */
export type Ambience = 1946 | 1986 | 2026 | 'heist' | null;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private wind: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private layers = new Map<string, GainNode>();
  private ambience: Ambience = null;
  private nextEvent = 0;
  private heistBeat = 0;
  private drone: { a: OscillatorNode; b: OscillatorNode; filter: BiquadFilterNode; gain: GainNode; whine: OscillatorNode; whineGain: GainNode } | null = null;
  private volume = 0.7;
  private muted = false;
  tension = 0;

  get ready(): boolean {
    return !!this.ctx;
  }

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.ambBus.gain.value = 0.55;
    this.musicBus.gain.value = 0.5;
    for (const b of [this.sfxBus, this.ambBus, this.musicBus]) b.connect(this.master);
    this.applyVolume();
    // shared noise buffer (2 s, brown-ish)
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.035 * w) / 1.035;
      d[i] = w * 0.55 + last * 3.2;
    }
    this.startWind();
    if (this.ambience !== null) this.setAmbience(this.ambience, true);
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.8, this.ctx.currentTime, 0.05);
  }

  // ------------------------------------------------------------------ ambience
  private startWind(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    src.connect(filter).connect(gain).connect(this.ambBus);
    src.start();
    this.wind = { src, gain, filter };
  }

  private layer(name: string, build: (out: GainNode) => void): GainNode {
    let g = this.layers.get(name);
    if (!g) {
      g = this.ctx!.createGain();
      g.gain.value = 0;
      g.connect(this.ambBus);
      build(g);
      this.layers.set(name, g);
    }
    return g;
  }

  setAmbience(a: Ambience, force = false): void {
    if (a === this.ambience && !force) return;
    this.ambience = a;
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const want: Record<string, number> = { traffic: 0, hum: 0 };
    if (a === 1986) want.traffic = 0.05;
    if (a === 2026) want.hum = 0.018;
    if (a === 'heist') want.hum = 0.012;
    this.layer('traffic', (out) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 220;
      bp.Q.value = 0.8;
      src.connect(bp).connect(out);
      src.start();
    });
    this.layer('hum', (out) => {
      for (const f of [110, 220, 330]) {
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = f === 110 ? 1 : 0.3;
        o.connect(g).connect(out);
        o.start();
      }
    });
    for (const [name, v] of Object.entries(want)) this.layers.get(name)?.gain.setTargetAtTime(v, t, 0.6);
    this.wind?.gain.gain.setTargetAtTime(a === 'heist' ? 0.03 : 0.05, t, 0.8);
    this.setHeistMusic(a === 'heist');
  }

  private setHeistMusic(on: boolean): void {
    const ctx = this.ctx!;
    if (on && !this.drone) {
      const a = ctx.createOscillator();
      const b = ctx.createOscillator();
      a.type = 'sawtooth';
      b.type = 'sawtooth';
      a.frequency.value = 55;
      b.frequency.value = 55.6;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 180;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      a.connect(filter);
      b.connect(filter);
      filter.connect(gain).connect(this.musicBus);
      const whine = ctx.createOscillator();
      whine.type = 'sine';
      whine.frequency.value = 880;
      const whineGain = ctx.createGain();
      whineGain.gain.value = 0;
      whine.connect(whineGain).connect(this.musicBus);
      a.start();
      b.start();
      whine.start();
      gain.gain.setTargetAtTime(0.05, ctx.currentTime, 0.8);
      this.drone = { a, b, filter, gain, whine, whineGain };
      this.heistBeat = ctx.currentTime + 0.2;
    } else if (!on && this.drone) {
      const d = this.drone;
      d.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      d.whineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      setTimeout(() => {
        d.a.stop();
        d.b.stop();
        d.whine.stop();
      }, 1500);
      this.drone = null;
    }
  }

  /** schedule ambient events and the heist pulse; call every frame */
  update(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (this.wind) this.wind.filter.frequency.setTargetAtTime(380 + 120 * Math.sin(t * 0.21), t, 0.5);
    if (this.drone) {
      this.drone.filter.frequency.setTargetAtTime(180 + this.tension * 900, t, 0.2);
      this.drone.whineGain.gain.setTargetAtTime(this.tension > 0.05 ? 0.015 + this.tension * 0.03 : 0, t, 0.1);
      this.drone.whine.frequency.setTargetAtTime(700 + this.tension * 500, t, 0.1);
      while (this.heistBeat < t + 0.1) {
        const bpm = 84 + this.tension * 40;
        this.kick(this.heistBeat);
        this.hat(this.heistBeat + 30 / bpm);
        this.heistBeat += 60 / bpm;
      }
    }
    if (t < this.nextEvent || this.ambience === null) return;
    const a = this.ambience;
    const r = Math.random();
    if (a === 1946) {
      if (r < 0.5) this.hammer(t);
      else if (r < 0.8) this.bird(t);
      else this.clop(t);
      this.nextEvent = t + 1.2 + Math.random() * 2.5;
    } else if (a === 1986) {
      if (r < 0.3) this.bell(t);
      else if (r < 0.6) this.bird(t);
      this.nextEvent = t + 2.5 + Math.random() * 4;
    } else if (a === 2026) {
      if (r < 0.55) this.bird(t);
      else this.tram(t);
      this.nextEvent = t + 2 + Math.random() * 4;
    } else {
      this.nextEvent = t + 3;
    }
  }

  // ------------------------------------------------------------------ building blocks
  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(freq: number, t: number, dur: number, peak: number, type: OscillatorType = 'sine', bus?: GainNode, slideTo?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, 0.005, dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(t: number, dur: number, peak: number, type: BiquadFilterType, freq: number, q = 1, bus?: GainNode, sweepTo?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, peak, 0.004, dur);
    src.connect(f).connect(g).connect(bus ?? this.sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private hammer(t: number): void {
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.burst(t + i * 0.32, 0.08, 0.05, 'bandpass', 900 + Math.random() * 300, 6, this.ambBus);
  }

  private clop(t: number): void {
    for (let i = 0; i < 4; i++) this.burst(t + i * 0.22 + (i % 2) * 0.05, 0.06, 0.05, 'bandpass', 500, 3, this.ambBus);
  }

  private bird(t: number): void {
    const n = 2 + Math.floor(Math.random() * 3);
    const base = 2600 + Math.random() * 1400;
    for (let i = 0; i < n; i++) this.tone(base, t + i * 0.13, 0.09, 0.02, 'sine', this.ambBus, base * 1.25);
  }

  private bell(t: number): void {
    this.tone(2240, t, 0.9, 0.025, 'sine', this.ambBus);
    this.tone(2960, t, 0.7, 0.015, 'sine', this.ambBus);
    this.tone(2240, t + 0.18, 0.9, 0.02, 'sine', this.ambBus);
  }

  private tram(t: number): void {
    this.burst(t, 2.2, 0.03, 'bandpass', 300, 2, this.ambBus, 900);
  }

  private kick(t: number): void {
    if (!this.ctx) return;
    this.tone(90, t, 0.22, 0.12, 'sine', this.musicBus, 42);
  }

  private hat(t: number): void {
    this.burst(t, 0.04, 0.025 + this.tension * 0.02, 'highpass', 6000, 0.7, this.musicBus);
  }

  // ------------------------------------------------------------------ sfx
  private now(): number | null {
    if (!this.ctx) return null;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx.currentTime;
  }

  click(): void {
    const t = this.now();
    if (t === null) return;
    this.burst(t, 0.03, 0.08, 'bandpass', 2400, 4);
  }

  paper(): void {
    const t = this.now();
    if (t === null) return;
    this.burst(t, 0.16, 0.12, 'bandpass', 1500 + Math.random() * 2000, 1.2);
    this.burst(t + 0.05, 0.12, 0.08, 'highpass', 3000, 0.8);
  }

  timeMechanism(): void {
    const t = this.now();
    if (t === null) return;
    for (let i = 0; i < 5; i++) this.burst(t + i * 0.055, 0.025, 0.1, 'bandpass', 2000 + i * 180, 8);
    this.tone(120, t + 0.3, 0.25, 0.1, 'triangle', undefined, 70);
    this.burst(t + 0.1, 0.55, 0.05, 'bandpass', 300, 1.5, undefined, 2200);
  }

  chime(): void {
    const t = this.now();
    if (t === null) return;
    this.tone(660, t, 1.2, 0.07);
    this.tone(990, t + 0.09, 1.1, 0.05);
    this.tone(1320, t + 0.18, 0.9, 0.025);
  }

  undo(): void {
    const t = this.now();
    if (t === null) return;
    this.tone(880, t, 0.25, 0.05, 'sine', undefined, 520);
    this.paper();
  }

  error(): void {
    const t = this.now();
    if (t === null) return;
    this.tone(130, t, 0.18, 0.06, 'sawtooth');
  }

  step(): void {
    const t = this.now();
    if (t === null) return;
    this.burst(t, 0.03, 0.02, 'bandpass', 900 + Math.random() * 300, 3);
  }

  climb(): void {
    const t = this.now();
    if (t === null) return;
    for (let i = 0; i < 3; i++) this.burst(t + i * 0.2, 0.08, 0.05, 'bandpass', 700, 2);
  }

  door(): void {
    const t = this.now();
    if (t === null) return;
    this.tone(220, t, 0.25, 0.05, 'triangle', undefined, 160);
    this.burst(t, 0.2, 0.04, 'lowpass', 600, 1);
  }

  pickup(): void {
    const t = this.now();
    if (t === null) return;
    [880, 1175, 1568, 2349].forEach((f, i) => this.tone(f, t + i * 0.07, 0.5, 0.05));
  }

  powerCut(): void {
    const t = this.now();
    if (t === null) return;
    this.burst(t, 0.35, 0.2, 'lowpass', 400, 1);
    this.tone(120, t, 1.2, 0.08, 'sawtooth', undefined, 30);
  }

  spotted(): void {
    const t = this.now();
    if (t === null) return;
    this.tone(420, t, 0.28, 0.08, 'triangle', undefined, 720);
  }

  caught(): void {
    const t = this.now();
    if (t === null) return;
    for (let i = 0; i < 6; i++) this.tone(i % 2 ? 660 : 880, t + i * 0.14, 0.13, 0.07, 'square');
    this.tone(60, t, 1.2, 0.15, 'sine', undefined, 30);
  }

  success(): void {
    const t = this.now();
    if (t === null) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.12, 1.2, 0.06));
    [523, 659, 784].forEach((f) => this.tone(f, t + 0.55, 2.0, 0.035, 'triangle'));
  }

  hint(): void {
    const t = this.now();
    if (t === null) return;
    this.tone(1046, t, 0.4, 0.04);
    this.tone(1318, t + 0.1, 0.4, 0.03);
  }
}

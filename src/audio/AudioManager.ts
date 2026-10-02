import type { StepSound } from '../world/BlockRegistry';

// Fully synthesised audio (no sample files): noise bursts and simple oscillators.

export type SoundName = 'break' | 'place' | 'step' | 'jump' | 'land' | 'click' | 'hurt' | 'pickup' | 'splash' | 'eat' | 'death' | 'attack' | 'mobhurt' | 'groan';

interface MaterialVoice { type: BiquadFilterType; freq: number; q: number; dur: number; tone?: number }

const MATERIALS: Record<StepSound, MaterialVoice> = {
  grass: { type: 'bandpass', freq: 900, q: 0.7, dur: 0.1 },
  stone: { type: 'lowpass', freq: 2200, q: 0.5, dur: 0.09, tone: 140 },
  sand: { type: 'highpass', freq: 2600, q: 0.4, dur: 0.12 },
  wood: { type: 'bandpass', freq: 420, q: 1.6, dur: 0.1, tone: 190 },
  snow: { type: 'lowpass', freq: 1300, q: 0.4, dur: 0.12 },
  gravel: { type: 'bandpass', freq: 1700, q: 0.6, dur: 0.13 },
  glass: { type: 'highpass', freq: 3500, q: 1, dur: 0.1, tone: 2600 },
  water: { type: 'bandpass', freq: 650, q: 0.9, dur: 0.22 },
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private ambient!: GainNode;
  private lowpass!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private volumes = { master: 0.8, music: 0.35, sfx: 0.8 };
  private nextBird = 3;
  private nextCricket = 2;
  private nextDrip = 4;
  private nextMusic = 20;
  private underwater = false;
  enabled = true;

  /** Must be called from a user gesture (click / key) the first time. */
  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private init() {
    try {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) { this.enabled = false; return; }
      const ctx = (this.ctx = new Ctor());
      this.lowpass = ctx.createBiquadFilter();
      this.lowpass.type = 'lowpass';
      this.lowpass.frequency.value = 22000;
      this.master = ctx.createGain();
      this.sfx = ctx.createGain();
      this.music = ctx.createGain();
      this.ambient = ctx.createGain();
      this.sfx.connect(this.lowpass); this.music.connect(this.lowpass); this.ambient.connect(this.lowpass);
      this.lowpass.connect(this.master);
      this.master.connect(ctx.destination);
      // 2 seconds of white noise reused by every noise-based sound.
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      this.startWind();
    } catch (e) {
      console.warn('[Audio] could not start audio', e);
      this.enabled = false;
    }
  }

  setVolumes(master: number, music: number, sfx: number) {
    this.volumes = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfx.gain.value = this.volumes.sfx;
    this.music.gain.value = this.volumes.music;
    this.ambient.gain.value = this.volumes.sfx * 0.6;
  }

  setUnderwater(u: boolean) {
    if (!this.ctx || u === this.underwater) return;
    this.underwater = u;
    this.lowpass.frequency.setTargetAtTime(u ? 600 : 22000, this.ctx.currentTime, 0.05);
  }

  private burst(m: MaterialVoice, gain: number, pitch = 1, bus: GainNode = this.sfx) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = m.type; f.frequency.value = m.freq * pitch; f.Q.value = m.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + m.dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t, Math.random() * 1.5, m.dur + 0.05);
    if (m.tone) this.tone(m.tone * pitch, m.tone * 0.5 * pitch, m.dur, gain * 0.8, 'sine', bus);
  }

  private tone(f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'sine', bus: GainNode = this.sfx, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  play(name: SoundName, material: StepSound = 'stone', volume = 1) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    const m = MATERIALS[material];
    switch (name) {
      case 'break': this.burst({ ...m, dur: m.dur * 1.6 }, 0.55 * volume, 0.9); break;
      case 'place': this.burst(m, 0.4 * volume, 1.15); break;
      case 'step': this.burst({ ...m, dur: m.dur * 0.8 }, 0.16 * volume, 0.85 + Math.random() * 0.3); break;
      case 'jump': this.burst(MATERIALS.grass, 0.12 * volume, 1.4); break;
      case 'land': this.burst({ ...m, dur: 0.14 }, 0.4 * volume, 0.6); break;
      case 'click': this.tone(900, 700, 0.05, 0.12 * volume, 'square'); break;
      case 'hurt': this.tone(260, 90, 0.25, 0.4 * volume, 'sawtooth'); break;
      case 'pickup': this.tone(500, 1100, 0.09, 0.2 * volume, 'sine'); break;
      case 'splash': this.burst(MATERIALS.water, 0.5 * volume, 1); break;
      case 'eat': for (let i = 0; i < 3; i++) this.tone(180 + i * 20, 120, 0.06, 0.2 * volume, 'square', this.sfx, i * 0.1); break;
      case 'death': this.tone(300, 40, 0.8, 0.45 * volume, 'sawtooth'); break;
      case 'attack': this.burst(MATERIALS.wood, 0.4 * volume, 1.6); break;
      case 'mobhurt': this.tone(420, 220, 0.14, 0.3 * volume, 'triangle'); break;
      case 'groan': this.tone(110, 70, 0.5, 0.25 * volume, 'sawtooth'); break;
    }
  }

  private startWind() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain); lfoGain.connect(f.frequency);
    src.connect(f); f.connect(this.windGain); this.windGain.connect(this.ambient);
    src.start(); lfo.start();
  }

  /** Ambient layers: wind (louder when high up), birds by day, crickets at night, drips underground. */
  updateAmbient(dt: number, daylight: number, underground: boolean, height: number, inGame: boolean) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const windTarget = inGame && !underground ? 0.025 + Math.max(0, height - 70) * 0.0018 : 0;
    this.windGain.gain.setTargetAtTime(windTarget, t, 0.8);
    if (!inGame) return;
    this.nextBird -= dt; this.nextCricket -= dt; this.nextDrip -= dt; this.nextMusic -= dt;
    if (!underground && daylight > 0.55 && this.nextBird <= 0) {
      this.nextBird = 4 + Math.random() * 9;
      const base = 2200 + Math.random() * 1200;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone(base, base * 1.35, 0.07, 0.05, 'sine', this.ambient, i * 0.11);
    }
    if (!underground && daylight < 0.25 && this.nextCricket <= 0) {
      this.nextCricket = 1.4 + Math.random() * 2.5;
      for (let i = 0; i < 4; i++) this.tone(4300, 4300, 0.03, 0.025, 'square', this.ambient, i * 0.06);
    }
    if (underground && this.nextDrip <= 0) {
      this.nextDrip = 3 + Math.random() * 7;
      this.tone(1500, 600, 0.12, 0.08, 'sine', this.ambient);
    }
    if (this.nextMusic <= 0 && this.volumes.music > 0) {
      this.nextMusic = 45 + Math.random() * 60;
      this.playPhrase();
    }
  }

  /** Slow generative pentatonic phrase with a soft pad - quiet background music. */
  private playPhrase() {
    const ctx = this.ctx!;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const root = [196, 220, 174.6, 233][Math.floor(Math.random() * 4)];
    let t = ctx.currentTime + 0.2;
    const notes = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i++) {
      const f = root * Math.pow(2, scale[Math.floor(Math.random() * scale.length)] / 12);
      const dur = 1.6 + Math.random() * 1.2;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.5);
      o.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + dur + 1.6);
      t += 1.1 + Math.random() * 1.4;
    }
  }
}

// Звуковые эффекты боя, синтезируемые на лету (без файлов).
import { getSfxVolume } from '../ui/dom';

type Kind = 'hit' | 'crit' | 'block' | 'whoosh' | 'death' | 'bow' | 'charge' | 'horn' | 'stakes' | 'cheer';

const MIN_GAP: Record<Kind, number> = { hit: 45, crit: 80, block: 70, whoosh: 90, death: 120, bow: 70, charge: 200, horn: 800, stakes: 300, cheer: 900 };

class Sfx {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private noise!: AudioBuffer;
  private last: Partial<Record<Kind, number>> = {};

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
    } catch {
      return null;
    }
    this.out = this.ctx.createGain();
    this.out.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return this.ctx;
  }

  play(kind: Kind) {
    const vol = getSfxVolume();
    if (vol <= 0) return;
    const now = performance.now();
    if (now - (this.last[kind] ?? 0) < MIN_GAP[kind]) return;
    this.last[kind] = now;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') {
      void ctx?.resume();
      return;
    }
    this.out.gain.value = vol * 0.9;
    const t = ctx.currentTime;
    switch (kind) {
      case 'hit':
        this.noiseBurst(t, 0.07, 900, 'lowpass', 0.22);
        this.tone(t, 'sine', 140, 60, 0.09, 0.25);
        break;
      case 'crit':
        this.noiseBurst(t, 0.12, 1400, 'lowpass', 0.32);
        this.tone(t, 'sine', 170, 50, 0.14, 0.35);
        this.tone(t, 'triangle', 1800, 1500, 0.12, 0.05);
        break;
      case 'block':
        for (const [f, a] of [[523, 0.07], [1347, 0.05], [2213, 0.035], [3120, 0.02]] as [number, number][]) this.tone(t, 'square', f, f * 0.98, 0.22, a);
        this.noiseBurst(t, 0.04, 3000, 'highpass', 0.12);
        break;
      case 'whoosh':
        this.noiseSweep(t, 0.14, 600, 2400, 0.08);
        break;
      case 'death':
        this.noiseBurst(t, 0.22, 380, 'lowpass', 0.18);
        this.tone(t, 'sawtooth', 190, 90, 0.25, 0.04);
        break;
      case 'bow':
        this.tone(t, 'triangle', 210, 160, 0.09, 0.07);
        this.noiseSweep(t + 0.02, 0.18, 2600, 900, 0.035);
        break;
      case 'charge':
        for (let i = 0; i < 4; i++) {
          this.noiseBurst(t + i * 0.09, 0.05, 300, 'lowpass', 0.25);
          this.tone(t + i * 0.09, 'sine', 90, 50, 0.07, 0.2);
        }
        break;
      case 'horn':
        this.horn(t);
        break;
      case 'cheer':
        // Трибуны ревут: несколько полос шума с нарастанием и «голоса» — скользящие тоны
        for (const [f, a] of [[700, 0.09], [1200, 0.07], [2000, 0.04]] as [number, number][]) this.swell(t, 1.4, f, a);
        for (let i = 0; i < 6; i++) {
          const f0 = 300 + Math.random() * 250;
          this.tone(t + Math.random() * 0.4, 'triangle', f0, f0 * (1.3 + Math.random() * 0.4), 0.5 + Math.random() * 0.4, 0.012);
        }
        break;
      case 'stakes':
        for (let i = 0; i < 3; i++) this.tone(t + i * 0.08, 'triangle', 320, 180, 0.06, 0.12);
        break;
    }
  }

  private swell(t: number, dur: number, freq: number, amp: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private crowd: { src: AudioBufferSourceNode; g: GainNode } | null = null;

  /** Гул трибун на ристалище (петля, пока не остановят). */
  crowdStart() {
    const vol = getSfxVolume();
    const ctx = this.ensure();
    if (!ctx || vol <= 0 || this.crowd) return;
    void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.9;
    f.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 1.5);
    // Медленное «дыхание» толпы
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 0.23;
    lg.gain.value = 0.018;
    lfo.connect(lg);
    lg.connect(g.gain);
    lfo.start();
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    this.out.gain.value = vol * 0.9;
    src.start();
    this.crowd = { src, g };
    src.onended = () => lfo.stop();
  }

  crowdStop() {
    if (!this.crowd || !this.ctx) return;
    const { src, g } = this.crowd;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.8);
    src.stop(t + 0.9);
    this.crowd = null;
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, amp: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBurst(t: number, dur: number, freq: number, type: BiquadFilterType, amp: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private noiseSweep(t: number, dur: number, f0: number, f1: number, amp: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(amp, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private horn(t: number) {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(1600, t + 0.3);
    lp.frequency.linearRampToValueAtTime(700, t + 1.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.15);
    g.gain.setValueAtTime(0.12, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    lp.connect(g);
    g.connect(this.out);
    for (const f of [146.8, 220, 293.6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.97, t);
      o.frequency.linearRampToValueAtTime(f, t + 0.12);
      o.connect(lp);
      o.start(t);
      o.stop(t + 1.6);
    }
  }
}

export const sfx = new Sfx();

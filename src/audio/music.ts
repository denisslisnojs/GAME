// Процедурная средневековая музыка на WebAudio.
// «Спокойная» тема для меню и карты: лютня (Карплус-Стронг), флейта с вибрато, тихий бурдон.
// Мелодия сочиняется на лету в ре-дорийском ладу, размер 3/4.
// «Боевая» тема: барабаны, остинато баса и «медь» в ре миноре, размер 4/4.

type Mode = 'off' | 'calm' | 'battle';

interface NoteEv {
  beat: number;
  inst: 'lute' | 'flute' | 'bass' | 'tom' | 'snare' | 'horn' | 'bassSaw';
  midi: number;
  dur: number;
  vel: number;
}

const BEATS_PER_BAR = 3;
const DORIAN = [0, 2, 3, 5, 7, 9, 10]; // от ре
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
/** Лады культур: спокойный и боевой. Семь ступеней, внутри октавы. */
const CULTURE_SCALES: Record<string, [number[], number[]]> = {
  aurelia: [DORIAN, AEOLIAN],
  // Север: натуральный минор и суровый фригийский
  nordmark: [AEOLIAN, [0, 1, 3, 5, 7, 8, 10]],
  // Степь: минорная пентатоника (ступени повторяются)
  horde: [[0, 3, 3, 5, 7, 10, 10], [0, 3, 5, 5, 7, 10, 10]],
  // Восток: хиджаз (фригийский доминантовый)
  sultanate: [[0, 1, 4, 5, 7, 8, 10], [0, 1, 4, 5, 7, 8, 11]],
};
let CALM_SCALE = DORIAN;
let WAR_SCALE = AEOLIAN;
/** Боевые последовательности аккордов (ступени натурального минора): Dm Bb C Dm и т.п. */
const BATTLE_PROGS = [
  [0, 5, 6, 0],
  [0, 3, 4, 0],
  [0, 5, 3, 4],
];
const ROOT = 50; // D3

/** Аккорды как ступени лада (0 — Dm, 6 — C, 4 — Am, 2 — F, 3 — G). */
const PROGRESSIONS = [
  [0, 6, 0, 4],
  [0, 2, 6, 0],
  [0, 3, 6, 4],
  [2, 6, 0, 0],
];

function degreeToMidi(deg: number, base = ROOT): number {
  const oct = Math.floor(deg / 7);
  const d = ((deg % 7) + 7) % 7;
  return base + oct * 12 + CALM_SCALE[d];
}

function aeolian(deg: number, base: number): number {
  const oct = Math.floor(deg / 7);
  const d = ((deg % 7) + 7) % 7;
  return base + oct * 12 + WAR_SCALE[d];
}

function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

class MusicEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbGain!: GainNode;
  private drone: { oscs: OscillatorNode[]; gain: GainNode } | null = null;
  private lutes = new Map<number, AudioBuffer>();
  private mode: Mode = 'off';
  private volume = 0.55;
  private timer: number | null = null;
  private events: NoteEv[] = [];
  private evIdx = 0;
  private pieceStart = 0;
  private bpm = 88;

  /** Вызывать из обработчика жеста пользователя (иначе браузер не даст играть). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.master);
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.8, 2.2);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.35;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.musicBus);
    if (this.mode !== 'off') this.start(this.mode);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  getVolume() {
    return this.volume;
  }

  /** Музыка звучит в ладу культуры тех мест, где сейчас отряд. */
  setCulture(c: string) {
    const s = CULTURE_SCALES[c];
    if (!s) return;
    CALM_SCALE = s[0];
    WAR_SCALE = s[1];
  }

  play(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (!this.ctx) return;
    this.stop();
    if (mode !== 'off') this.start(mode);
  }

  private start(mode: Mode) {
    const ctx = this.ctx!;
    this.musicBus.gain.cancelScheduledValues(ctx.currentTime);
    this.musicBus.gain.setValueAtTime(0, ctx.currentTime);
    this.musicBus.gain.linearRampToValueAtTime(1, ctx.currentTime + (mode === 'battle' ? 0.8 : 2.5));
    if (mode === 'battle') {
      this.newBattlePiece(ctx.currentTime + 0.2);
    } else {
      this.startDrone();
      this.newPiece(ctx.currentTime + 0.3);
    }
    this.timer = window.setInterval(() => this.schedule(), 120);
  }

  private stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(0, t + 1);
    if (this.drone) {
      const d = this.drone;
      d.gain.gain.setTargetAtTime(0, t, 0.3);
      setTimeout(() => d.oscs.forEach((o) => o.stop()), 1500);
      this.drone = null;
    }
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private startDrone() {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.018, ctx.currentTime, 2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.connect(gain);
    gain.connect(this.musicBus);
    gain.connect(this.reverb);
    const oscs = [ROOT - 12, ROOT - 5].map((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = i ? 4 : -3;
      o.connect(lp);
      o.start();
      return o;
    });
    this.drone = { oscs, gain };
  }

  // ───────────── сочинение ─────────────

  private newPiece(startTime: number) {
    const ev: NoteEv[] = [];
    const prog = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)];
    this.bpm = 80 + Math.floor(Math.random() * 16);
    const phraseA = this.makePhrase(prog);
    const phraseB = this.makePhrase(prog.map((c) => (c === 0 ? 3 : c)));
    // Форма: вступление лютни, A, A', B, A, кода
    const sections: { melody: NoteEv[] | null; chords: number[] }[] = [
      { melody: null, chords: prog },
      { melody: phraseA, chords: prog },
      { melody: this.vary(phraseA), chords: prog },
      { melody: phraseB, chords: prog.map((c) => (c === 0 ? 3 : c)) },
      { melody: phraseA, chords: prog },
      { melody: null, chords: [0, 0] },
    ];
    let bar = 0;
    for (const sec of sections) {
      for (let i = 0; i < sec.chords.length; i++) {
        this.luteBar(ev, (bar + i) * BEATS_PER_BAR, sec.chords[i], i === sec.chords.length - 1 && !sec.melody);
      }
      if (sec.melody) for (const n of sec.melody) ev.push({ ...n, beat: n.beat + bar * BEATS_PER_BAR });
      bar += sec.chords.length;
    }
    // Пауза в конце пьесы
    this.events = ev.sort((a, b) => a.beat - b.beat);
    this.evIdx = 0;
    this.pieceStart = startTime;
    this.pieceBeats = (bar + 2) * BEATS_PER_BAR;
  }

  private pieceBeats = 0;

  private luteBar(ev: NoteEv[], beat: number, chordDeg: number, final: boolean) {
    const root = degreeToMidi(chordDeg, ROOT);
    const third = degreeToMidi(chordDeg + 2, ROOT);
    const fifth = degreeToMidi(chordDeg + 4, ROOT);
    ev.push({ beat, inst: 'bass', midi: root - 12, dur: 3, vel: 0.5 });
    if (final) {
      [root, fifth, root + 12, third + 12].forEach((m, i) => ev.push({ beat: beat + i * 0.08, inst: 'lute', midi: m, dur: 3, vel: 0.5 }));
      return;
    }
    const patterns = [
      [root, fifth, root + 12, third + 12, fifth, root + 12],
      [root, third + 12, fifth, root + 12, fifth, third + 12],
      [root, fifth, third + 12, fifth, root + 12, fifth],
    ];
    const pat = patterns[Math.floor(Math.random() * patterns.length)];
    pat.forEach((m, i) => ev.push({ beat: beat + i * 0.5, inst: 'lute', midi: m, dur: 1, vel: i === 0 ? 0.55 : 0.38 }));
  }

  /** Мелодия на 4 такта: опорные тона аккорда на сильных долях, между ними — ходы по ладу. */
  private makePhrase(chords: number[]): NoteEv[] {
    const out: NoteEv[] = [];
    const rhythms = [
      [2, 1],
      [1, 1, 1],
      [1.5, 0.5, 1],
      [1, 0.5, 0.5, 1],
      [3],
      [0.5, 0.5, 1, 1],
    ];
    let deg = 7 + [0, 2, 4][Math.floor(Math.random() * 3)]; // от ре-4 и выше
    for (let bar = 0; bar < chords.length; bar++) {
      const r = bar === chords.length - 1 ? [2, 1] : rhythms[Math.floor(Math.random() * rhythms.length)];
      let t = bar * BEATS_PER_BAR;
      r.forEach((dur, i) => {
        if (i === 0) {
          // сильная доля — тон аккорда рядом с текущей высотой
          const chordTones = [0, 2, 4].map((k) => chords[bar] + k);
          let best = deg;
          let bestD = 99;
          for (const ct of chordTones) {
            for (const o of [0, 7, 14]) {
              const cand = ct + o;
              const d = Math.abs(cand - deg);
              if (d < bestD && cand >= 5 && cand <= 13) {
                bestD = d;
                best = cand;
              }
            }
          }
          deg = best;
        } else {
          const step = [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)];
          deg = Math.max(4, Math.min(14, deg + step));
        }
        if (bar === chords.length - 1 && i === r.length - 1) deg = chords[bar] + 7; // разрешение в тонику аккорда
        out.push({ beat: t, inst: 'flute', midi: degreeToMidi(deg, ROOT + 12), dur: dur * 0.95, vel: 0.5 });
        t += dur;
      });
    }
    return out;
  }

  private vary(phrase: NoteEv[]): NoteEv[] {
    return phrase.map((n, i) => {
      if (i > 0 && i < phrase.length - 1 && Math.random() < 0.3) {
        return { ...n, midi: n.midi + (Math.random() < 0.5 ? 2 : -1) };
      }
      return { ...n };
    });
  }

  // ───────────── проигрывание ─────────────

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || this.mode === 'off') return;
    const spb = 60 / this.bpm;
    const horizon = ctx.currentTime + 0.6;
    while (this.evIdx < this.events.length) {
      const e = this.events[this.evIdx];
      const t = this.pieceStart + e.beat * spb;
      if (t > horizon) break;
      if (t >= ctx.currentTime - 0.05) this.playNote(e, Math.max(t, ctx.currentTime), e.dur * spb);
      this.evIdx++;
    }
    if (this.evIdx >= this.events.length) {
      const end = this.pieceStart + this.pieceBeats * spb;
      if (end < horizon) {
        if (this.mode === 'battle') this.newBattlePiece(end);
        else this.newPiece(end);
      }
    }
  }

  private playNote(e: NoteEv, t: number, dur: number) {
    switch (e.inst) {
      case 'lute':
        return this.lute(e.midi, t, e.vel);
      case 'bass':
        return this.lute(e.midi, t, e.vel * 0.9, 1400);
      case 'flute':
        return this.flute(e.midi, t, dur, e.vel);
      case 'tom':
        return this.tom(t, e.midi, e.vel);
      case 'snare':
        return this.snare(t, e.vel);
      case 'horn':
        return this.hornNote(e.midi, t, dur, e.vel);
      case 'bassSaw':
        return this.bassSaw(e.midi, t, dur, e.vel);
    }
  }

  // ───────────── боевая тема ─────────────

  private newBattlePiece(startTime: number) {
    const ev: NoteEv[] = [];
    const B = 4;
    this.bpm = 118 + Math.floor(Math.random() * 12);
    const prog = BATTLE_PROGS[Math.floor(Math.random() * BATTLE_PROGS.length)];
    const melody = this.battlePhrase(prog);
    const melody2 = this.battlePhrase(prog);
    // Форма: 2 такта барабанов, A, A, B, A
    const plan: (NoteEv[] | null)[] = [null, melody, melody, melody2, melody];
    let bar = 0;
    for (let si = 0; si < plan.length; si++) {
      const bars = si === 0 ? 2 : prog.length;
      for (let i = 0; i < bars; i++) {
        const b0 = (bar + i) * B;
        const chord = si === 0 ? 0 : prog[i];
        const fill = i === bars - 1;
        // Барабаны: низкий «тайко» и малый
        const toms = fill ? [0, 1, 1.5, 2, 2.5, 3, 3.25, 3.5, 3.75] : [0, 0.75, 1.5, 2, 3, 3.5];
        for (const t of toms) ev.push({ beat: b0 + t, inst: 'tom', midi: t % 1 === 0 ? 0 : 1, dur: 0.3, vel: t === 0 ? 1 : 0.7 });
        for (const t of [1, 3]) ev.push({ beat: b0 + t, inst: 'snare', midi: 0, dur: 0.1, vel: 0.6 });
        if (si > 0) {
          // Бас: восьмые по тонике с октавным скачком
          const root = aeolian(chord, 38);
          for (let k = 0; k < 8; k++) ev.push({ beat: b0 + k * 0.5, inst: 'bassSaw', midi: k % 4 === 3 ? root + 12 : root, dur: 0.45, vel: k % 2 ? 0.5 : 0.7 });
        }
      }
      const mel = plan[si];
      if (mel) for (const n of mel) ev.push({ ...n, beat: n.beat + bar * B });
      bar += bars;
    }
    this.events = ev.sort((a, b) => a.beat - b.beat);
    this.evIdx = 0;
    this.pieceStart = startTime;
    this.pieceBeats = bar * B;
  }

  private battlePhrase(chords: number[]): NoteEv[] {
    const out: NoteEv[] = [];
    const rhythms = [[1.5, 0.5, 2], [1, 1, 2], [0.5, 0.5, 1, 2], [2, 1, 1], [1.5, 0.5, 1, 1]];
    let deg = 7;
    chords.forEach((c, bar) => {
      const r = bar === chords.length - 1 ? [3, 1] : rhythms[Math.floor(Math.random() * rhythms.length)];
      let t = bar * 4;
      r.forEach((dur, i) => {
        if (i === 0) {
          const tones = [c, c + 2, c + 4, c + 7, c + 9];
          deg = tones.reduce((best, x) => (Math.abs(x - deg) < Math.abs(best - deg) && x >= 4 && x <= 12 ? x : best), tones[0] + 7);
        } else {
          deg = Math.max(4, Math.min(12, deg + [-2, -1, 1, 1, 2][Math.floor(Math.random() * 5)]));
        }
        if (bar === chords.length - 1 && i === r.length - 1) deg = c + 7;
        out.push({ beat: t, inst: 'horn', midi: aeolian(deg, 50), dur: dur * 0.9, vel: 0.6 });
        t += dur;
      });
    });
    return out;
  }

  private tom(t: number, hi: number, vel: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = hi ? 110 : 70;
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    g.gain.setValueAtTime(0.5 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g);
    g.connect(this.musicBus);
    g.connect(this.reverb);
    o.start(t);
    o.stop(t + 0.5);
    // «кожа» — короткий шум
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.12 * vel, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    n.connect(lp);
    lp.connect(ng);
    ng.connect(this.musicBus);
    n.start(t);
    n.stop(t + 0.1);
  }

  private snare(t: number, vel: number) {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer();
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 1800;
    hp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    n.connect(hp);
    hp.connect(g);
    g.connect(this.musicBus);
    g.connect(this.reverb);
    n.start(t);
    n.stop(t + 0.18);
  }

  private hornNote(midi: number, t: number, dur: number, vel: number) {
    const ctx = this.ctx!;
    const f = mtof(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(f * 1.5, t);
    lp.frequency.linearRampToValueAtTime(f * 5, t + 0.12);
    lp.frequency.linearRampToValueAtTime(f * 3, t + dur);
    const g = ctx.createGain();
    const peak = 0.075 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.06);
    g.gain.setValueAtTime(peak * 0.85, t + Math.max(0.07, dur - 0.08));
    g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
    lp.connect(g);
    g.connect(this.musicBus);
    g.connect(this.reverb);
    for (const [mul, det] of [[1, -6], [1, 6], [0.5, 0]] as [number, number][]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * mul;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.15);
    }
  }

  private bassSaw(midi: number, t: number, dur: number, vel: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private luteBuffer(midi: number): AudioBuffer {
    const cached = this.lutes.get(midi);
    if (cached) return cached;
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 2.2);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / mtof(midi)));
    // Начальный «щипок»: сглаженный шум
    let prev = 0;
    for (let i = 0; i < N; i++) {
      const r = Math.random() * 2 - 1;
      prev = prev * 0.5 + r * 0.5;
      d[i] = prev;
    }
    const decay = 0.996 - Math.max(0, midi - 60) * 0.0003;
    for (let i = N; i < len; i++) d[i] = (d[i - N] + d[i - N + 1 < i ? i - N + 1 : i - N]) * 0.5 * decay;
    this.lutes.set(midi, buf);
    return buf;
  }

  private lute(midi: number, t: number, vel: number, cutoff = 3200) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.luteBuffer(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = vel * 0.55;
    src.connect(lp);
    lp.connect(g);
    g.connect(this.musicBus);
    g.connect(this.reverb);
    src.start(t);
    src.stop(t + 2.2);
  }

  private flute(midi: number, t: number, dur: number, vel: number) {
    const ctx = this.ctx!;
    const f = mtof(midi);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f * 2;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.08;
    // Вибрато, вступающее к середине ноты
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lfoG = ctx.createGain();
    lfoG.gain.setValueAtTime(0, t);
    lfoG.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.5, dur));
    lfo.connect(lfoG);
    lfoG.connect(o.frequency);
    lfoG.connect(o2.frequency);
    // Дыхание
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    bp.Q.value = 2;
    const ng = ctx.createGain();
    ng.gain.value = 0.05;
    noise.connect(bp);
    bp.connect(ng);

    const env = ctx.createGain();
    const peak = vel * 0.16;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.07);
    env.gain.setValueAtTime(peak * 0.9, t + Math.max(0.08, dur - 0.12));
    env.gain.linearRampToValueAtTime(0, t + dur + 0.12);
    o.connect(env);
    o2.connect(o2g);
    o2g.connect(env);
    ng.connect(env);
    env.connect(this.musicBus);
    env.connect(this.reverb);
    const end = t + dur + 0.2;
    for (const n of [o, o2, lfo, noise]) {
      n.start(t);
      n.stop(end);
    }
  }

  private noise: AudioBuffer | null = null;
  private noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise;
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    return b;
  }
}

export const music = new MusicEngine();

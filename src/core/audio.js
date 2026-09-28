/**
 * Процедурный звук на WebAudio — без внешних файлов.
 * Все выстрелы/шаги/взрывы синтезируются в реальном времени.
 */
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.volume = 0.7;
    this.enabled = true;
    this._lastStep = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 22;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);

    // буфер белого шума (2 сек)
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * 2, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.listener = { x: 0, y: 0, z: 0, fx: 0, fz: -1 };
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  /** Позиционная громкость/панорама относительно слушателя. */
  _spatial(dist = 0, x = 0, z = 0) {
    if (!this.listener) return { gain: 1, pan: 0 };
    const gain = 1 / (1 + dist * dist * 0.02);
    const dx = x - this.listener.x;
    const dz = z - this.listener.z;
    const len = Math.hypot(dx, dz) || 1;
    // правое направление слушателя
    const rx = -this.listener.fz, rz = this.listener.fx;
    const pan = Math.max(-1, Math.min(1, (dx * rx + dz * rz) / len));
    return { gain, pan };
  }

  updateListener(pos, forward) {
    if (this.listener) {
      this.listener.x = pos.x; this.listener.y = pos.y; this.listener.z = pos.z;
      this.listener.fx = forward.x; this.listener.fz = forward.z;
    }
  }

  _env(node, t0, a, d, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    node.connect(g);
    return g;
  }

  _noise(t0, dur, filterType, freq, q = 1, gain = 1, pan = 0) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    src.connect(f);
    const g = this._env(f, t0, 0.002, dur, gain);
    let out = g;
    if (this.ctx.createStereoPanner && pan !== 0) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    out.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.06);
  }

  _tone(t0, freq, dur, type = 'sine', gain = 0.2, endFreq = null, pan = 0) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    const g = this._env(o, t0, 0.004, dur, gain);
    let out = g;
    if (this.ctx.createStereoPanner && pan !== 0) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    out.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  /** Выстрел. cls — класс оружия: pistol/smg/rifle/sniper/shotgun */
  shot(cls = 'rifle', dist = 0, x = 0, z = 0) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.t;
    const sp = this._spatial(dist, x, z);
    const cfg = {
      pistol: { body: 220, dur: 0.1, g: 0.5, hp: 2600, crack: 0.05 },
      smg: { body: 260, dur: 0.085, g: 0.42, hp: 3200, crack: 0.05 },
      rifle: { body: 150, dur: 0.16, g: 0.62, hp: 2200, crack: 0.07 },
      sniper: { body: 100, dur: 0.34, g: 0.85, hp: 1500, crack: 0.1 },
      shotgun: { body: 120, dur: 0.26, g: 0.8, hp: 1600, crack: 0.09 },
      knife: { body: 900, dur: 0.06, g: 0.2, hp: 4000, crack: 0.02 },
    }[cls] || { body: 180, dur: 0.14, g: 0.55, hp: 2400, crack: 0.06 };

    this._noise(t0, cfg.dur, 'lowpass', cfg.body * 2.2, 0.9, cfg.g * sp.gain * 1.5, sp.pan);
    this._noise(t0, cfg.crack, 'highpass', cfg.hp * 0.5, 0.7, cfg.g * 0.5 * sp.gain, sp.pan);
    this._tone(t0, cfg.body, cfg.dur * 0.9, 'triangle', cfg.g * 0.5 * sp.gain, cfg.body * 0.4, sp.pan);
    if (cls === 'sniper') this._noise(t0 + 0.04, 0.5, 'bandpass', 800, 0.6, 0.2 * sp.gain, sp.pan);
  }

  dryFire() { this._tone(this.t, 1800, 0.03, 'square', 0.08); }
  hit(material = 'wall', dist = 0, x = 0, z = 0) {
    if (!this.ctx) return;
    const t0 = this.t;
    const sp = this._spatial(dist, x, z);
    const f = { wall: 3200, metal: 5200, wood: 1800, flesh: 500, ground: 1400 }[material] || 2600;
    this._noise(t0, material === 'metal' ? 0.12 : 0.06, 'bandpass', f, 3, 0.22 * sp.gain, sp.pan);
    if (material === 'metal') this._tone(t0, 4200, 0.1, 'triangle', 0.06 * sp.gain, 2600, sp.pan);
  }
  hitmarker(head = false) {
    if (!this.ctx) return;
    const t0 = this.t;
    this._tone(t0, head ? 1500 : 900, 0.05, 'square', 0.11);
    this._tone(t0 + 0.02, head ? 2400 : 1200, 0.06, 'sine', 0.09);
    if (head) this._tone(t0 + 0.05, 3200, 0.12, 'sine', 0.07);
  }
  reload(stage = 0) {
    if (!this.ctx) return;
    const t0 = this.t;
    if (stage === 0) { this._noise(t0, 0.07, 'bandpass', 1500, 2, 0.2); this._tone(t0, 320, 0.06, 'square', 0.1); }
    if (stage === 1) { this._noise(t0, 0.09, 'bandpass', 900, 2, 0.24); this._tone(t0, 220, 0.07, 'square', 0.12); }
    if (stage === 2) { this._noise(t0, 0.06, 'highpass', 2600, 1, 0.18); this._tone(t0 + 0.02, 1400, 0.04, 'square', 0.1); }
  }
  empty() { this._tone(this.t, 900, 0.04, 'square', 0.09); }
  footstep(vol = 1, surface = 'concrete') {
    if (!this.ctx) return;
    const t0 = this.t;
    const f = surface === 'ground' ? 900 : 1800;
    this._noise(t0, 0.07, 'lowpass', f, 1, 0.11 * vol);
    if (surface === 'metal') this._tone(t0, 2600, 0.05, 'triangle', 0.05 * vol, 1800);
  }
  explosion(dist = 0, x = 0, z = 0) {
    if (!this.ctx) return;
    const t0 = this.t;
    const sp = this._spatial(dist, x, z);
    this._noise(t0, 1.1, 'lowpass', 420, 0.7, 0.95 * sp.gain, sp.pan);
    this._noise(t0, 0.16, 'highpass', 1600, 0.6, 0.5 * sp.gain, sp.pan);
    this._tone(t0, 90, 0.9, 'sine', 0.75 * sp.gain, 34, sp.pan);
  }
  ricochet(dist = 0, x = 0, z = 0) {
    if (!this.ctx) return;
    const t0 = this.t;
    const sp = this._spatial(dist, x, z);
    const f = 1200 + Math.random() * 2200;
    this._tone(t0, f, 0.16, 'triangle', 0.08 * sp.gain, f * 0.35, sp.pan);
  }
  hurt() {
    if (!this.ctx) return;
    const t0 = this.t;
    this._noise(t0, 0.16, 'lowpass', 700, 1, 0.3);
    this._tone(t0, 180, 0.2, 'sawtooth', 0.14, 90);
  }
  death() {
    if (!this.ctx) return;
    const t0 = this.t;
    this._tone(t0, 420, 0.7, 'sawtooth', 0.2, 60);
    this._noise(t0, 0.7, 'lowpass', 500, 1, 0.3);
  }
  beep(fast = false) {
    if (!this.ctx) return;
    const t0 = this.t;
    this._tone(t0, fast ? 2400 : 1600, 0.09, 'square', 0.16);
  }
  plantDone() {
    if (!this.ctx) return;
    const t0 = this.t;
    this._tone(t0, 300, 0.5, 'sawtooth', 0.2, 900);
    this._tone(t0 + 0.1, 600, 0.5, 'square', 0.12, 1400);
  }
  defuseDone() {
    if (!this.ctx) return;
    const t0 = this.t;
    this._tone(t0, 900, 0.35, 'sine', 0.2, 300);
  }
  pickup(rare = false) {
    if (!this.ctx) return;
    const t0 = this.t;
    this._tone(t0, rare ? 900 : 700, 0.08, 'triangle', 0.14);
    this._tone(t0 + 0.06, rare ? 1400 : 1000, 0.12, 'triangle', 0.12);
  }
  levelUp() {
    if (!this.ctx) return;
    const t0 = this.t;
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => {
      this._tone(t0 + i * 0.09, f, 0.32, 'triangle', 0.17);
      this._tone(t0 + i * 0.09, f * 2, 0.24, 'sine', 0.07);
    });
  }
  dash() {
    if (!this.ctx) return;
    const t0 = this.t;
    this._noise(t0, 0.28, 'bandpass', 700, 1.4, 0.28);
    this._tone(t0, 700, 0.26, 'sine', 0.1, 180);
  }
  heal() {
    if (!this.ctx) return;
    const t0 = this.t;
    this._tone(t0, 500, 0.3, 'sine', 0.12, 900);
    this._tone(t0 + 0.12, 800, 0.3, 'sine', 0.1, 1300);
  }
  berserk() {
    if (!this.ctx) return;
    const t0 = this.t;
    this._tone(t0, 90, 1.0, 'sawtooth', 0.28, 240);
    this._noise(t0, 0.7, 'bandpass', 400, 0.8, 0.24);
  }
  click() { this._tone(this.t, 1200, 0.03, 'square', 0.06); }
  hover() { this._tone(this.t, 700, 0.02, 'square', 0.03); }
  error() { this._tone(this.t, 200, 0.12, 'square', 0.09, 140); }
  plantLoop() { this._tone(this.t, 380, 0.14, 'square', 0.09); }
  win() {
    if (!this.ctx) return;
    const t0 = this.t;
    [523, 659, 784, 1046, 1318].forEach((f, i) => this._tone(t0 + i * 0.11, f, 0.5, 'triangle', 0.16));
  }
  lose() {
    if (!this.ctx) return;
    const t0 = this.t;
    [440, 392, 330, 262].forEach((f, i) => this._tone(t0 + i * 0.16, f, 0.55, 'sawtooth', 0.14));
  }
  bossRoar() {
    if (!this.ctx) return;
    const t0 = this.t;
    this._tone(t0, 70, 1.4, 'sawtooth', 0.3, 130);
    this._noise(t0, 1.2, 'lowpass', 300, 1, 0.3);
  }
}

export const audio = new AudioSys();

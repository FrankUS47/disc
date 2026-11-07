/* 骰子聲音：用 Web Audio 即時合成 (不需音檔)。預設關閉，可在介面開關。 */
(function () {
  'use strict';
  const D = window.Dice;

  const A = (D.Audio = {
    enabled: false,
    ctx: null, master: null, noise: null,
    voices: 0, lastT: 0,

    setEnabled(v) {
      this.enabled = !!v;
      if (this.enabled) this.init();
    },

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      const comp = ctx.createDynamicsCompressor();
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(comp);
      comp.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.6);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      this.noise = buf;
    },

    _ok() { return this.enabled && this.ctx && this.voices < 28; },

    _burst(t, freq, q, peak, dur, delay) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
      const g = ctx.createGain();
      const s = t + (delay || 0);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(peak, s + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0008, s + dur);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      this.voices++;
      src.onended = () => { this.voices--; };
      src.start(s, Math.random() * 0.3, dur + 0.05);
    },

    _thump(t, f0, peak, dur) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.35, t + dur);
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(this.master);
      this.voices++;
      o.onended = () => { this.voices--; };
      o.start(t); o.stop(t + dur + 0.02);
    },

    /* 撞擊聲。intensity 0..1；kind: die/floor/wall/shard；cupped: 在骰盅內 (較悶、帶空腔共鳴) */
    hit(intensity, kind, cupped) {
      if (!this._ok()) return;
      const ctx = this.ctx, t = ctx.currentTime;
      if (t - this.lastT < 0.010) return;
      this.lastT = t;
      const base = { die: 3300, floor: 2100, wall: 1500, shard: 5200 }[kind] || 2000;
      const f = base * (0.8 + Math.random() * 0.5) * (cupped ? 0.55 : 1);
      const i = Math.max(0.05, Math.min(1, intensity));
      const peak = (0.12 + i * 0.85) * (kind === 'shard' ? 0.45 : 1);
      this._burst(t, f, cupped ? 2.4 : 1.3, peak, 0.025 + 0.07 * i + (cupped ? 0.04 : 0));
      if (kind !== 'shard') this._thump(t, (cupped ? 240 : 170) * (0.8 + Math.random() * 0.4), 0.32 * i, 0.07);
      if (cupped) this._burst(t, 820, 5, peak * 0.35, 0.16);   // 骰盅空腔
    },

    /* 裂開／粉碎聲 */
    crack(strength) {
      if (!this._ok()) return;
      const t = this.ctx.currentTime, s = Math.max(0.2, Math.min(1, strength));
      this._burst(t, 2600, 0.8, 0.9 * s, 0.12);
      this._thump(t, 140, 0.5 * s, 0.14);
      const n = Math.round(4 + 10 * s);
      for (let k = 0; k < n; k++) this._burst(t, 3500 + Math.random() * 4000, 3, 0.35 * s, 0.03, 0.04 + Math.random() * 0.35);
    },

    /* 掀開骰盅 */
    lift() {
      if (!this._ok()) return;
      const t = this.ctx.currentTime;
      this._burst(t, 700, 0.7, 0.25, 0.25);
      this._thump(t, 110, 0.25, 0.12);
    }
  });
})();

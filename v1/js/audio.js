/* 骰子聲音：Web Audio 即時合成 (模態合成：撞擊雜訊 + 數個衰減共振頻率 + 低頻悶響)。
   預設關閉；可在設定選擇音色並試聽。 */
(function () {
  'use strict';
  const D = window.Dice;

  /* modes: [頻率Hz, 音量, 衰減秒]；click: 撞擊瞬間雜訊；thump: [頻率, 音量, 秒] 低頻悶響；lp: 低通 */
  const STYLES = {
    acrylic: { label: '壓克力骰 (清脆)', modes: [[2600, 0.5, 0.045], [4300, 1, 0.03], [7000, 0.6, 0.02]], click: { f: 5200, q: 1.6, d: 0.02, g: 0.9 }, thump: [240, 0.25, 0.04], lp: 14000, roll: 900 },
    bone:    { label: '骨骰／象牙 (硬脆)', modes: [[1700, 0.5, 0.06], [2900, 1, 0.05], [4700, 0.7, 0.035]], click: { f: 3500, q: 1.4, d: 0.025, g: 0.9 }, thump: [200, 0.3, 0.05], lp: 11000, roll: 700 },
    wood:    { label: '木骰 (低沉)', modes: [[420, 0.7, 0.09], [950, 1, 0.07], [1900, 0.5, 0.05]], click: { f: 1800, q: 1.2, d: 0.03, g: 0.8 }, thump: [150, 0.5, 0.08], lp: 6000, roll: 450 },
    felt:    { label: '絨布桌 (悶響)', modes: [[500, 0.8, 0.06], [1100, 0.5, 0.045]], click: { f: 1200, q: 0.9, d: 0.035, g: 0.6 }, thump: [110, 0.7, 0.09], lp: 2400, roll: 300 },
    metal:   { label: '金屬骰 (叮噹)', modes: [[3100, 1, 0.2], [5400, 0.8, 0.15], [8200, 0.5, 0.1]], click: { f: 6000, q: 2, d: 0.012, g: 0.6 }, thump: [320, 0.15, 0.03], lp: 16000, roll: 1200 }
  };

  const KIND_PITCH = { die: 1.18, floor: 1, wall: 0.82, shard: 1.45 };

  const A = (D.Audio = {
    enabled: false, style: 'acrylic', STYLES,
    ctx: null, master: null, noise: null, voices: 0, lastT: 0, rollG: null, rollF: null,

    setEnabled(v) { this.enabled = !!v; if (this.enabled) this.init(); else this.setRoll(0); },
    setStyle(s) { if (STYLES[s]) { this.style = s; if (this.rollF) this.rollF.frequency.value = STYLES[s].roll; } },

    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      const comp = ctx.createDynamicsCompressor();
      this.master = ctx.createGain(); this.master.gain.value = 0.9;
      this.master.connect(comp); comp.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 1.0);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      this.noise = buf;
      // 滾動底噪 (持續的低沙沙聲，音量隨骰子速度變化)
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = this.rollF = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = STYLES[this.style].roll; f.Q.value = 0.7;
      const g = this.rollG = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
    },

    setRoll(level, cupped) {
      if (!this.rollG) return;
      const t = this.ctx.currentTime;
      this.rollG.gain.setTargetAtTime(this.enabled ? level * level * (cupped ? 0.08 : 0.16) : 0, t, 0.05);
      this.rollF.frequency.setTargetAtTime(STYLES[this.style].roll * (cupped ? 0.7 : 1) * (0.8 + level * 0.5), t, 0.08);
    },

    _ok() { return this.enabled && this.ctx && this.voices < 40; },

    _noise(t, freq, q, peak, dur, type, lp) {
      const ctx = this.ctx, src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter(); bp.type = type || 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.0015);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      src.connect(bp); bp.connect(g);
      let out = g;
      if (lp) { const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp; g.connect(l); out = l; }
      out.connect(this.master);
      this.voices++; src.onended = () => { this.voices--; };
      src.start(t, Math.random() * 0.5, dur + 0.05);
    },

    _tone(t, f, peak, dur, f1) {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(this.master);
      this.voices++; o.onended = () => { this.voices--; };
      o.start(t); o.stop(t + dur + 0.02);
    },

    /* 撞擊聲。intensity 0..1；kind: die/floor/wall/shard；cupped: 在骰盅內 */
    hit(intensity, kind, cupped, styleOverride) {
      if (!this._ok()) return;
      const ctx = this.ctx, t = ctx.currentTime + (this._delay || 0);
      if (!this._delay && t - this.lastT < 0.008) return;
      this.lastT = t;
      const st = STYLES[styleOverride || this.style];
      const i = Math.max(0.05, Math.min(1, intensity));
      const pitch = (KIND_PITCH[kind] || 1) * (0.92 + Math.random() * 0.16) * (cupped ? 0.7 : 1);
      const amp = (0.1 + 0.9 * Math.pow(i, 0.8)) * (kind === 'shard' ? 0.5 : 1) * (cupped ? 0.75 : 1);
      const lp = st.lp * (cupped ? 0.35 : 1);
      // 撞擊瞬間的 "嗒" (短雜訊)
      this._noise(t, st.click.f * pitch, st.click.q, amp * st.click.g, st.click.d * (0.7 + i * 0.6), 'bandpass', lp);
      // 材質共振 (數個衰減正弦)
      st.modes.forEach(m => { if (m[0] * pitch < lp * 1.2) this._tone(t, m[0] * pitch, amp * m[1] * 0.16, m[2] * (0.7 + i * 0.6)); });
      // 低頻悶響 (落在桌面的重量感)
      if (kind !== 'shard') this._tone(t, st.thump[0] * pitch * 1.2, amp * st.thump[1] * 0.5, st.thump[2], st.thump[0] * pitch * 0.4);
      // 骰盅內腔共鳴
      if (cupped) this._noise(t, 850, 5, amp * 0.3, 0.16);
    },

    /* 試聽：模擬一次擲出的連續撞擊 */
    preview(style) {
      if (!this.ctx) this.init();
      if (!this.ctx) return;
      const ctx = this.ctx; if (ctx.state === 'suspended') ctx.resume();
      const prev = this.enabled; this.enabled = true;
      const seq = [[0, 0.9, 'floor'], [0.11, 0.7, 'wall'], [0.2, 0.6, 'die'], [0.29, 0.45, 'floor'], [0.37, 0.5, 'die'], [0.45, 0.3, 'floor'], [0.52, 0.22, 'floor'], [0.58, 0.14, 'floor']];
      seq.forEach(([dt, inten, kind]) => { this._delay = dt; this.hit(inten, kind, false, style); });
      this._delay = 0; this.enabled = prev;
    },

    /* 裂開／粉碎聲 */
    crack(strength) {
      if (!this._ok()) return;
      const t = this.ctx.currentTime, s = Math.max(0.2, Math.min(1, strength));
      this._noise(t, 2600, 0.8, 0.9 * s, 0.12);
      this._tone(t, 160, 0.5 * s, 0.14, 60);
      const n = Math.round(4 + 10 * s);
      for (let k = 0; k < n; k++) this._noise(t + 0.04 + Math.random() * 0.35, 3500 + Math.random() * 4000, 3, 0.3 * s, 0.03);
    },

    /* 掀開骰盅 */
    lift() {
      if (!this._ok()) return;
      const t = this.ctx.currentTime;
      this._noise(t, 700, 0.7, 0.25, 0.25);
      this._tone(t, 120, 0.25, 0.12, 60);
    },

    /* 骰盅落回桌面 */
    land() {
      if (!this._ok()) return;
      const t = this.ctx.currentTime;
      this._noise(t, 600, 1, 0.5, 0.12, 'bandpass', 3000);
      this._tone(t, 130, 0.6, 0.16, 50);
    }
  });
})();

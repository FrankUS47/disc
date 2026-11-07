/* 輸入：滑鼠/觸控移動速度、手機晃動 → 統一換算成「力道 power」與容器位移 */
(function () {
  'use strict';
  const D = window.Dice, CFG = D.CFG;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const I = (D.Input = {
    active: false,        // 指標按住中
    hold: false,          // 指標按住 或 手機正在晃動
    power: 0,             // 目前力道 (已平滑)
    offX: 0, offZ: 0,     // 容器目標位移
    onTap: null,

    _ptr: null, _samples: [], _ox: 0, _oy: 0, _pX: 0, _pZ: 0, _moved: 0, _downT: 0, _lastEv: 0, _ppu: 44,
    pointerPower: 0, motionPower: 0,
    _mTarget: 0, _mT: 0, _mX: 0, _mZ: 0, _mTX: 0, _mTZ: 0, _g: null,
    motionState: 'none',  // none | needs-permission | on

    init(el) {
      this.el = el;
      el.addEventListener('pointerdown', (e) => {
        if (this._ptr !== null) return;
        this._ptr = e.pointerId;
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        this.active = true;
        this._ox = e.clientX; this._oy = e.clientY;
        this._pX = this._pZ = 0;
        this._moved = 0; this._downT = performance.now(); this._lastEv = this._downT;
        this._samples = [{ t: this._downT, x: e.clientX, y: e.clientY }];
        this._ppu = Math.max(30, el.clientWidth / 9);
      });
      el.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this._ptr) return;
        const now = performance.now();
        const last = this._samples[this._samples.length - 1];
        this._moved += Math.hypot(e.clientX - last.x, e.clientY - last.y);
        this._samples.push({ t: now, x: e.clientX, y: e.clientY });
        this._lastEv = now;
        // 容器位移：以按下點為原點，超出範圍時原點被「拖著走」，反向立刻有反應
        let vx = (e.clientX - this._ox) / this._ppu, vz = (e.clientY - this._oy) / this._ppu;
        const len = Math.hypot(vx, vz);
        if (len > CFG.MAX_OFFSET) {
          const k = CFG.MAX_OFFSET / len;
          this._ox = e.clientX - vx * k * this._ppu;
          this._oy = e.clientY - vz * k * this._ppu;
          vx *= k; vz *= k;
        }
        this._pX = vx; this._pZ = vz;
      });
      const up = (e) => {
        if (e.pointerId !== this._ptr) return;
        this._ptr = null; this.active = false;
        const dt = performance.now() - this._downT;
        if (this._moved < 10 && dt < 400 && this.onTap) this.onTap();
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);

      // 手機晃動
      if (typeof DeviceMotionEvent !== 'undefined') {
        if (typeof DeviceMotionEvent.requestPermission === 'function') this.motionState = 'needs-permission';
        else { window.addEventListener('devicemotion', (e) => this._onMotion(e)); this.motionState = 'on'; }
      }
    },

    requestMotion() {
      if (typeof DeviceMotionEvent === 'undefined' || typeof DeviceMotionEvent.requestPermission !== 'function') return Promise.resolve(false);
      return DeviceMotionEvent.requestPermission().then((r) => {
        if (r === 'granted') {
          window.addEventListener('devicemotion', (e) => this._onMotion(e));
          this.motionState = 'on';
          return true;
        }
        return false;
      }).catch(() => false);
    },

    _onMotion(e) {
      let ax, ay, az;
      const a = e.acceleration;
      if (a && a.x != null) { ax = a.x; ay = a.y; az = a.z; }
      else {
        const g = e.accelerationIncludingGravity;
        if (!g || g.x == null) return;
        if (!this._g) this._g = { x: g.x, y: g.y, z: g.z };
        this._g.x += (g.x - this._g.x) * 0.1; this._g.y += (g.y - this._g.y) * 0.1; this._g.z += (g.z - this._g.z) * 0.1;
        ax = g.x - this._g.x; ay = g.y - this._g.y; az = g.z - this._g.z;
      }
      this._mTarget = Math.hypot(ax, ay, az) / CFG.MOTION_PER_POWER;
      this._mT = performance.now();
      this._mTX = clamp(ax * 0.2, -CFG.MAX_OFFSET, CFG.MAX_OFFSET);
      this._mTZ = clamp(-ay * 0.2, -CFG.MAX_OFFSET, CFG.MAX_OFFSET);
    },

    /* 每幀呼叫：由最近 100ms 的移動距離估算速度 */
    update(dt) {
      const now = performance.now();
      let target = 0;
      if (this._ptr !== null) {
        const s = this._samples;
        while (s.length > 2 && now - s[0].t > 100) s.shift();
        if (s.length >= 2 && now - this._lastEv < 80) {
          let path = 0;
          for (let i = 1; i < s.length; i++) path += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
          const span = s[s.length - 1].t - s[0].t;
          if (span > 8) target = (path / span) * 1000 / CFG.PX_PER_POWER;
        }
      }
      this.pointerPower += (target - this.pointerPower) * (1 - Math.exp(-dt * 14));
      if (this._ptr === null && this.pointerPower < 0.02) this.pointerPower = 0;

      const mt = now - this._mT > 120 ? 0 : this._mTarget;
      this.motionPower += (mt - this.motionPower) * (1 - Math.exp(-dt * 10));
      const kk = 1 - Math.exp(-dt * 20);
      this._mX += ((now - this._mT > 120 ? 0 : this._mTX) - this._mX) * kk;
      this._mZ += ((now - this._mT > 120 ? 0 : this._mTZ) - this._mZ) * kk;

      const motionOn = this.motionPower > 0.5;
      this.power = Math.max(this.pointerPower, this.motionPower);
      this.hold = this.active || motionOn;
      if (this.active && this.pointerPower >= this.motionPower) { this.offX = this._pX; this.offZ = this._pZ; }
      else if (motionOn) { this.offX = this._mX; this.offZ = this._mZ; }
      else if (this.active) { this.offX = this._pX; this.offZ = this._pZ; }
      else { this.offX = 0; this.offZ = 0; }
    }
  });
})();

/* 遊戲流程：搖骰(速度驅動) → 慢慢停止 → (骰盅)等待開盅 → 讀取結果。含疊骰與粉碎判定 */
(function () {
  'use strict';
  const D = window.Dice, CFG = D.CFG, T = window.THREE, C = window.CANNON;
  const P = D.Physics, S = D.Scene, A = D.Audio, FX = D.FX, DM = D.DiceMesh, I = D.Input;
  const rand = Math.random, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const UP = new T.Vector3(0, 1, 0);

  const G = (D.Game = {
    settings: { count: 1, faces: 6, meanings: [], cup: false, clear: false, tricks: true },
    sustain: 0, maxSustain: 0, hold: 0,
    dice: [],
    state: 'idle',       // idle | lowering | shaking | settling | stacking | done | opening
    lift: 1, liftTarget: 1,
    auto: null,
    peak: 0, idleT: 0, settleT: 0, slowT: 0, tiltRetries: 0, phase: 0,
    needReset: false, last: null, history: [],
    listeners: {},

    on(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); },
    emit(name, data) { (this.listeners[name] || []).forEach(f => f(data)); },

    init(canvas, stage) {
      P.init(); S.init(canvas, stage); FX.init();
      I.init(stage);
      I.onTap = () => this.onTap();
      P.onHit = (imp, self, other) => this.onHit(imp, self, other);
      this.applySettings({}, true);
      let prev = performance.now();
      const loop = (now) => {
        const dt = Math.min(0.05, Math.max(0.001, (now - prev) / 1000));
        prev = now;
        this.tick(dt);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },

    /* ---------- 設定 ---------- */
    ensureMeanings() {
      const s = this.settings;
      while (s.meanings.length < s.faces) s.meanings.push(`${s.meanings.length + 1} 點`);
      s.meanings.length = Math.max(s.meanings.length, s.faces);
    },

    applySettings(part, force) {
      const s = this.settings;
      Object.assign(s, part);
      s.count = clamp(s.count | 0, 1, CFG.MAX_DICE);
      s.faces = clamp(s.faces | 0 || 6, 2, 20);
      this.ensureMeanings();
      P.buildContainer(s.cup ? CFG.PHYS_R_CUP : CFG.PHYS_R_OPEN, s.cup ? CFG.CEIL_CUP : CFG.CEIL_OPEN);
      CFG.MAX_OFFSET = s.cup ? CFG.MAX_OFFSET_CUP : CFG.OFFSET_BASE;
      S.setCupMode(s.cup);
      S.setClear(s.clear);
      this.hold = 0;
      this.lift = this.liftTarget = s.cup ? 0 : 1;
      this.auto = null;
      this.resetDice();
      this.last = null;
      this.setState('idle');
      this.emit('result', null);
    },

    refreshLabels() {
      this.dice.forEach(d => { if (d.state !== 'shattered') DM.applyLabels(d, this.settings.meanings, this.settings.faces); });
    },

    /* ---------- 骰子建立 ---------- */
    assignLabels(die) {
      const N = this.settings.faces;
      if (N === 6) { die.labels = D.FACE_VALUE.map(v => v - 1); return; }
      let arr;
      if (N < 6) {                       // 每個意義至少出現一次，其餘隨機 → 邊際機率均等
        arr = [];
        for (let i = 0; i < N; i++) arr.push(i);
        while (arr.length < 6) arr.push(Math.floor(rand() * N));
      } else {                           // 6 個不重複隨機意義
        const all = [];
        for (let i = 0; i < N; i++) all.push(i);
        for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
        arr = all.slice(0, 6);
      }
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      die.labels = arr;
    },

    resetDice() {
      this.dice.forEach(d => { S.diceLayer.remove(d.mesh); P.remove(d.body); DM.dispose(d); });
      this.dice = [];
      FX.clearShards();
      const s = this.settings, n = s.count, cp = P.cont.pos;
      const ringR = n === 1 ? 0 : (n === 2 ? 0.85 : n === 3 ? 1.0 : 1.1);
      const a0 = rand() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const die = DM.create();
        const ang = a0 + (i / n) * Math.PI * 2;
        const x = cp.x + Math.cos(ang) * ringR, z = cp.z + Math.sin(ang) * ringR;
        const q = new T.Quaternion().setFromAxisAngle(UP, rand() * Math.PI * 2)
          .multiply(DM.flatten(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0), Math.floor(rand() * 6)));
        die.body = P.addDie(x, cp.y + 0.502, z, q);
        this.assignLabels(die);
        DM.applyLabels(die, s.meanings, s.faces);
        die.mesh.position.set(x, cp.y + 0.5, z);
        die.mesh.quaternion.copy(q);
        S.diceLayer.add(die.mesh);
        this.dice.push(die);
      }
      this.needReset = false;
    },

    /* ---------- 狀態 ---------- */
    setState(st) {
      this.state = st;
      const covered = this.settings.cup && this.lift < 0.999;
      this.emit('state', { state: st, cup: this.settings.cup, covered: covered && !this.settings.clear, clear: this.settings.clear });
      this.emit('canopen', st === 'done' && this.settings.cup && this.lift < 0.001);
    },

    alive() { return this.dice.filter(d => d.state !== 'shattered'); },

    /* ---------- 操作入口 ---------- */
    rollButton() {
      if (this.state === 'lowering' || this.state === 'opening' || this.state === 'stacking') return;
      this.auto = { t: 0, dur: 1.1 + rand() * 0.6, power: 5 + rand() * 2.5, w: 17 + rand() * 6 };
      if (this.state === 'idle' || this.state === 'done') this.beginThrow();
      else if (this.state === 'settling') { this.setState('shaking'); this.idleT = 0; }
    },

    onTap() {
      if (this.state === 'done' && this.settings.cup && this.lift < 0.001) this.openCup();
    },

    openCup() {
      if (!(this.state === 'done' && this.settings.cup && this.lift < 0.001)) return;
      A.lift();
      this.liftTarget = 1;
      this.setState('opening');
    },

    beginThrow() {
      this.revealed = false; this.peak = 0; this.sustain = 0; this.maxSustain = 0; this.idleT = 0; this.tiltRetries = 0; this.slowT = 0; this.last = null;
      this.emit('result', { text: '搖骰中…', note: '', pending: true });
      if (this.settings.cup && this.lift > 0) {
        this.liftTarget = 0;
        this.setState('lowering');       // 骰盅先蓋回去，動畫完成後才開始搖
      } else {
        this.startShaking();
      }
    },

    startShaking() {
      if (this.needReset) this.resetDice();
      else {
        this.alive().forEach(d => { this.assignLabels(d); DM.applyLabels(d, this.settings.meanings, this.settings.faces); });
      }
      P.wakeAll();
      this.hold = P.cont.pos.y;
      this.phase = 0;
      this.setState('shaking');
    },

    /* ---------- 碰撞聲 ---------- */
    onHit(imp, self, other) {
      if (!A.enabled || imp < 1.2) return;
      const now = performance.now();
      if (self._hitT && now - self._hitT < 40) return;
      self._hitT = now;
      const ok = other.userData ? other.userData.kind : 'wall';
      const kind = self.userData.kind === 'shard' ? 'shard' : (ok === 'dice' ? 'die' : ok === 'shard' ? 'shard' : ok === 'floor' ? 'floor' : 'wall');
      A.hit(Math.min(1, imp / 14), kind, this.settings.cup && this.lift < 0.5);
    },

    /* ---------- 主迴圈 ---------- */
    tick(dt) {
      I.update(dt);
      const s = this.settings, cp = P.cont.pos;

      // 骰盅升降動畫
      if (this.lift !== this.liftTarget) {
        const sp = this.liftTarget > this.lift ? 1.9 : 3.4;
        this.lift = this.liftTarget > this.lift ? Math.min(this.liftTarget, this.lift + dt * sp) : Math.max(this.liftTarget, this.lift - dt * sp);
      }

      // 狀態轉移
      if ((this.state === 'idle' || this.state === 'done') && I.hold && I.power > CFG.START_POWER && !this.auto) this.beginThrow();
      if (this.state === 'lowering' && this.lift <= 0.001) this.startShaking();
      if (this.state === 'opening' && this.lift >= 0.999) { this.setState('done'); this.reveal(); }

      // 決定容器目標
      let drive = false, power = 0, gx = 0, gz = 0, gy = 0;
      if (this.state === 'shaking') {
        if (this.auto) {
          const a = this.auto; a.t += dt;
          const env = Math.min(1, a.t / 0.15) * Math.min(1, (a.dur - a.t) / 0.3 + 0.05);
          const e = Math.max(0, env);
          gx = Math.sin(a.w * a.t) * 1.3 * e;
          gz = Math.sin(a.w * 1.31 * a.t + 1) * 1.1 * e;
          power = a.power * e; drive = true;
          if (a.t >= a.dur) this.auto = null;
        } else if (I.hold) {
          gx = I.offX; gz = I.offZ; power = I.power; drive = true;
        }
        this.peak = Math.max(this.peak, power);
        const amp = clamp(power * 0.045, 0, 0.9);            // 垂直晃動幅度 ∝ 力道
        this.phase += dt * (18 + power * 0.6);
        // 骰盅模式：連底座一起拿到空中晃動
        const holdT = s.cup ? CFG.HOLD_Y : 0;
        this.hold += clamp(holdT - this.hold, -CFG.HOLD_V * dt, CFG.HOLD_V * dt);
        gy = this.hold + amp * (0.5 - 0.5 * Math.cos(this.phase));
        // 持續高速的累積量
        if (power >= CFG.SUSTAIN_POWER) this.sustain += dt; else this.sustain = Math.max(0, this.sustain - dt * 0.5);
        this.maxSustain = Math.max(this.maxSustain, this.sustain);

        if (!this.auto && !(I.hold && I.power >= CFG.STOP_POWER)) this.idleT += dt; else this.idleT = 0;
        if (this.idleT > (I.active ? 0.5 : 0.3)) { this.setState('settling'); this.settleT = 0; this.slowT = 0; }
        else if (s.tricks && s.cup) this.hazards(dt, power);
      } else if (this.state === 'settling') {
        if (I.active) { gx = I.offX; gz = I.offZ; }
        if (I.hold && I.power > CFG.START_POWER) { this.setState('shaking'); this.idleT = 0; this.hold = cp.y; P.wakeAll(); }
      } else if (this.state === 'done' || this.state === 'idle') {
        if (I.active) { gx = I.offX; gz = I.offZ; }
      }

      P.step(dt, { x: gx, y: gy, z: gz }, drive ? CFG.MAX_V : CFG.RETURN_V);

      // 同步 3D 物件
      this.dice.forEach(d => {
        if (d.frozen || d.state === 'shattered') return;
        const b = d.body;
        d.mesh.position.set(b.position.x, b.position.y, b.position.z);
        d.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      });
      FX.syncShards();
      FX.update(dt);

      // 慢慢停止判定
      if (this.state === 'settling') {
        this.settleT += dt;
        const goalX = I.active ? I.offX : 0, goalZ = I.active ? I.offZ : 0;
        const near = Math.hypot(cp.x - goalX, cp.z - goalZ, cp.y) < 0.05;
        this.slowT = P.allSlow() ? this.slowT + dt : 0;
        if ((this.slowT > 0.35 && near && this.settleT > 0.5) || this.settleT > 9) this.finishThrow();
      }

      this.updateSound(dt);
      S.update(dt, P.cont, this.lift, s.cup);
      S.render();
    },

    /* 滾動底噪 (依骰子速度) 與落地聲 */
    updateSound(dt) {
      const cp = P.cont.pos;
      if (this.wasHeld && cp.y < 0.03 && this.settings.cup) { A.land(); this.wasHeld = false; }
      if (cp.y > 0.6) this.wasHeld = true;
      if (!A.enabled) return;
      let m = 0;
      const bodies = P.world.bodies;
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (b.type !== C.Body.DYNAMIC || b.position.y - cp.y > 0.9) continue;
        const rv = Math.hypot(b.velocity.x - P.cont.v.x, b.velocity.z - P.cont.v.z);
        if (rv > m) m = rv;
      }
      A.setRoll(this.state === 'idle' ? 0 : Math.min(1, m / 9), this.settings.cup && this.lift < 0.5);
    },

    /* 速度過快：骰子出現裂痕、甚至粉碎 */
    hazards(dt, power) {
      if (!this.settings.cup || power <= CFG.CHIP_POWER || this.sustain < CFG.CHIP_SUSTAIN) return;
      this.alive().forEach(d => {
        if (power > CFG.SHATTER_POWER && this.sustain >= CFG.SHATTER_SUSTAIN && rand() < (power - CFG.SHATTER_POWER) * CFG.SHATTER_RATE * dt) {
          FX.shatter(d); this.needReset = true; return;
        }
        if (d.state === 'ok' && rand() < (power - CFG.CHIP_POWER) * CFG.CHIP_RATE * dt) { FX.chip(d); this.needReset = true; }
      });
    },

    /* ---------- 結束一次投擲 ---------- */
    finishThrow() {
      const cy = P.cont.pos.y;
      let retry = false;
      this.alive().forEach(d => {
        const b = d.body, top = DM.topFace(b.quaternion);
        if (top.dot < 0.965 && this.tiltRetries < 3) {       // 歪斜卡住：再踢一下
          b.wakeUp();
          b.velocity.set((rand() - 0.5) * 3, 4 + rand() * 2, (rand() - 0.5) * 3);
          b.angularVelocity.set((rand() - 0.5) * 9, (rand() - 0.5) * 9, (rand() - 0.5) * 9);
          retry = true;
        } else if (top.dot < 0.99999) {                       // 微小傾斜：吸附為水平
          const q = DM.flatten(b.quaternion, top.index);
          b.quaternion.set(q.x, q.y, q.z, q.w);
          b.position.y = cy + 0.5;
          b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
        }
      });
      if (retry) { this.tiltRetries++; this.settleT = 0.3; this.slowT = 0; return; }

      // 骰盅 + 多顆 + 極快 → 小機率疊骰
      const al = this.alive(), s = this.settings;
      if (s.cup && s.tricks && al.length >= 2 && this.maxSustain >= CFG.STACK_SUSTAIN) {
        const k = clamp(this.maxSustain / CFG.STACK_SUSTAIN, 1, 2);
        if (rand() < CFG.STACK_CHANCE * k) {
          this.setState('stacking');
          this.needReset = true;
          FX.stack(al, rand() < CFG.STACK_SAME, () => this.finalize(true));
          return;
        }
      }
      this.finalize(false);
    },

    finalize(stacked) {
      this.last = this.computeResult(stacked);
      this.setState('done');
      if (!(this.settings.cup && this.lift < 0.999) || this.settings.clear) this.reveal();
    },

    /* ---------- 讀取結果 ---------- */
    computeResult(stacked) {
      const s = this.settings, parts = [], keys = [];
      let shattered = 0, cracked = 0, numeric = true, sum = 0;
      this.dice.forEach(d => {
        if (d.state === 'shattered') { parts.push('💥碎'); shattered++; numeric = false; return; }
        const top = DM.topFace(d.frozen ? d.mesh.quaternion : d.body.quaternion);
        let idx = d.labels[top.index];
        const val = idx + 1;
        const text = s.meanings[idx] || `${val} 點`;
        const plain = (s.faces === 6 && text === `${val} 點`) ? String(val) : text;
        parts.push(d.state === 'cracked' ? plain + '(裂)' : plain);
        keys.push(idx);
        if (d.state === 'cracked') cracked++;
        if (s.faces !== 6 || text !== `${val} 點`) numeric = false; else sum += val;
      });
      let text = parts.join(' + ');
      if (numeric && s.faces === 6 && parts.length > 1) text += ` = ${sum}`;
      const notes = [];
      if (stacked) {
        const same = keys.length > 1 && keys.every(k => k === keys[0]);
        notes.push('📚 骰子疊起來了！' + (same ? '而且全部同點！' : ''));
      }
      if (shattered) notes.push(shattered === this.dice.length ? '💥 骰子全部粉碎了！' : `💥 ${shattered} 顆骰子粉碎了`);
      if (cracked) notes.push(`⚠️ ${cracked} 顆骰子裂開`);
      return { text, note: notes.join('　') };
    },

    reveal() {
      if (!this.last || this.revealed) return;
      this.revealed = true;
      const t = new Date().toLocaleTimeString();
      this.history.unshift(`[${t}] ${this.last.text}${this.last.note ? '　' + this.last.note : ''}`);
      if (this.history.length > 30) this.history.length = 30;
      this.emit('result', this.last);
      this.emit('history', this.history);
    }
  });
})();

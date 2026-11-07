/* 物理世界 (cannon.js)：移動的「容器」(地板+圓形牆+天花板) 與骰子/碎片剛體
   容器會跟著滑鼠/手機移動 → 骰子靠接觸力被「搖」起來，速度越快越猛 */
(function () {
  'use strict';
  const D = window.Dice, CFG = D.CFG, C = window.CANNON;

  const P = (D.Physics = {
    world: null,
    mat: {},
    cont: null,          // { pos:{x,y,z}, bodies:[{body,base}] }
    onHit: null,         // (impact, selfBody, otherBody)

    init() {
      const w = (this.world = new C.World());
      w.gravity.set(0, CFG.GRAVITY, 0);
      w.broadphase = new C.NaiveBroadphase();
      w.solver.iterations = 12;
      w.allowSleep = true;
      const m = this.mat = {
        dice: new C.Material('dice'),
        wall: new C.Material('wall'),
        shard: new C.Material('shard')
      };
      const add = (a, b, f, r) => w.addContactMaterial(new C.ContactMaterial(a, b, { friction: f, restitution: r }));
      add(m.dice, m.wall, 0.3, 0.32);
      add(m.dice, m.dice, 0.25, 0.28);
      add(m.shard, m.wall, 0.45, 0.22);
      add(m.shard, m.dice, 0.35, 0.22);
      add(m.shard, m.shard, 0.35, 0.18);
    },

    /* 建立(或重建)容器。R=半徑、ceilY=天花板高度 */
    buildContainer(R, ceilY) {
      if (this.cont) this.cont.bodies.forEach(b => this.world.remove(b.body));
      const bodies = [];
      const mk = (hx, hy, hz, x, y, z, rotY, kind) => {
        const b = new C.Body({ mass: 0, material: this.mat.wall });
        b.type = C.Body.KINEMATIC;
        b.addShape(new C.Box(new C.Vec3(hx, hy, hz)));
        b.position.set(x, y, z);
        if (rotY) b.quaternion.setFromAxisAngle(new C.Vec3(0, 1, 0), rotY);
        b.userData = { kind };
        this.world.addBody(b);
        bodies.push({ body: b, base: new C.Vec3(x, y, z) });
      };
      const big = R + 2;
      mk(big, 0.5, big, 0, -0.5, 0, 0, 'floor');
      mk(big, 0.5, big, 0, ceilY + 0.5, 0, 0, 'wall');
      const N = 20, apothem = R * Math.cos(Math.PI / N), hz = 0.8;
      const half = Math.tan(Math.PI / N) * apothem + 0.12;
      for (let i = 0; i < N; i++) {
        const th = (i / N) * Math.PI * 2;
        const r = apothem + hz;
        mk(half, CFG.WALL_H / 2, hz, Math.sin(th) * r, CFG.WALL_H / 2 - 0.5, Math.cos(th) * r, th, 'wall');
      }
      this.cont = { R, ceil: ceilY, pos: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 }, bodies };
    },

    _hook(body) {
      body.addEventListener('collide', (e) => {
        if (!P.onHit) return;
        const imp = Math.abs(e.contact.getImpactVelocityAlongNormal());
        P.onHit(imp, body, e.body);
      });
    },

    addDie(x, y, z, q) {
      const b = new C.Body({
        mass: 1, material: this.mat.dice,
        linearDamping: 0.04, angularDamping: 0.12,
        allowSleep: true, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.4
      });
      b.addShape(new C.Box(new C.Vec3(0.5, 0.5, 0.5)));
      b.position.set(x, y, z);
      b.quaternion.set(q.x, q.y, q.z, q.w);
      b.userData = { kind: 'dice' };
      this._hook(b);
      this.world.addBody(b);
      return b;
    },

    addShard(hx, hy, hz, pos, q, vel, angVel) {
      const b = new C.Body({
        mass: Math.max(0.03, 8 * hx * hy * hz * 0.9), material: this.mat.shard,
        linearDamping: 0.06, angularDamping: 0.15,
        allowSleep: true, sleepSpeedLimit: 0.2, sleepTimeLimit: 0.35
      });
      b.addShape(new C.Box(new C.Vec3(hx, hy, hz)));
      b.position.set(pos.x, pos.y, pos.z);
      b.quaternion.set(q.x, q.y, q.z, q.w);
      b.velocity.set(vel.x, vel.y, vel.z);
      b.angularVelocity.set(angVel.x, angVel.y, angVel.z);
      b.userData = { kind: 'shard' };
      this._hook(b);
      this.world.addBody(b);
      return b;
    },

    remove(body) { if (body && body.world) this.world.remove(body); },

    wakeAll() {
      this.world.bodies.forEach(b => { if (b.type === C.Body.DYNAMIC) b.wakeUp(); });
    },

    /* 讓容器朝 goal 移動 (速度、加速度皆有上限，像真人的手)，並做子步驟積分避免穿透 */
    step(dt, goal, maxSpeed) {
      const c = this.cont;
      if (!c.v) c.v = { x: 0, y: 0, z: 0 };
      let dx = (goal.x - c.pos.x) / dt, dy = (goal.y - c.pos.y) / dt, dz = (goal.z - c.pos.z) / dt;
      const sp = Math.hypot(dx, dy, dz);
      if (sp > maxSpeed) { const k = maxSpeed / sp; dx *= k; dy *= k; dz *= k; }
      // 加速度限制：避免一幀內速度突變，骰子撞穿牆
      let ax = dx - c.v.x, ay = dy - c.v.y, az = dz - c.v.z;
      const am = Math.hypot(ax, ay, az), amax = CFG.MAX_ACC * dt;
      if (am > amax) { const k = amax / am; ax *= k; ay *= k; az *= k; }
      const vx = c.v.x + ax, vy = c.v.y + ay, vz = c.v.z + az;
      c.v.x = vx; c.v.y = vy; c.v.z = vz;

      const n = Math.max(1, Math.ceil(dt / (1 / 180)));
      const h = dt / n;
      const bodies = this.world.bodies;
      for (let s = 0; s < n; s++) {
        for (let i = 0; i < c.bodies.length; i++) c.bodies[i].body.velocity.set(vx, vy, vz);
        this.world.step(h);
        c.pos.x += vx * h; c.pos.y += vy * h; c.pos.z += vz * h;
        for (let i = 0; i < c.bodies.length; i++) {
          const cb = c.bodies[i];
          cb.body.position.set(cb.base.x + c.pos.x, cb.base.y + c.pos.y, cb.base.z + c.pos.z);
        }
        for (let i = 0; i < bodies.length; i++) {
          const b = bodies[i];
          if (b.type !== C.Body.DYNAMIC) continue;
          const v = b.velocity, l2 = v.x * v.x + v.y * v.y + v.z * v.z;
          if (l2 > CFG.MAX_BODY_V * CFG.MAX_BODY_V) v.scale(CFG.MAX_BODY_V / Math.sqrt(l2), v);
          this._contain(b, c, vx, vy, vz);
        }
      }
      c.vel = { x: vx, y: vy, z: vz };
    },

    /* 最後防線：骰子/碎片永遠不可能離開容器 (圓牆內、地板上、天花板下) */
    _contain(b, c, vx, vy, vz) {
      const shard = b.userData && b.userData.kind === 'shard';
      const p = b.position, v = b.velocity;
      if (!isFinite(p.x + p.y + p.z)) {            // 數值爆掉：放回容器中央
        p.set(c.pos.x, c.pos.y + 0.6, c.pos.z); v.set(vx, vy, vz); b.angularVelocity.set(0, 0, 0); return;
      }
      const m = shard ? 0.1 : 0.34;
      const rx = p.x - c.pos.x, rz = p.z - c.pos.z, d = Math.hypot(rx, rz), lim = c.R - m;
      if (d > lim) {
        const nx = rx / d, nz = rz / d;
        p.x = c.pos.x + nx * lim; p.z = c.pos.z + nz * lim;
        const vn = (v.x - vx) * nx + (v.z - vz) * nz;
        if (vn > 0) { v.x -= 1.3 * vn * nx; v.z -= 1.3 * vn * nz; }
      }
      const lo = c.pos.y + (shard ? 0.03 : 0.3), hi = c.pos.y + c.ceil - (shard ? 0.03 : 0.34);
      if (p.y < lo) { p.y = lo; if (v.y < vy) v.y = vy; }
      else if (p.y > hi) { p.y = hi; if (v.y > vy) v.y = vy - 0.5; }
    },

    /* 所有動態剛體是否都已幾乎靜止 */
    allSlow() {
      const bodies = this.world.bodies;
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (b.type !== C.Body.DYNAMIC || b.sleepState === C.Body.SLEEPING) continue;
        if (b.velocity.norm2() > 0.03 || b.angularVelocity.norm2() > 0.15) return false;
      }
      return true;
    }
  });
})();

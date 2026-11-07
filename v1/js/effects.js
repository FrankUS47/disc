/* 特效：補間動畫、骰子裂開/粉碎(碎片+粉塵)、疊骰 */
(function () {
  'use strict';
  const D = window.Dice, CFG = D.CFG, T = window.THREE;
  const rand = Math.random;

  const FX = (D.FX = {
    tweens: [], shards: [], dust: null,

    init() {
      this.shardMat = new T.MeshStandardMaterial({ color: 0xf3eedd, roughness: 0.55, metalness: 0 });
      const N = 320;
      this.dp = { n: N, pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0 };
      for (let i = 0; i < N; i++) this.dp.pos[i * 3 + 1] = -50;
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(this.dp.pos, 3));
      this.dust = new T.Points(g, new T.PointsMaterial({ color: 0xf2ead8, size: 0.11, transparent: true, opacity: 0.85, depthWrite: false }));
      this.dust.frustumCulled = false;
      D.Scene.scene.add(this.dust);
    },

    tween(dur, fn, done, delay) {
      this.tweens.push({ t: -(delay || 0), dur, fn, done });
    },

    update(dt) {
      for (let i = this.tweens.length - 1; i >= 0; i--) {
        const tw = this.tweens[i];
        tw.t += dt;
        if (tw.t < 0) continue;
        const k = Math.min(1, tw.t / tw.dur);
        tw.fn(k * k * (3 - 2 * k));
        if (k >= 1) { this.tweens.splice(i, 1); if (tw.done) tw.done(); }
      }
      // 粉塵
      const d = this.dp, p = d.pos, v = d.vel;
      for (let i = 0; i < d.n; i++) {
        if (d.life[i] <= 0) continue;
        d.life[i] -= dt;
        const j = i * 3;
        if (d.life[i] <= 0) { p[j + 1] = -50; continue; }
        v[j] *= 1 - 1.6 * dt; v[j + 2] *= 1 - 1.6 * dt; v[j + 1] -= 6 * dt;
        p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
        if (p[j + 1] < 0.03) { p[j + 1] = 0.03; v[j + 1] = 0; v[j] *= 0.5; v[j + 2] *= 0.5; }
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
    },

    puff(pos, n, speed) {
      const d = this.dp;
      for (let k = 0; k < n; k++) {
        const i = d.next; d.next = (d.next + 1) % d.n;
        const j = i * 3;
        d.pos[j] = pos.x + (rand() - 0.5) * 0.5; d.pos[j + 1] = pos.y + (rand() - 0.5) * 0.5; d.pos[j + 2] = pos.z + (rand() - 0.5) * 0.5;
        d.vel[j] = (rand() - 0.5) * speed; d.vel[j + 1] = rand() * speed * 0.6; d.vel[j + 2] = (rand() - 0.5) * speed;
        d.life[i] = 0.9 + rand() * 0.9;
      }
    },

    _spawnShards(die, count, minS, maxS, cornerOnly) {
      const b = die.body, q = new T.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      const corner = new T.Vector3(rand() < .5 ? -1 : 1, rand() < .5 ? -1 : 1, rand() < .5 ? -1 : 1);
      for (let i = 0; i < count; i++) {
        const sx = minS + rand() * (maxS - minS), sy = minS + rand() * (maxS - minS), sz = minS + rand() * (maxS - minS);
        const off = cornerOnly
          ? corner.clone().multiplyScalar(0.34).add(new T.Vector3((rand() - 0.5) * 0.15, (rand() - 0.5) * 0.15, (rand() - 0.5) * 0.15))
          : new T.Vector3((rand() - 0.5) * 0.8, (rand() - 0.5) * 0.8, (rand() - 0.5) * 0.8);
        const dir = off.clone().normalize();
        off.applyQuaternion(q);
        dir.applyQuaternion(q);
        const sp = (cornerOnly ? 1.5 : 2.5) + rand() * (cornerOnly ? 2 : 4);
        const pos = { x: b.position.x + off.x, y: b.position.y + off.y, z: b.position.z + off.z };
        const vel = { x: b.velocity.x + dir.x * sp, y: b.velocity.y + dir.y * sp + rand() * 2, z: b.velocity.z + dir.z * sp };
        const av = { x: (rand() - 0.5) * 20, y: (rand() - 0.5) * 20, z: (rand() - 0.5) * 20 };
        const rq = new T.Quaternion().setFromEuler(new T.Euler(rand() * 6, rand() * 6, rand() * 6)).multiply(q);
        const body = D.Physics.addShard(sx / 2, sy / 2, sz / 2, pos, rq, vel, av);
        const mesh = new T.Mesh(new T.BoxGeometry(sx, sy, sz), this.shardMat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        D.Scene.diceLayer.add(mesh);
        this.shards.push({ mesh, body });
      }
    },

    /* 骰子完全粉碎 */
    shatter(die) {
      this._spawnShards(die, CFG.SHARDS, 0.1, 0.32, false);
      this.puff(die.body.position, 60, 5);
      D.Physics.remove(die.body);
      die.mesh.visible = false;
      die.state = 'shattered';
      D.Audio.crack(1);
    },

    /* 骰子缺角/裂開 (部分破裂) */
    chip(die) {
      this._spawnShards(die, 3, 0.1, 0.2, true);
      this.puff(die.body.position, 16, 3);
      D.DiceMesh.addCracks(die);
      die.state = 'cracked';
      D.Audio.crack(0.4);
    },

    syncShards() {
      for (let i = 0; i < this.shards.length; i++) {
        const s = this.shards[i], b = s.body;
        s.mesh.position.set(b.position.x, b.position.y, b.position.z);
        s.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      }
    },

    clearShards() {
      this.shards.forEach(s => {
        D.Scene.diceLayer.remove(s.mesh); s.mesh.geometry.dispose(); D.Physics.remove(s.body);
      });
      this.shards = [];
      this.tweens.length = 0;
      const d = this.dp;
      for (let i = 0; i < d.n; i++) { d.life[i] = 0; d.pos[i * 3 + 1] = -50; }
    },

    /* 疊骰：骰子停止後(骰盅內看不到)疊成一直排。sameTop=true 時每顆朝上的點數都一樣 */
    stack(dice, sameTop, done) {
      const P = D.Physics, DM = D.DiceMesh, cy = P.cont.pos.y;
      const meanings = D.Game.settings.meanings, faces = D.Game.settings.faces;
      const base = dice[0];
      const bt = DM.topFace(base.body.quaternion);
      const baseQ = DM.flatten(base.body.quaternion, bt.index);
      const bp = new T.Vector3(base.body.position.x, cy + 0.5, base.body.position.z);
      const baseLabel = base.labels[bt.index];
      const up = new T.Vector3(0, 1, 0);

      dice.forEach(d => {
        d.startP = new T.Vector3(d.body.position.x, d.body.position.y, d.body.position.z);
        d.startQ = new T.Quaternion(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w);
        P.remove(d.body);
        d.frozen = true;
      });

      let pending = dice.length;
      dice.forEach((d, k) => {
        const tp = new T.Vector3(bp.x + (k ? (rand() - 0.5) * 0.06 : 0), bp.y + k, bp.z + (k ? (rand() - 0.5) * 0.06 : 0));
        let tq;
        if (k === 0) tq = baseQ;
        else if (sameTop) {
          tq = new T.Quaternion().setFromAxisAngle(up, (rand() - 0.5) * 0.06).multiply(baseQ);
          DM.setLabel(d, DM.topFace(tq).index, baseLabel, meanings, faces);   // 非 6 面骰：讓朝上那面意義相同
        } else {
          const face = Math.floor(rand() * 6);
          const yaw = new T.Quaternion().setFromAxisAngle(up, (rand() - 0.5) * 0.35);
          tq = yaw.multiply(DM.flatten(d.startQ, face));
        }
        const sp = d.startP.clone(), sq = d.startQ.clone();
        this.tween(0.5, (e) => {
          d.mesh.position.lerpVectors(sp, tp, e);
          d.mesh.quaternion.slerpQuaternions(sq, tq, e);
        }, () => {
          d.mesh.position.copy(tp); d.mesh.quaternion.copy(tq);
          if (--pending === 0) done();
        }, 0.1 * k);
      });
    }
  });
})();

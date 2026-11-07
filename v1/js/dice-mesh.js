/* 骰子外觀：圓角立方體 + 六面貼圖 + 裂痕；以及「朝上是哪一面」的判讀 */
(function () {
  'use strict';
  const D = window.Dice, T = window.THREE;
  const NORMALS = D.FACE_NORMALS.map(n => new T.Vector3(n[0], n[1], n[2]));
  const _v = new T.Vector3(), _q = new T.Quaternion();

  let geo = null;
  function geometry() {
    if (geo) return geo;
    const seg = 20, r = 0.1, half = 0.5 - r;
    geo = new T.BoxGeometry(1, 1, 1, seg, seg, seg);
    const p = geo.attributes.position, n = geo.attributes.normal;
    const cl = (v) => Math.max(-half, Math.min(half, v));
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ix = cl(x), iy = cl(y), iz = cl(z);
      let dx = x - ix, dy = y - iy, dz = z - iz;
      const len = Math.hypot(dx, dy, dz);
      if (len > 1e-6) {
        dx /= len; dy /= len; dz /= len;
        p.setXYZ(i, ix + dx * r, iy + dy * r, iz + dz * r);
        n.setXYZ(i, dx, dy, dz);
      }
    }
    return geo;
  }

  const DM = (D.DiceMesh = {
    NORMALS,

    create() {
      const mats = [];
      for (let i = 0; i < 6; i++) {
        mats.push(new T.MeshPhysicalMaterial({
          map: D.Tex.face(D.FACE_VALUE[i]),
          roughness: 0.3, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.25
        }));
      }
      const mesh = new T.Mesh(geometry(), mats);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return { mesh, mats, labels: [0, 1, 2, 3, 4, 5], state: 'ok', frozen: false, cracks: null, body: null };
    },

    /* 依面數設定六個面的內容。faces==6：傳統點數；否則為自訂文字 (labels = 各面對應的「意義索引」) */
    applyLabels(die, meanings, faces) {
      for (let i = 0; i < 6; i++) {
        if (faces === 6) {
          die.labels[i] = D.FACE_VALUE[i] - 1;
          die.mats[i].map = D.Tex.face(D.FACE_VALUE[i]);
        } else {
          const idx = die.labels[i];
          die.mats[i].map = D.Tex.text(meanings[idx] || `${idx + 1} 點`);
        }
      }
    },

    setLabel(die, faceIdx, labelIdx, meanings, faces) {
      if (faces === 6) return;
      die.labels[faceIdx] = labelIdx;
      die.mats[faceIdx].map = D.Tex.text(meanings[labelIdx] || `${labelIdx + 1} 點`);
    },

    /* 目前哪一面朝上：回傳 {index, dot} (dot=1 表示完全水平) */
    topFace(q) {
      _q.set(q.x, q.y, q.z, q.w);
      let best = 0, bd = -2;
      for (let i = 0; i < 6; i++) {
        const d = _v.copy(NORMALS[i]).applyQuaternion(_q).y;
        if (d > bd) { bd = d; best = i; }
      }
      return { index: best, dot: bd };
    },

    /* 讓某個面剛好朝上的最小旋轉 (回傳新的 THREE.Quaternion) */
    flatten(q, faceIdx) {
      _q.set(q.x, q.y, q.z, q.w);
      _v.copy(NORMALS[faceIdx]).applyQuaternion(_q);
      const fix = new T.Quaternion().setFromUnitVectors(_v, new T.Vector3(0, 1, 0));
      return fix.multiply(_q.clone());
    },

    /* 加上裂痕線條 */
    addCracks(die) {
      if (die.cracks) return;
      const pts = [];
      const faces = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5).slice(0, 3);
      faces.forEach(fi => {
        const n = NORMALS[fi];
        const ref = Math.abs(n.y) < 0.9 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0);
        const u = new T.Vector3().crossVectors(ref, n).normalize();
        const v = new T.Vector3().crossVectors(n, u).normalize();
        let a = (Math.random() - 0.5) * 0.7, b = 0.45 * (Math.random() < 0.5 ? -1 : 1);
        const branches = 2 + Math.floor(Math.random() * 2);
        for (let k = 0; k < branches; k++) {
          let x = a, y = b, ang = Math.atan2(-y, -x) + (Math.random() - 0.5) * 1.2;
          const steps = 4 + Math.floor(Math.random() * 3);
          for (let s = 0; s < steps; s++) {
            const nx = x + Math.cos(ang) * 0.1, ny = y + Math.sin(ang) * 0.1;
            ang += (Math.random() - 0.5) * 1.1;
            [[x, y], [nx, ny]].forEach(pt => {
              pts.push(n.x * 0.506 + u.x * pt[0] + v.x * pt[1],
                       n.y * 0.506 + u.y * pt[0] + v.y * pt[1],
                       n.z * 0.506 + u.z * pt[0] + v.z * pt[1]);
            });
            x = nx; y = ny;
            if (Math.abs(x) > 0.46 || Math.abs(y) > 0.46) break;
          }
          a = (Math.random() - 0.5) * 0.7; b = 0.45 * (Math.random() < 0.5 ? -1 : 1);
        }
      });
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
      const lines = new T.LineSegments(g, new T.LineBasicMaterial({ color: 0x1d1d22 }));
      die.mesh.add(lines);
      die.cracks = lines;
    },

    dispose(die) {
      die.mats.forEach(m => m.dispose());
      if (die.cracks) { die.cracks.geometry.dispose(); die.cracks.material.dispose(); }
    }
  });
})();

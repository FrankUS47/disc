/* three.js 場景：燈光、托盤、黑色骰盅、相機 (自動依螢幕比例取景，手機直式也能完整顯示) */
(function () {
  'use strict';
  const D = window.Dice, CFG = D.CFG, T = window.THREE;

  function buildTray() {
    const g = new T.Group();
    const wood = new T.MeshStandardMaterial({ color: 0x3b2418, roughness: 0.6, metalness: 0.1 });
    const base = new T.Mesh(new T.CylinderGeometry(CFG.TRAY_R + 0.55, CFG.TRAY_R + 0.65, 0.5, 64), wood);
    base.position.y = -0.27; base.receiveShadow = true; g.add(base);
    const felt = new T.Mesh(new T.CircleGeometry(CFG.TRAY_R + 0.05, 64),
      new T.MeshStandardMaterial({ map: D.Tex.felt(), roughness: 1, metalness: 0 }));
    felt.rotation.x = -Math.PI / 2; felt.position.y = 0.002; felt.receiveShadow = true; g.add(felt);
    const rim = new T.Mesh(new T.TorusGeometry(CFG.TRAY_R + 0.12, 0.24, 16, 80), wood);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.06; rim.castShadow = true; rim.receiveShadow = true; g.add(rim);
    return g;
  }

  function buildCup() {
    const g = new T.Group();
    const pts = [[2.5, 0], [2.47, 1.0], [2.4, 3.0], [2.3, 4.6], [2.05, 5.15], [1.6, 5.35], [0.8, 5.42], [0, 5.44]]
      .map(p => new T.Vector2(p[0], p[1]));
    const body = new T.Mesh(new T.LatheGeometry(pts, 56),
      new T.MeshStandardMaterial({ color: 0x17171c, roughness: 0.35, metalness: 0.4, side: T.DoubleSide }));
    body.castShadow = true; g.add(body); g.userData.mesh = body;
    const gold = new T.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.8 });
    [[2.5, 0.1], [2.36, 4.35]].forEach(([r, y]) => {
      const ring = new T.Mesh(new T.TorusGeometry(r, 0.06, 12, 64), gold);
      ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring);
    });
    return g;
  }

  const clampN = (v, m) => Math.max(-m, Math.min(m, v));
  const S = (D.Scene = {
    wantR: 4.5, wantCy: 0.7, curR: 4.5, curCy: 0.7, el: 58 * Math.PI / 180,

    init(canvas, stage) {
      this.stage = stage;
      const r = (this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }));
      r.outputEncoding = T.sRGBEncoding;
      r.shadowMap.enabled = true;
      r.shadowMap.type = T.PCFSoftShadowMap;
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(38, 1, 0.5, 100);

      this.scene.add(new T.HemisphereLight(0xffffff, 0x445566, 0.75));
      const sun = (this.sun = new T.DirectionalLight(0xffffff, 1.05));
      sun.position.set(3.5, 12, 6);
      sun.castShadow = true;
      const mapSize = Math.min(window.innerWidth, window.innerHeight) < 600 ? 1024 : 2048;
      sun.shadow.mapSize.set(mapSize, mapSize);
      const sc = sun.shadow.camera;
      sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 30;
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
      this.scene.add(sun);
      const fill = new T.PointLight(0xffd9a0, 0.5, 40);
      fill.position.set(-6, 7, -4);
      this.scene.add(fill);

      this.tray = buildTray();
      this.cup = buildCup();
      this.cupMesh = this.cup.userData.mesh;
      const ground = new T.Mesh(new T.PlaneGeometry(60, 60), new T.ShadowMaterial({ opacity: 0.35 }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -0.62; ground.receiveShadow = true;
      this.scene.add(ground);
      this.cup.visible = false;
      this.diceLayer = new T.Group();
      this.scene.add(this.tray, this.cup, this.diceLayer);

      this.resize();
      window.addEventListener('resize', () => this.resize());
      if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(stage);
    },

    resize() {
      const w = this.stage.clientWidth || 300, h = this.stage.clientHeight || 300;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.placeCamera();
    },

    setCupMode(on) {
      this.cupMode = on;
      this.cup.visible = on;
      this.tray.position.set(0, 0, 0);
      this.wantR = on ? 6.3 : 4.4;
      this.wantCy = on ? 3.0 : 0.7;
    },

    /* 透明骰盅：可看到盅內骰子 */
    setClear(on) {
      this.clear = on;
      this.cupMesh.material.transparent = on;
      this.cupMesh.material.opacity = on ? 0.22 : 1;
      this.cupMesh.material.depthWrite = !on;
      this.cupMesh.material.needsUpdate = true;
      this.cupMesh.castShadow = !on;
    },

    placeCamera() {
      const cam = this.camera;
      const vf = cam.fov * Math.PI / 180;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect);
      const d = this.curR / Math.sin(Math.min(vf, hf) / 2);
      cam.position.set(0, this.curCy + d * Math.sin(this.el), d * Math.cos(this.el));
      cam.lookAt(0, this.curCy, 0);
    },

    /* 每幀：容器位置 → 托盤(無骰盅)或骰盅跟著動；lift 0=蓋住 1=掀開 */
    update(dt, cont, lift, cupped) {
      const k = 1 - Math.exp(-dt * 5);
      this.curR += (this.wantR - this.curR) * k;
      this.curCy += (this.wantCy - this.curCy) * k;
      this.placeCamera();

      const p = cont.pos, v = cont.vel || { x: 0, y: 0, z: 0 };
      this.tray.position.set(p.x, p.y, p.z);          // 骰盅模式：底座也跟著被拿起
      if (cupped) {
        const e = lift * lift * (3 - 2 * lift);
        this.cup.visible = lift < 0.999;
        const m = this.clear ? 0 : 0.5;
        const tz = clampN(-v.x * 0.012 * m, 0.12), tx = clampN(v.z * 0.012 * m, 0.12);
        this.cup.position.set(p.x, p.y + e * 9, p.z);
        this.cup.rotation.set(tx, 0, tz - e * 0.55);
      }
    },

    render() { this.renderer.render(this.scene, this.camera); }
  });
})();

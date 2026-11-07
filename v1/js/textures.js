/* 以 Canvas 繪製骰面貼圖 (點數面 / 自訂文字面 / 絨布) */
(function () {
  'use strict';
  const D = window.Dice, T = window.THREE;

  const S = 256;
  const faceCache = {};
  const textCache = new Map();

  const PIPS = {
    1: [[.5, .5]],
    2: [[.28, .28], [.72, .72]],
    3: [[.26, .26], [.5, .5], [.74, .74]],
    4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]],
    5: [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]],
    6: [[.3, .27], [.7, .27], [.3, .5], [.7, .5], [.3, .73], [.7, .73]]
  };

  function makeTexture(canvas) {
    const tex = new T.CanvasTexture(canvas);
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = 4;
    return tex;
  }

  function drawBase(ctx) {
    const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.25, S / 2, S / 2, S * 0.75);
    g.addColorStop(0, '#fcf8ec');
    g.addColorStop(0.75, '#f3eddb');
    g.addColorStop(1, '#d9d2bd');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }

  function pip(ctx, x, y, r, color) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, color.hi);
    g.addColorStop(1, color.lo);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }

  const BLACK = { hi: '#555', lo: '#0c0c10' };
  const RED = { hi: '#ff6b6b', lo: '#a4161a' };

  const Tex = (D.Tex = {
    /* 傳統 6 點面：1、4 為紅點 (亞洲風格) */
    face(value) {
      if (faceCache[value]) return faceCache[value];
      const c = document.createElement('canvas'); c.width = c.height = S;
      const ctx = c.getContext('2d');
      drawBase(ctx);
      const red = value === 1 || value === 4;
      const r = value === 1 ? S * 0.17 : S * 0.092;
      PIPS[value].forEach(p => pip(ctx, p[0] * S, p[1] * S, r, red ? RED : BLACK));
      return (faceCache[value] = makeTexture(c));
    },

    /* 自訂文字面 */
    text(label) {
      label = String(label);
      if (textCache.has(label)) return textCache.get(label);
      const c = document.createElement('canvas'); c.width = c.height = S;
      const ctx = c.getContext('2d');
      drawBase(ctx);
      const chars = Array.from(label);
      const lines = chars.length > 4 ? [chars.slice(0, Math.ceil(chars.length / 2)).join(''), chars.slice(Math.ceil(chars.length / 2)).join('')] : [label];
      const longest = Math.max(...lines.map(l => Array.from(l).length));
      const size = Math.max(28, Math.min(150, Math.floor(190 / Math.max(longest, 1.6)), lines.length > 1 ? 86 : 150));
      ctx.fillStyle = '#1e293b';
      ctx.font = `bold ${size}px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lh = size * 1.15, y0 = S / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((l, i) => ctx.fillText(l, S / 2, y0 + i * lh, S * 0.78));
      const tex = makeTexture(c);
      if (textCache.size > 200) {
        const k = textCache.keys().next().value;
        textCache.get(k).dispose(); textCache.delete(k);
      }
      textCache.set(label, tex);
      return tex;
    },

    /* 托盤絨布 */
    felt() {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#1f5a45'; ctx.fillRect(0, 0, 256, 256);
      const img = ctx.getImageData(0, 0, 256, 256), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 26;
        d[i] += n; d[i + 1] += n; d[i + 2] += n;
      }
      ctx.putImageData(img, 0, 0);
      const tex = makeTexture(c);
      tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(6, 6);
      return tex;
    }
  });
})();

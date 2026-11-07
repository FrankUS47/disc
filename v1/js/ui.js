/* 介面：按鈕、設定浮層、結果與紀錄顯示 */
(function () {
  'use strict';
  const D = window.Dice, G = D.Game, A = D.Audio, I = D.Input;
  const $ = (id) => document.getElementById(id);

  const MSG = {
    idle: (c) => c.cup ? '骰盅已蓋好：按住晃動，或點「擲骰子」' : '',
    lowering: () => '蓋上骰盅…',
    shaking: () => '搖骰中…',
    settling: () => '骰子正慢慢停下…',
    stacking: () => '骰盅裡傳來奇怪的聲音…',
    opening: () => '',
    done: (c) => c.covered ? '搖完了！點擊骰盅或按「開盅」' : (c.cup && c.clear ? '透明骰盅：可直接看到骰子' : '')
  };

  const UI = (D.UI = {
    init() {
      const el = {
        roll: $('rollBtn'), open: $('openBtn'), status: $('status'), hint: $('hint'),
        text: $('resultText'), note: $('resultNote'),
        sound: $('soundBtn'), settings: $('settingsBtn'),
        sheet: $('sheet'), backdrop: $('sheetBackdrop'), close: $('sheetClose'),
        countSeg: $('countSeg'), faces: $('faceCount'), minus: $('faceMinus'), plus: $('facePlus'),
        cup: $('cupToggle'), clear: $('clearToggle'), soundT: $('soundToggle'), tricks: $('tricksToggle'),
        inputs: $('faceInputs'), history: $('historyList'), motion: $('motionBtn')
      };

      /* 設定面板 */
      const showSheet = (v) => { el.sheet.hidden = !v; el.backdrop.hidden = !v; };
      el.settings.addEventListener('click', () => showSheet(true));
      el.close.addEventListener('click', () => showSheet(false));
      el.backdrop.addEventListener('click', () => showSheet(false));

      /* 骰子數量 */
      el.countSeg.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        [...el.countSeg.children].forEach(x => x.classList.toggle('on', x === b));
        G.applySettings({ count: parseInt(b.dataset.v, 10) });
      });

      /* 面數 */
      const setFaces = (n) => {
        n = Math.max(2, Math.min(20, n | 0 || 6));
        el.faces.value = n;
        G.applySettings({ faces: n });
        this.buildFaceInputs(el.inputs);
      };
      el.faces.addEventListener('change', () => setFaces(parseInt(el.faces.value, 10)));
      el.minus.addEventListener('click', () => setFaces(G.settings.faces - 1));
      el.plus.addEventListener('click', () => setFaces(G.settings.faces + 1));

      /* 開關 */
      el.cup.addEventListener('change', () => G.applySettings({ cup: el.cup.checked }));
      el.clear.addEventListener('change', () => G.applySettings({ clear: el.clear.checked }));
      el.tricks.addEventListener('change', () => { G.settings.tricks = el.tricks.checked; });
      const setSound = (on) => {
        A.setEnabled(on);
        el.soundT.checked = on;
        el.sound.textContent = on ? '🔊' : '🔇';
        el.sound.classList.toggle('on', on);
      };
      el.soundT.addEventListener('change', () => setSound(el.soundT.checked));
      el.sound.addEventListener('click', () => setSound(!A.enabled));

      /* 擲骰 / 開盅 */
      el.roll.addEventListener('click', () => { A.init(); G.rollButton(); el.hint.classList.add('hide'); });
      el.open.addEventListener('click', () => G.openCup());
      I.el.addEventListener('pointerdown', () => el.hint.classList.add('hide'));

      /* iOS 動作感應授權 */
      if (I.motionState === 'needs-permission' && navigator.maxTouchPoints > 0) {
        el.motion.hidden = false;
        el.motion.addEventListener('click', () => I.requestMotion().then(ok => { if (ok) el.motion.hidden = true; }));
      }

      /* 遊戲事件 */
      G.on('state', (s) => {
        const f = MSG[s.state]; el.status.textContent = f ? f(s) : '';
        el.open.hidden = !s.cup;
        el.open.classList.toggle('pulse', s.state === 'done' && s.covered);
        el.open.disabled = !(s.state === 'done' && s.covered);
        el.open.style.opacity = el.open.disabled ? 0.45 : 1;
      });
      G.on('result', (r) => {
        if (!r) { el.text.textContent = '準備擲骰…'; el.note.textContent = ''; return; }
        el.text.textContent = r.text; el.note.textContent = r.note || '';
      });
      G.on('history', (h) => {
        el.history.innerHTML = '';
        h.forEach(t => { const d = document.createElement('div'); d.textContent = t; el.history.appendChild(d); });
      });
      G.on('canopen', () => {});

      this.buildFaceInputs(el.inputs);
      G.setState(G.state);
    },

    buildFaceInputs(container) {
      const s = G.settings;
      container.innerHTML = '';
      for (let i = 0; i < s.faces; i++) {
        const inp = document.createElement('input');
        inp.type = 'text'; inp.value = s.meanings[i]; inp.dataset.i = i; inp.maxLength = 12;
        inp.addEventListener('input', () => {
          s.meanings[i] = inp.value || `${i + 1} 點`;
          G.refreshLabels();
        });
        container.appendChild(inp);
      }
    }
  });
})();

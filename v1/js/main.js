/* 進入點 */
(function () {
  'use strict';
  const D = window.Dice;
  window.addEventListener('DOMContentLoaded', () => {
    if (!window.THREE || !window.CANNON) {
      document.getElementById('status').textContent = '載入失敗：找不到 js/lib 內的函式庫';
      return;
    }
    D.Game.init(document.getElementById('gl'), document.getElementById('stage'));
    D.UI.init();
  });
})();

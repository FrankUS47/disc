/* 全域設定與可調參數 (所有數值集中在這裡，方便微調手感) */
(function () {
  'use strict';
  const D = (window.Dice = window.Dice || {});

  D.CFG = {
    // ---- 幾何 (世界單位：1 顆骰子邊長 = 1) ----
    TRAY_R: 3.5,        // 托盤視覺半徑
    PHYS_R_OPEN: 3.25,  // 無骰盅時，骰子可活動半徑
    PHYS_R_CUP: 2.2,    // 骰盅內半徑
    CUP_H: 5.45,
    CEIL_CUP: 3.4,      // 骰盅內天花板高度 (骰子最高跳到這)
    CEIL_OPEN: 9,
    WALL_H: 10,
    MAX_DICE: 4,

    // ---- 物理 ----
    GRAVITY: -34,
    MAX_V: 26,          // 容器(托盤/骰盅)最大移動速度 u/s
    MAX_BODY_V: 40,     // 單一剛體最大速度
    MAX_OFFSET: 1.6,    // 容器離中心最大位移
    RETURN_V: 2.5,      // 放開後容器回中心速度

    // ---- 力道換算 (power) ----
    PX_PER_POWER: 300,      // 滑鼠/觸控：300 px/s = power 1
    MOTION_PER_POWER: 2.5,  // 手機加速度：2.5 m/s² = power 1
    START_POWER: 1.2,       // 超過就視為開始搖骰
    STOP_POWER: 0.7,        // 低於就視為停止搖動

    // ---- 特技 ----
    // 特技必須「非常快 + 持續很久」：力道 >= SUSTAIN_POWER 的累積秒數(sustain)夠長才有機會，且機率很低
    SUSTAIN_POWER: 12,      // 超過這個力道才累積 sustain (滑鼠約 3600 px/s)
    STACK_SUSTAIN: 3.5,     // 疊骰：需累積秒數
    STACK_CHANCE: 0.05,     // 疊骰：達標後的機率 (僅骰盅、2 顆以上)
    STACK_SAME: 0.5,        // 疊起來全同點的機率
    CHIP_POWER: 15,         // 裂痕/缺角：力道門檻
    CHIP_SUSTAIN: 4,
    CHIP_RATE: 0.02,        // 每秒機率 = (力道-門檻) × 此值
    SHATTER_POWER: 18,      // 粉碎：力道門檻
    SHATTER_SUSTAIN: 5,
    SHATTER_RATE: 0.012,
    HOLD_Y: 1.6,            // 骰盅模式：搖骰時連底座一起拿起的高度
    HOLD_V: 3,
    SHARDS: 20
  };

  /* 立方體面順序 (對應 three.js BoxGeometry 材質 0..5：+x -x +y -y +z -z) */
  D.FACE_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  D.FACE_VALUE = [3, 4, 1, 6, 2, 5];   // 對面相加 = 7
})();

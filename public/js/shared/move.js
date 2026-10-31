// 伺服器與瀏覽器共用的移動物理（世界座標：x、y 為地面，z 向上）
// 兩邊跑同一份程式碼，客戶端預測才會和伺服器結果一致
(function (root) {
  'use strict';
  const M = {
    STEP: 1 / 60,      // 固定物理步長（秒）
    MAX_SPEED: 190,    // 輸入長度 1 時的世界速度（單位／秒）
    ACCEL: 13,         // 起步反應
    FRICTION: 16,      // 放開後減速
    R: 7,              // 角色腳下碰撞半徑（以正方形近似）
  };

  M.hits = function (obs, x, y, pad) {
    pad = pad || 0;
    for (let i = 0; i < obs.length; i++) {
      const o = obs[i];
      if (x + M.R + pad > o.x && x - M.R - pad < o.x + o.w && y + M.R + pad > o.y && y - M.R - pad < o.y + o.d) return true;
    }
    return false;
  };

  function moveAxis(p, isX, dist, obs, W, H) {
    if (!dist) return;
    const min = M.R, max = (isX ? W : H) - M.R;
    const cur = isX ? p.x : p.y;
    const free = v => !M.hits(obs, isX ? v : p.x, isX ? p.y : v);
    let target = cur + dist, blocked = false;
    if (target < min || target > max) { target = Math.min(max, Math.max(min, target)); blocked = true; }
    if (free(cur) && !free(target)) {
      let lo = cur, hi = target;   // 二分逼近：剛好貼齊障礙物
      for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (free(mid)) lo = mid; else hi = mid; }
      target = lo; blocked = true;
    }
    if (isX) { p.x = target; if (blocked) p.vx = 0; } else { p.y = target; if (blocked) p.vy = 0; }
  }

  // 推進一個固定步長；(ix, iy) 是世界座標的移動方向，長度 0～1（搖桿可小於 1）
  M.step = function (p, ix, iy, obs, W, H) {
    const dt = M.STEP;
    let m = Math.hypot(ix, iy);
    if (m > 1) { ix /= m; iy /= m; m = 1; }
    const moving = m > 0.05;
    const k = 1 - Math.exp(-(moving ? M.ACCEL : M.FRICTION) * dt);
    p.vx += (ix * M.MAX_SPEED - p.vx) * k;
    p.vy += (iy * M.MAX_SPEED - p.vy) * k;
    if (!moving && Math.hypot(p.vx, p.vy) < 3) { p.vx = 0; p.vy = 0; }
    moveAxis(p, true, p.vx * dt, obs, W, H);
    moveAxis(p, false, p.vy * dt, obs, W, H);
  };

  // 畫面方向（u 向右、v 向下，長度 0～1）→ 世界方向
  // 等角投影：畫面 x = 世界 x − y，畫面 y = (x + y) / 2
  // 換算後「畫面上」各方向速度一致（斜走與直走一樣快）
  M.screenToWorld = function (u, v) {
    const len = Math.hypot(u, v), m = Math.min(1, len);
    if (m < 0.05) return [0, 0];
    u /= len; v /= len;
    return [(v + u / 2) / Math.SQRT2 * m, (v - u / 2) / Math.SQRT2 * m];
  };
  // 網路傳輸用：-100～100 的整數
  M.quant = v => Math.max(-100, Math.min(100, Math.round(v * 100)));

  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else (root.BM = root.BM || {}).Move = M;
})(this);

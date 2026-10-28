// 伺服器與瀏覽器共用的移動物理：兩邊跑同一份程式碼，客戶端預測才會和伺服器結果一致
(function (root) {
  'use strict';
  const M = {
    STEP: 1 / 60,      // 固定物理步長（秒）
    MAX_SPEED: 135,    // 最高速度（像素/秒）
    ACCEL: 16,         // 起步加速的反應速度（越大越靈敏）
    FRICTION: 20,      // 放開按鍵後的減速
    FOOT_W: 10,        // 角色腳下碰撞範圍（半寬）
    FOOT_D: 6,         // 角色腳下碰撞範圍（半深）
    // 按鍵用位元表示，封包更小
    UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8,
  };

  M.hits = function (obstacles, x, y, pad) {
    pad = pad || 0;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (x + M.FOOT_W + pad > o.x && x - M.FOOT_W - pad < o.x + o.w &&
          y + M.FOOT_D + pad > o.y && y - M.FOOT_D - pad < o.y + o.d) return true;
    }
    return false;
  };

  function moveAxis(p, isX, dist, obstacles, W, H) {
    if (!dist) return;
    const min = isX ? M.FOOT_W : M.FOOT_D + 2, max = isX ? W - M.FOOT_W : H - M.FOOT_D;
    const cur = isX ? p.x : p.y;
    const free = v => !M.hits(obstacles, isX ? v : p.x, isX ? p.y : v);
    let target = cur + dist, blocked = false;
    if (target < min || target > max) { target = Math.min(max, Math.max(min, target)); blocked = true; }
    if (free(cur) && !free(target)) {
      // 二分逼近：剛好貼齊障礙物，不會隔一段距離就停住
      let lo = cur, hi = target;
      for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (free(mid)) lo = mid; else hi = mid; }
      target = lo; blocked = true;
    }
    if (isX) { p.x = target; if (blocked) p.vx = 0; } else { p.y = target; if (blocked) p.vy = 0; }
  }

  // 推進一個固定步長；p 需要 x, y, vx, vy, facing
  M.step = function (p, mask, obstacles, W, H) {
    const dt = M.STEP;
    let ix = ((mask & M.RIGHT) ? 1 : 0) - ((mask & M.LEFT) ? 1 : 0);
    let iy = ((mask & M.DOWN) ? 1 : 0) - ((mask & M.UP) ? 1 : 0);
    if (ix && iy) { ix *= Math.SQRT1_2; iy *= Math.SQRT1_2; }
    if (ix) p.facing = ix > 0 ? 1 : -1;
    const tx = ix * M.MAX_SPEED, ty = iy * M.MAX_SPEED;
    const kx = 1 - Math.exp(-(ix ? M.ACCEL : M.FRICTION) * dt);
    const ky = 1 - Math.exp(-(iy ? M.ACCEL : M.FRICTION) * dt);
    p.vx += (tx - p.vx) * kx;
    p.vy += (ty - p.vy) * ky;
    if (!ix && Math.abs(p.vx) < 2) p.vx = 0;
    if (!iy && Math.abs(p.vy) < 2) p.vy = 0;
    moveAxis(p, true, p.vx * dt, obstacles, W, H);
    moveAxis(p, false, p.vy * dt, obstacles, W, H);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else root.Move = M;
})(this);

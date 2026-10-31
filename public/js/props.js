// 城市美術：地面（預先畫成一張大圖）與各種物件的精靈圖
(function (root) {
  'use strict';
  const BM = root.BM = root.BM || {};
  const I = BM.Iso;
  const { P, poly, box, quadX, quadY, quadZ, onWall, shade, rng, FONT } = I;

  const ISLAND = 46;            // 城市地塊側面厚度
  const MARGIN = 260;           // 地圖外圍留白（天空）

  // 地圖在畫面座標的範圍
  function extents(C) {
    return { minX: -C.H - MARGIN, maxX: C.W + MARGIN, minY: -MARGIN - 120, maxY: (C.W + C.H) / 2 + ISLAND + MARGIN };
  }

  // ======================================================================
  // 地面
  // ======================================================================
  const TILE = {
    grass: '#8fd16a', walk: '#e9e1d2', road: '#5d6472', roadMidA: '#5d6472', roadMidB: '#5d6472', cross: '#5d6472',
    zebraA: '#5d6472', zebraB: '#5d6472', path: '#e2cfa8', apron: '#d9cbe8', plaza: '#efe2c9', dirt: '#c69a6b', lot: '#d8c9a3',
  };
  function paintGround(g, C, quality) {
    const T = C.T, r = rng(20261031);
    const ex = extents(C);
    // 天空
    const sky = g.createLinearGradient(0, ex.minY, 0, ex.maxY);
    sky.addColorStop(0, '#bfe7ff'); sky.addColorStop(0.55, '#e3f4ff'); sky.addColorStop(1, '#f9e9ff');
    g.fillStyle = sky; g.fillRect(ex.minX, ex.minY, ex.maxX - ex.minX, ex.maxY - ex.minY);
    for (let i = 0; i < 16; i++) {   // 雲
      const cx = ex.minX + r() * (ex.maxX - ex.minX), cy = ex.minY + r() * (ex.maxY - ex.minY), s = 24 + r() * 30;
      g.fillStyle = 'rgba(255,255,255,.7)';
      for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(cx + k * s * 0.7, cy + (k % 2) * -s * 0.25, s, s * 0.55, 0, 0, Math.PI * 2); g.fill(); }
    }
    // 地塊側面（+x 與 +y 兩側）
    const sideLayers = [[0, 8, '#6fb14e'], [8, 24, '#a5784e'], [24, ISLAND, '#8a6240']];
    for (const [z0, z1, col] of sideLayers) {
      quadY(g, 0, C.W, C.H, -z1, -z0, shade(col, 0.95));
      quadX(g, C.W, 0, C.H, -z1, -z0, shade(col, 0.78));
    }
    for (let i = 0; i < 90; i++) {   // 側面的石頭
      const t = r(), z = -12 - r() * 30;
      if (i % 2) quadY(g, t * C.W, t * C.W + 6, C.H, z, z + 4, 'rgba(0,0,0,.12)');
      else quadX(g, C.W, t * C.H, t * C.H + 6, z, z + 4, 'rgba(0,0,0,.12)');
    }
    const lip = g.createLinearGradient(0, 0, 0, 1);

    // 磁磚
    for (let ty = 0; ty < C.ROWS; ty++) for (let tx = 0; tx < C.COLS; tx++) {
      const k = C.terrain(tx, ty), x = tx * T, y = ty * T;
      let base = TILE[k] || TILE.grass;
      const v = (r() - 0.5) * 0.06;
      quadZ(g, x, y, x + T, y + T, 0, shade(base, 1 + v), null);
    }
    // 細節
    for (let ty = 0; ty < C.ROWS; ty++) for (let tx = 0; tx < C.COLS; tx++) {
      const k = C.terrain(tx, ty), x = tx * T, y = ty * T;
      if (k === 'grass') {
        const n = quality > 1 ? 7 : 4;
        for (let i = 0; i < n; i++) {
          const [sx, sy] = P(x + r() * T, y + r() * T, 0);
          g.strokeStyle = r() < 0.5 ? 'rgba(60,130,50,.45)' : 'rgba(230,255,190,.55)'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(sx - 1.5, sy); g.lineTo(sx, sy - 3); g.lineTo(sx + 1.5, sy); g.stroke();
        }
        if (r() < 0.12) {
          const [sx, sy] = P(x + r() * T, y + r() * T, 0);
          g.fillStyle = ['#ffffff', '#ffe066', '#ff8fab', '#c3a6ff'][Math.floor(r() * 4)];
          g.beginPath(); g.arc(sx, sy, 1.8, 0, Math.PI * 2); g.fill();
        }
      } else if (k === 'walk' || k === 'apron' || k === 'plaza' || k === 'path') {
        g.strokeStyle = k === 'apron' ? 'rgba(90,70,130,.18)' : 'rgba(120,100,70,.22)'; g.lineWidth = 0.8;
        const n = k === 'path' ? 1 : 2;
        for (let i = 1; i < n + (k === 'path' ? 0 : 0); i++) {}
        poly(g, [P(x, y, 0), P(x + T, y, 0), P(x + T, y + T, 0), P(x, y + T, 0)], null, g.strokeStyle, 0.8);
        if (k !== 'path') {
          g.beginPath(); const a = P(x + T / 2, y, 0), b = P(x + T / 2, y + T, 0), c = P(x, y + T / 2, 0), d = P(x + T, y + T / 2, 0);
          g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.moveTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.stroke();
        }
        if (k === 'apron' && (tx + ty) % 2 === 0) quadZ(g, x, y, x + T, y + T, 0, 'rgba(120,90,180,.10)');
      } else if (k === 'dirt') {
        for (let i = 0; i < 6; i++) { const [sx, sy] = P(x + r() * T, y + r() * T, 0); g.fillStyle = r() < 0.5 ? 'rgba(90,60,30,.25)' : 'rgba(255,240,210,.3)'; g.fillRect(sx, sy, 2.4, 1.4); }
      } else if (k === 'lot') {
        for (let i = 0; i < 5; i++) { const [sx, sy] = P(x + r() * T, y + r() * T, 0); g.fillStyle = 'rgba(120,100,70,.25)'; g.fillRect(sx, sy, 1.6, 1.6); }
      }
    }
    // 道路標線
    const y15 = 15 * T, x18 = 18 * T;
    for (let tx = 0; tx < C.COLS; tx++) {
      const k = C.terrain(tx, 15);
      if (k === 'roadMidA') quadZ(g, tx * T + 6, y15 + 14, tx * T + 22, y15 + 18, 0.1, '#ffe08a');
    }
    for (let ty = 0; ty < C.ROWS; ty++) {
      const k = C.terrain(18, ty);
      if (k === 'roadMidB') quadZ(g, x18 + 14, ty * T + 6, x18 + 18, ty * T + 22, 0.1, '#ffe08a');
    }
    // 斑馬線
    for (const tx of [7, 8]) for (let s = 0; s < 6; s++) quadZ(g, tx * T + 4 + (s % 2) * 0, 14 * T + 6 + s * 15, tx * T + 28, 14 * T + 14 + s * 15, 0.1, s % 2 ? 'transparent' : 'rgba(255,255,255,.9)');
    for (const ty of [21, 22]) for (let s = 0; s < 6; s++) if (!(s % 2)) quadZ(g, 17 * T + 6 + s * 15, ty * T + 4, 17 * T + 14 + s * 15, ty * T + 28, 0.1, 'rgba(255,255,255,.9)');
    for (const tx of [7, 8]) for (let s = 0; s < 6; s += 2) quadZ(g, tx * T + 4, 14 * T + 6 + s * 15, tx * T + 28, 14 * T + 14 + s * 15, 0.1, 'rgba(255,255,255,.9)');
    // 人行道路緣（靠馬路那一側的邊）
    const curb = 'rgba(80,80,90,.45)';
    for (let tx = 0; tx < C.COLS; tx++) {
      if (C.terrain(tx, 13) === 'walk') quadZ(g, tx * T, 14 * T - 2, tx * T + T, 14 * T, 0.2, curb);
      if (C.terrain(tx, 17) === 'walk') quadZ(g, tx * T, 17 * T, tx * T + T, 17 * T + 2, 0.2, curb);
    }
    for (let ty = 0; ty < C.ROWS; ty++) {
      if (C.terrain(16, ty) === 'walk') quadZ(g, 17 * T - 2, ty * T, 17 * T, ty * T + T, 0.2, curb);
      if (C.terrain(20, ty) === 'walk') quadZ(g, 20 * T, ty * T, 20 * T + 2, ty * T + T, 0.2, curb);
    }
    // 中央廣場的圓形花紋
    const fc = C.objects.find(o => o.type === 'fountain');
    if (fc) {
      const cx = fc.x + fc.w / 2, cy = fc.y + fc.d / 2;
      [['rgba(255,166,120,.45)', 96], ['rgba(255,214,102,.5)', 84], ['rgba(110,170,220,.45)', 72]].forEach(([col, rr]) => I.floorEllipse(g, cx, cy, 0.2, rr, null, col, 6));
    }
    // 建築預定地的繩子
    const stakes = C.objects.filter(o => o.type === 'stake').map(o => [o.x + o.w / 2, o.y + o.d / 2]);
    if (stakes.length === 4) {
      const [a, b, c, d] = stakes; g.setLineDash([5, 4]); g.strokeStyle = '#e74c3c'; g.lineWidth = 1.2;
      g.beginPath(); for (const [p, q] of [[a, b], [b, d], [d, c], [c, a]]) { const s = P(p[0], p[1], 3), e = P(q[0], q[1], 3); g.moveTo(s[0], s[1]); g.lineTo(e[0], e[1]); } g.stroke(); g.setLineDash([]);
    }
    // 平面物件（台階）
    for (const o of C.objects) if (o.type === 'steps') {
      box(g, o.x - 4, o.y, 0, o.w + 8, o.d, 2, '#cfc6d8', { lw: 0.6 });
      box(g, o.x, o.y, 2, o.w, o.d * 0.55, 2, '#ddd5e6', { lw: 0.6 });
    }
  }

  // ======================================================================
  // 物件精靈圖
  // ======================================================================
  const H = { undercover: 128, tree: 74, lamp: 58, bench: 14, planter: 16, vending: 34, hydrant: 14, signpost: 64, fountain: 30, bush: 22, board: 44, barrier: 14, crane: 220, bricks: 18, mixer: 26, cone: 12, lotsign: 40, stake: 14 };

  function make(o, scale) {
    const f = DRAW[o.type];
    if (!f) return null;
    const hTop = (o.type === 'undercover' ? 128 + 120 : H[o.type] || 30) + 10;
    const m = o.type === 'undercover' ? [30, 80, 30, 80] : o.type === 'crane' ? [20, 120, 20, 30] : o.type === 'signpost' || o.type === 'lotsign' ? [20, 60, 20, 60] : [16, 30, 16, 30];
    const s = I.sprite({ x: o.x, y: o.y, w: o.w, d: o.d, h: hTop }, scale, m, g => f(g, o));
    return s;
  }

  // ---------- 誰是臥底（偵探社造型） ----------
  function undercover(g, o) {
    const x0 = o.x, y0 = o.y, w = o.w, d = o.d, x1 = x0 + w, y1 = y0 + d, Hh = o.h;
    const wall = '#9a8cde', trim = '#3d2f6b', gold = '#ffcf5a', brick = '#7d6cc9';
    const r = rng(77);
    // 基座
    box(g, x0 - 6, y0 - 6, 0, w + 12, d + 12, 7, '#b8aecb');
    // 一樓（磚）與二樓（灰泥）
    box(g, x0, y0, 7, w, d, 58, brick);
    box(g, x0, y0, 65, w, d, Hh - 65, wall);
    // 磚紋
    g.lineWidth = 0.6;
    for (let z = 11; z < 64; z += 6) {
      quadY(g, x0, x1, y1, z, z + 0.6, 'rgba(40,20,80,.18)');
      quadX(g, x1, y0, y1, z, z + 0.6, 'rgba(40,20,80,.22)');
    }
    // 樓層腰帶與屋簷
    box(g, x0 - 3, y0 - 3, 62, w + 6, d + 6, 6, trim);
    box(g, x0 - 5, y0 - 5, Hh, w + 10, d + 10, 6, trim);
    // 女兒牆
    const pz = Hh + 6;
    box(g, x0 - 5, y0 - 5, pz, w + 10, 6, 10, wall);
    box(g, x0 - 5, y0 - 5, pz, 6, d + 10, 10, wall);
    quadZ(g, x0 + 1, y0 + 1, x1 + 5, y1 + 5, pz, shade('#5b4b8a', 1.05));
    box(g, x0 - 5, y1 - 1, pz, w + 10, 6, 10, wall);
    box(g, x1 - 1, y0 - 5, pz, 6, d + 10, 10, wall);

    // ---- 窗戶 ----
    const winY = (xa, xb, za, zb, kind) => {
      quadY(g, xa - 3, xb + 3, y1 + 0.2, za - 3, zb + 3, trim);
      const [ax, ay] = P(xa, y1, zb), [bx, by] = P(xb, y1, za);
      const grd = g.createLinearGradient(ax, ay, bx, by);
      grd.addColorStop(0, '#fff1b8'); grd.addColorStop(1, '#ffc75a');
      quadY(g, xa, xb, y1 + 0.4, za, zb, grd);
      if (kind === 'shadow') onWall(g, 'y', xa, y1 + 0.5, zb, gg => { gg.fillStyle = 'rgba(40,25,70,.75)'; gg.beginPath(); gg.arc((xb - xa) * 0.5, (zb - za) * 0.45, 7, 0, Math.PI * 2); gg.fill(); gg.fillRect((xb - xa) * 0.5 - 9, (zb - za) * 0.45 + 6, 18, 30); gg.fillRect((xb - xa) * 0.5 - 13, (zb - za) * 0.45 - 9, 26, 3); gg.fillRect((xb - xa) * 0.5 - 7, (zb - za) * 0.45 - 16, 14, 8); });
      if (kind === 'q') onWall(g, 'y', xa, y1 + 0.5, zb, gg => { gg.font = `900 24px ${FONT}`; gg.fillStyle = '#7c3aed'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText('?', (xb - xa) / 2, (zb - za) / 2 + 1); });
      quadY(g, (xa + xb) / 2 - 1, (xa + xb) / 2 + 1, y1 + 0.6, za, zb, trim);
      quadY(g, xa, xb, y1 + 0.6, (za + zb) / 2 - 1, (za + zb) / 2 + 1, trim);
      box(g, xa - 5, y1, za - 6, xb - xa + 10, 5, 3, '#c9bfe0', { lw: 0.5 });   // 窗台
      // 花箱
      box(g, xa - 2, y1, za - 13, xb - xa + 4, 6, 7, '#8b5a2b', { lw: 0.5 });
      for (let i = 0; i < 6; i++) { const [sx, sy] = P(xa + 2 + i * (xb - xa) / 5.5, y1 + 3, za - 5); g.fillStyle = ['#ff6b8a', '#ffd166', '#ffffff'][i % 3]; g.beginPath(); g.arc(sx, sy, 2.3, 0, Math.PI * 2); g.fill(); }
    };
    const winX = (ya, yb, za, zb, kind) => {
      quadX(g, x1 + 0.2, ya - 3, yb + 3, za - 3, zb + 3, trim);
      const [ax, ay] = P(x1, ya, zb), [bx, by] = P(x1, yb, za);
      const grd = g.createLinearGradient(ax, ay, bx, by);
      grd.addColorStop(0, '#fff1b8'); grd.addColorStop(1, '#ffb64a');
      quadX(g, x1 + 0.4, ya, yb, za, zb, grd);
      if (kind === 'q') onWall(g, 'x', x1 + 0.5, yb, zb, gg => { gg.font = `900 24px ${FONT}`; gg.fillStyle = '#7c3aed'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText('?', (yb - ya) / 2, (zb - za) / 2 + 1); });
      quadX(g, x1 + 0.6, (ya + yb) / 2 - 1, (ya + yb) / 2 + 1, za, zb, trim);
      quadX(g, x1 + 0.6, ya, yb, (za + zb) / 2 - 1, (za + zb) / 2 + 1, trim);
      box(g, x1, ya - 5, za - 6, 5, yb - ya + 10, 3, '#c9bfe0', { lw: 0.5 });
    };
    winY(x0 + 22, x0 + 66, 22, 52, 'shadow'); winY(x1 - 66, x1 - 22, 22, 52, 'q');
    winY(x0 + 22, x0 + 62, 78, 110); winY(x1 - 62, x1 - 22, 78, 110, 'q');
    winX(y0 + 22, y0 + 66, 22, 52); winX(y0 + 96, y0 + 140, 22, 52, 'q'); winX(y1 - 60, y1 - 22, 22, 52);
    winX(y0 + 22, y0 + 66, 78, 110, 'q'); winX(y0 + 96, y0 + 140, 78, 110); winX(y1 - 60, y1 - 22, 78, 110);

    // ---- 大門（在 +y 面，門口感應區正後方） ----
    const dx0 = x0 + 118, dx1 = x0 + 170, dz = 58;
    onWall(g, 'y', dx0 - 8, y1 + 0.3, dz + 8, gg => {
      gg.fillStyle = trim; gg.beginPath(); gg.moveTo(0, 66); gg.lineTo(0, 22); gg.arc(34, 22, 34, Math.PI, 0); gg.lineTo(68, 66); gg.closePath(); gg.fill();
      const lg = gg.createLinearGradient(0, 8, 0, 66); lg.addColorStop(0, '#fff6c8'); lg.addColorStop(1, '#ffcf5a');
      gg.fillStyle = lg; gg.beginPath(); gg.moveTo(6, 66); gg.lineTo(6, 24); gg.arc(34, 24, 28, Math.PI, 0); gg.lineTo(62, 66); gg.closePath(); gg.fill();
      // 雙開木門（半開）
      gg.fillStyle = '#7a4a26'; gg.fillRect(8, 30, 14, 36); gg.fillRect(46, 30, 14, 36);
      gg.fillStyle = '#a0683a'; gg.fillRect(10, 33, 10, 14); gg.fillRect(48, 33, 10, 14); gg.fillRect(10, 50, 10, 13); gg.fillRect(48, 50, 10, 13);
      gg.fillStyle = gold; gg.beginPath(); gg.arc(19, 49, 1.6, 0, Math.PI * 2); gg.arc(49, 49, 1.6, 0, Math.PI * 2); gg.fill();
      // 門內的放大鏡剪影
      gg.strokeStyle = 'rgba(120,70,20,.55)'; gg.lineWidth = 3; gg.beginPath(); gg.arc(34, 36, 8, 0, Math.PI * 2); gg.stroke();
      gg.beginPath(); gg.moveTo(40, 42); gg.lineTo(47, 50); gg.stroke();
    });
    // 雨遮（條紋）
    const az0 = dz + 14, ax0 = dx0 - 16, ax1 = dx1 + 16;
    const stripes = 8;
    for (let i = 0; i < stripes; i++) {
      const xa = ax0 + (ax1 - ax0) * i / stripes, xb = ax0 + (ax1 - ax0) * (i + 1) / stripes;
      poly(g, [P(xa, y1, az0), P(xb, y1, az0), P(xb, y1 + 18, az0 - 9), P(xa, y1 + 18, az0 - 9)], i % 2 ? '#ffffff' : '#e8505b', 'rgba(80,20,30,.35)', 0.5);
    }
    for (let i = 0; i < stripes; i++) {
      const xa = ax0 + (ax1 - ax0) * i / stripes, xb = ax0 + (ax1 - ax0) * (i + 1) / stripes;
      onWall(g, 'y', xa, y1 + 18, az0 - 9, gg => { gg.fillStyle = i % 2 ? '#f3f3f3' : '#c63c47'; gg.beginPath(); gg.moveTo(0, 0); gg.lineTo(xb - xa, 0); gg.lineTo((xb - xa) / 2, 6); gg.closePath(); gg.fill(); });
    }
    // 門口兩側壁燈
    for (const lx of [dx0 - 12, dx1 + 12]) {
      box(g, lx - 3, y1, 44, 6, 4, 9, '#2f2a3d', { lw: 0.5 });
      const [sx, sy] = P(lx, y1 + 3, 48);
      const gl = g.createRadialGradient(sx, sy, 0, sx, sy, 16); gl.addColorStop(0, 'rgba(255,230,140,.75)'); gl.addColorStop(1, 'rgba(255,230,140,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(sx, sy, 16, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(sx, sy, 3, 0, Math.PI * 2); g.fill();
    }

    // ---- 招牌（+y 面，二樓中間）----
    const sx0 = x0 + 84, sx1 = x1 - 84, sz1 = 116, sz0 = 76;
    box(g, sx0, y1, sz0, sx1 - sx0, 5, sz1 - sz0, '#2b2050', { lw: 0.8 });
    onWall(g, 'y', sx0, y1 + 5.2, sz1, gg => {
      const W2 = sx1 - sx0, H2 = sz1 - sz0;
      gg.strokeStyle = gold; gg.lineWidth = 2; I.roundRect(gg, 3, 3, W2 - 6, H2 - 6, 4); gg.stroke();
      // 放大鏡圖示
      gg.strokeStyle = gold; gg.lineWidth = 3.2; gg.beginPath(); gg.arc(19, H2 / 2 - 2, 8, 0, Math.PI * 2); gg.stroke();
      gg.beginPath(); gg.moveTo(25, H2 / 2 + 4); gg.lineTo(31, H2 / 2 + 11); gg.stroke();
      gg.fillStyle = 'rgba(160,220,255,.5)'; gg.beginPath(); gg.arc(19, H2 / 2 - 2, 6.5, 0, Math.PI * 2); gg.fill();
      gg.font = `900 22px ${FONT}`; gg.textAlign = 'center'; gg.textBaseline = 'middle';
      gg.lineWidth = 4; gg.strokeStyle = '#140c2e'; gg.strokeText('誰是臥底', W2 / 2 + 12, H2 / 2 + 1);
      gg.fillStyle = '#ffe9a0'; gg.fillText('誰是臥底', W2 / 2 + 12, H2 / 2 + 1);
      gg.font = `900 15px ${FONT}`; gg.fillStyle = '#ff8fab'; gg.fillText('?', W2 - 11, 12);
    });
    // +x 面的大問號壁畫
    onWall(g, 'x', x1 + 0.4, y1 - 70, 110, gg => {});

    // ---- 屋頂：巨大偵探帽、放大鏡、霓虹問號 ----
    const roofZ = pz;
    // 屋頂設備
    box(g, x0 + 200, y0 + 20, roofZ, 34, 26, 14, '#b9b3c9');
    box(g, x0 + 206, y0 + 26, roofZ + 14, 22, 14, 4, '#8f88a5');
    // 偵探帽（螢幕對齊的造型）
    {
      const [cx, cy] = P(x0 + 92, y0 + 92, roofZ + 2);
      g.save(); g.translate(cx, cy);
      g.fillStyle = 'rgba(20,10,40,.25)'; g.beginPath(); g.ellipse(6, 4, 60, 18, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6b4f2a'; g.beginPath(); g.ellipse(0, -4, 58, 17, 0, 0, Math.PI * 2); g.fill();   // 帽簷
      const hg = g.createLinearGradient(-40, -60, 40, 0); hg.addColorStop(0, '#c8a46a'); hg.addColorStop(1, '#8b6b3f');
      g.fillStyle = hg; g.beginPath(); g.ellipse(0, -8, 40, 14, 0, 0, Math.PI); g.lineTo(-40, -8); g.bezierCurveTo(-40, -62, 40, -62, 40, -8); g.closePath(); g.fill();
      g.strokeStyle = '#5a4022'; g.lineWidth = 1.5; g.stroke();
      g.save(); g.clip();
      g.strokeStyle = 'rgba(90,50,20,.35)'; g.lineWidth = 2;
      for (let i = -50; i < 50; i += 10) { g.beginPath(); g.moveTo(i, -60); g.lineTo(i + 20, 0); g.stroke(); g.beginPath(); g.moveTo(i + 20, -60); g.lineTo(i, 0); g.stroke(); }
      g.restore();
      g.fillStyle = '#5a4022'; g.beginPath(); g.ellipse(0, -16, 41, 6, 0, 0, Math.PI); g.fill();       // 帽帶
      g.fillStyle = '#8b6b3f'; g.beginPath(); g.ellipse(0, -52, 7, 4, 0, 0, Math.PI * 2); g.fill();    // 頂鈕
      g.fillStyle = '#7a5b30'; g.beginPath(); g.ellipse(-36, 2, 9, 13, 0.4, 0, Math.PI * 2); g.fill(); // 耳罩
      g.beginPath(); g.ellipse(36, 2, 9, 13, -0.4, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    // 巨大放大鏡（立在屋頂右前方）
    {
      const [bx, by] = P(x1 - 70, y0 + 120, roofZ);
      g.save(); g.translate(bx, by);
      g.fillStyle = 'rgba(20,10,40,.25)'; g.beginPath(); g.ellipse(14, 2, 26, 7, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#4a2d14'; g.lineWidth = 11; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(20, -46); g.stroke();
      g.strokeStyle = '#8b5a2b'; g.lineWidth = 7; g.beginPath(); g.moveTo(0, 0); g.lineTo(20, -46); g.stroke();
      const cx = 36, cy = -88, rr = 38;
      g.fillStyle = '#c99a2e'; g.beginPath(); g.arc(cx, cy, rr + 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffd86b'; g.beginPath(); g.arc(cx - 1, cy - 1, rr + 5, 0, Math.PI * 2); g.fill();
      const lg = g.createRadialGradient(cx - 12, cy - 14, 4, cx, cy, rr);
      lg.addColorStop(0, 'rgba(255,255,255,.95)'); lg.addColorStop(0.35, 'rgba(190,235,255,.8)'); lg.addColorStop(1, 'rgba(120,180,240,.75)');
      g.fillStyle = lg; g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill();
      g.font = `900 46px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(124,58,237,.85)'; g.fillText('?', cx + 2, cy + 3);
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, rr - 9, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
      g.restore();
    }
    // 霓虹問號
    for (const [qx, qy, s, col] of [[x0 + 40, y1 - 36, 30, '#ff6fa8'], [x1 - 36, y1 - 26, 24, '#5fd3ff']]) {
      const [sx, sy] = P(qx, qy, roofZ + 4);
      g.save(); g.translate(sx, sy);
      g.strokeStyle = '#2b2050'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -10); g.stroke();
      g.font = `900 ${s}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.shadowColor = col; g.shadowBlur = 10; g.fillStyle = col; g.fillText('?', 0, -8);
      g.shadowBlur = 0; g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.strokeText('?', 0, -8);
      g.restore();
    }
  }

  // ---------- 樹 ----------
  function tree(g, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.d / 2, r = rng(o.seed || 1);
    const [sx, sy] = P(cx, cy, 0);
    g.fillStyle = 'rgba(20,40,20,.22)'; g.beginPath(); g.ellipse(sx + 4, sy + 2, 24, 11, 0, 0, Math.PI * 2); g.fill();
    box(g, cx - 3.5, cy - 3.5, 0, 7, 7, o.kind === 'pine' ? 20 : 26, '#8b5a2b');
    if (o.kind === 'pine') {
      const hue = 135 + r() * 15;
      for (let i = 0; i < 4; i++) {
        const z = 16 + i * 13, rw = 24 - i * 5, [ax, ay] = P(cx, cy, z + 24);
        const [lx, ly] = P(cx, cy, z);
        g.fillStyle = `hsl(${hue},40%,${24 + i * 2}%)`; g.beginPath(); g.ellipse(lx, ly, rw, rw * 0.45, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = `hsl(${hue},42%,${36 + i * 3}%)`; g.beginPath(); g.moveTo(lx - rw, ly); g.lineTo(ax, ay); g.lineTo(lx, ly + rw * 0.45); g.closePath(); g.fill();
        g.fillStyle = `hsl(${hue},45%,${27 + i * 3}%)`; g.beginPath(); g.moveTo(lx, ly + rw * 0.45); g.lineTo(ax, ay); g.lineTo(lx + rw, ly); g.closePath(); g.fill();
      }
      return;
    }
    const blossom = o.kind === 'blossom';
    const hue = blossom ? 340 : 95 + r() * 25;
    const [tx, ty] = P(cx, cy, 44);
    const blobs = [[0, 0, 23], [-15, 7, 16], [15, 7, 16], [-9, -12, 16], [10, -12, 15], [0, 13, 14]].map(([x, y, R]) => [x + (r() - 0.5) * 3, y + (r() - 0.5) * 3, R]);
    const L = blossom ? [[`hsl(${hue},55%,62%)`, 0], [`hsl(${hue},70%,74%)`, -3], [`hsl(${hue},80%,86%)`, -6]] : [[`hsl(${hue},45%,30%)`, 0], [`hsl(${hue},48%,40%)`, -3], [`hsl(${hue},55%,52%)`, -6]];
    g.fillStyle = blossom ? `hsl(${hue},40%,48%)` : `hsl(${hue},45%,20%)`; blobs.forEach(([x, y, R]) => { g.beginPath(); g.arc(tx + x, ty + y, R + 1.5, 0, Math.PI * 2); g.fill(); });
    L.forEach(([col, off], i) => { g.fillStyle = col; blobs.forEach(([x, y, R]) => { g.beginPath(); g.arc(tx + x + off * 0.6, ty + y + off, R * (1 - i * 0.22), 0, Math.PI * 2); g.fill(); }); });
    if (!blossom && r() < 0.5) { g.fillStyle = '#e74c3c'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(tx + (r() - 0.5) * 34, ty + (r() - 0.3) * 24, 2, 0, Math.PI * 2); g.fill(); } }
    if (blossom) { g.fillStyle = '#fff'; for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(tx + (r() - 0.5) * 36, ty + (r() - 0.4) * 26, 1.5, 0, Math.PI * 2); g.fill(); } }
  }

  // ---------- 街道家具 ----------
  function lamp(g, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.d / 2;
    const [sx, sy] = P(cx, cy, 0);
    g.fillStyle = 'rgba(20,20,40,.2)'; g.beginPath(); g.ellipse(sx + 3, sy + 1, 7, 3, 0, 0, Math.PI * 2); g.fill();
    box(g, cx - 3.5, cy - 3.5, 0, 7, 7, 4, '#3b3f4e');
    box(g, cx - 1.5, cy - 1.5, 4, 3, 3, 44, '#3b3f4e', { lw: 0.5 });
    box(g, cx - 5, cy - 5, 48, 10, 10, 2, '#3b3f4e');
    const [lx, ly] = P(cx, cy, 54);
    const gl = g.createRadialGradient(lx, ly, 0, lx, ly, 14); gl.addColorStop(0, 'rgba(255,240,170,.8)'); gl.addColorStop(1, 'rgba(255,240,170,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(lx, ly, 14, 0, Math.PI * 2); g.fill();
    box(g, cx - 4, cy - 4, 50, 8, 8, 7, '#fff4c2', { edge: '#c9a227', lw: 0.6 });
    box(g, cx - 5, cy - 5, 57, 10, 10, 2.5, '#3b3f4e');
  }
  function bench(g, o) {
    const wood = '#c98a4b', iron = '#3b3f4e';
    const alongX = o.along === 'x';
    if (alongX) {
      for (const lx of [o.x + 4, o.x + o.w - 8]) box(g, lx, o.y + 2, 0, 4, o.d - 4, 8, iron, { lw: 0.5 });
      box(g, o.x, o.y + 2, 8, o.w, o.d - 6, 2.5, wood);
      box(g, o.x, o.y, 10, o.w, 3, 9, wood);
    } else {
      for (const ly of [o.y + 4, o.y + o.d - 8]) box(g, o.x + 2, ly, 0, o.w - 4, 4, 8, iron, { lw: 0.5 });
      box(g, o.x + 4, o.y, 8, o.w - 6, o.d, 2.5, wood);
      box(g, o.x, o.y, 10, 3, o.d, 9, wood);
    }
  }
  function planter(g, o) {
    box(g, o.x, o.y, 0, o.w, o.d, 11, '#a0683a');
    quadZ(g, o.x + 2, o.y + 2, o.x + o.w - 2, o.y + o.d - 2, 11.1, '#6b4426');
    const r = rng(o.x * 7 + o.y);
    for (let i = 0; i < o.w / 7; i++) {
      const [sx, sy] = P(o.x + 4 + i * 7, o.y + o.d / 2 + (r() - 0.5) * 6, 13);
      g.fillStyle = '#3f8f3a'; g.beginPath(); g.arc(sx, sy, 4.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = o.flower || '#ff8fab'; g.beginPath(); g.arc(sx, sy - 2.5, 2.4, 0, Math.PI * 2); g.fill();
    }
  }
  function vending(g, o) {
    box(g, o.x, o.y, 0, o.w, o.d, 34, '#e74c3c');
    quadY(g, o.x + 3, o.x + o.w - 3, o.y + o.d + 0.2, 12, 31, '#d8f3ff');
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const [sx, sy] = P(o.x + 6 + i * 5.5, o.y + o.d + 0.4, 27 - j * 7); g.fillStyle = ['#ffd166', '#06d6a0', '#118ab2'][i]; g.fillRect(sx - 1.5, sy - 3, 3, 5); }
    quadY(g, o.x + 3, o.x + o.w - 3, o.y + o.d + 0.2, 3, 9, '#2b2b35');
  }
  function hydrant(g, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.d / 2;
    I.cylinder(g, cx, cy, 0, 4, 11, '#e74c3c');
    I.cylinder(g, cx, cy, 11, 3, 3, '#c0392b');
    box(g, cx - 6, cy - 1.5, 6, 12, 3, 3, '#c0392b', { lw: 0.5 });
  }
  function signpost(g, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.d / 2;
    box(g, cx - 2, cy - 2, 0, 4, 4, 62, '#5b4636');
    const [sx, sy] = P(cx, cy, 60);
    const lines = o.lines || [];
    g.font = `800 9px ${FONT}`; g.textBaseline = 'middle';
    lines.forEach((t, i) => {
      const left = t.startsWith('↖') || t.startsWith('↙');
      const y = sy + i * 13 + 2, w = g.measureText(t).width + 14;
      const x = left ? sx - w + 2 : sx - 2;
      g.fillStyle = ['#7c3aed', '#f39c12', '#16a085', '#2980b9'][i % 4];
      g.beginPath();
      if (left) { g.moveTo(x - 5, y); g.lineTo(x, y - 5.5); g.lineTo(x + w, y - 5.5); g.lineTo(x + w, y + 5.5); g.lineTo(x, y + 5.5); }
      else { g.moveTo(x, y - 5.5); g.lineTo(x + w, y - 5.5); g.lineTo(x + w + 5, y); g.lineTo(x + w, y + 5.5); g.lineTo(x, y + 5.5); }
      g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 0.6; g.stroke();
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(t, x + 6, y + 0.5);
    });
  }
  function fountain(g, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.d / 2, R = o.r || 42;
    const [sx, sy] = P(cx, cy, 0);
    const rx = R * Math.SQRT2, ry = rx / 2;
    g.fillStyle = '#9e978c'; g.beginPath(); g.ellipse(sx, sy, rx, ry, 0, 0, Math.PI); g.lineTo(sx - rx, sy - 12); g.ellipse(sx, sy - 12, rx, ry, 0, Math.PI, 0, true); g.fill();
    g.fillStyle = 'rgba(0,0,0,.1)'; for (let i = 0; i < 10; i++) { const a = Math.PI * i / 10; g.fillRect(sx + Math.cos(a) * rx - 0.6, sy + Math.sin(a) * ry - 12, 1.2, 12); }
    g.fillStyle = '#e8e0d0'; g.beginPath(); g.ellipse(sx, sy - 12, rx, ry, 0, 0, Math.PI * 2); g.fill();
    const wg = g.createRadialGradient(sx - 12, sy - 18, 3, sx, sy - 12, rx);
    wg.addColorStop(0, '#a5ecff'); wg.addColorStop(1, '#3a95d8');
    g.fillStyle = wg; g.beginPath(); g.ellipse(sx, sy - 11, rx - 8, ry - 5, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(sx, sy - 10, 16 + i * 13, 8 + i * 6.5, 0, 0.2, 2.8); g.stroke(); }
    I.cylinder(g, cx, cy, 12, 6, 14, '#d6cfc2');
    g.fillStyle = '#e8e0d0'; g.beginPath(); g.ellipse(sx, sy - 26, 18, 8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7fd3ff'; g.beginPath(); g.ellipse(sx, sy - 27, 14, 5.5, 0, 0, Math.PI * 2); g.fill();
  }
  function bush(g, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.d / 2, r = rng(o.seed || 3);
    const [sx, sy] = P(cx, cy, 12);
    g.fillStyle = 'rgba(20,40,20,.2)'; g.beginPath(); g.ellipse(sx + 3, sy + 12, 24, 10, 0, 0, Math.PI * 2); g.fill();
    for (const [c, off] of [['#3f8f3a', 0], ['#58ad4c', -2.5], ['#79c96a', -5]]) {
      g.fillStyle = c;
      for (const [x, y, R] of [[0, 0, 15], [-11, 4, 11], [11, 4, 11], [0, 7, 10]]) { g.beginPath(); g.arc(sx + x + off * 0.5, sy + y + off, R * (1 + off / 30), 0, Math.PI * 2); g.fill(); }
    }
    g.fillStyle = '#ff8fab'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(sx + (r() - 0.5) * 24, sy + (r() - 0.6) * 14, 1.8, 0, Math.PI * 2); g.fill(); }
  }
  function board(g, o) {
    for (const ly of [o.y + 4, o.y + o.d - 8]) box(g, o.x + 2, ly, 0, 4, 4, 30, '#5b4636', { lw: 0.5 });
    box(g, o.x, o.y, 18, o.w * 0.6, o.d, 24, '#8b5a2b');
    quadX(g, o.x + o.w * 0.6 + 0.2, o.y + 3, o.y + o.d - 3, 20, 40, '#d9b382');
    const r = rng(9);
    for (let i = 0; i < 5; i++) {
      const ya = o.y + 6 + i * 9.5, za = 23 + (i % 2) * 7;
      quadX(g, o.x + o.w * 0.6 + 0.4, ya, ya + 8, za, za + 9, ['#fff', '#ffe066', '#a5d8ff', '#ffc9de', '#d3f9d8'][i]);
    }
    onWall(g, 'x', o.x + o.w * 0.6 + 0.5, o.y + o.d - 2, 46, gg => { gg.font = `800 7px ${FONT}`; gg.fillStyle = '#5b4636'; gg.fillText(o.title || '', 4, 4); });
  }
  function barrier(g, o) {
    const stripes = 4, alongX = o.along === 'x';
    for (const t of [0.15, 0.85]) {
      const lx = alongX ? o.x + o.w * t - 1 : o.x + 1, ly = alongX ? o.y + 1 : o.y + o.d * t - 1;
      box(g, lx, ly, 0, 2, 2, 12, '#7f8c8d', { lw: 0.4 });
    }
    for (let i = 0; i < stripes; i++) {
      const col = i % 2 ? '#ffffff' : '#e74c3c';
      if (alongX) box(g, o.x + o.w * i / stripes, o.y, 7, o.w / stripes, o.d * 0.6, 5, col, { lw: 0.4 });
      else box(g, o.x, o.y + o.d * i / stripes, 7, o.w * 0.6, o.d / stripes, 5, col, { lw: 0.4 });
    }
  }
  function crane(g, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.d / 2, y = '#f5b700';
    box(g, o.x, o.y, 0, o.w, o.d, 8, '#7f8c8d');
    const mast = 190;
    for (let z = 8; z < mast; z += 14) {
      box(g, cx - 5, cy - 5, z, 10, 10, 1.6, y, { lw: 0.4 });
      const a = P(cx + 5, cy - 5, z), b = P(cx + 5, cy + 5, z + 14), c = P(cx - 5, cy + 5, z), d = P(cx + 5, cy + 5, z + 14);
      g.strokeStyle = shade(y, 0.75); g.lineWidth = 1; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.moveTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.stroke();
    }
    for (const [dx, dy] of [[-5, -5], [5, -5], [5, 5], [-5, 5]]) { const a = P(cx + dx, cy + dy, 8), b = P(cx + dx, cy + dy, mast); g.strokeStyle = y; g.lineWidth = 2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    // 吊臂（往 −y 方向伸出）
    box(g, cx - 4, cy - 120, mast, 8, 150, 6, y, { lw: 0.5 });
    box(g, cx - 7, cy + 18, mast - 6, 14, 14, 12, '#7f8c8d');
    box(g, cx - 6, cy - 6, mast + 6, 12, 12, 10, '#ecf0f1');
    const h0 = P(cx, cy - 100, mast), h1 = P(cx, cy - 100, 70);
    g.strokeStyle = '#333'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(h0[0], h0[1]); g.lineTo(h1[0], h1[1]); g.stroke();
    box(g, cx - 10, cy - 108, 50, 20, 16, 18, '#9a8cde');
  }
  function bricks(g, o) {
    box(g, o.x, o.y, 0, o.w, o.d, 4, '#a0683a');
    for (let k = 0; k < 3; k++) box(g, o.x + 3 + k, o.y + 3 + k, 4 + k * 5, o.w - 6 - k * 2, o.d - 6 - k * 2, 5, '#c0573e', { lw: 0.5 });
  }
  function mixer(g, o) {
    box(g, o.x, o.y + 4, 0, o.w, o.d - 8, 6, '#34495e');
    const [sx, sy] = P(o.x + o.w / 2, o.y + o.d / 2, 16);
    g.fillStyle = '#f39c12'; g.beginPath(); g.ellipse(sx, sy, 16, 11, -0.4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#b9770e'; g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.25)'; for (let i = -1; i <= 1; i++) { g.beginPath(); g.ellipse(sx + i * 6, sy - i * 2, 4, 10, -0.4, 0, Math.PI * 2); g.stroke(); }
  }
  function cone(g, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.d / 2;
    box(g, cx - 5, cy - 5, 0, 10, 10, 1.5, '#2d3436', { lw: 0.4 });
    const [bx, by] = P(cx, cy, 1.5), [tx, ty] = P(cx, cy, 13);
    g.fillStyle = '#ff7f2a'; g.beginPath(); g.moveTo(bx - 5, by); g.lineTo(tx, ty); g.lineTo(bx + 5, by); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(bx - 3.2, by - 4); g.lineTo(bx + 3.2, by - 4); g.lineTo(bx + 2.2, by - 7); g.lineTo(bx - 2.2, by - 7); g.closePath(); g.fill();
  }
  function lotsign(g, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.d / 2;
    for (const dx of [-24, 24]) box(g, cx + dx - 1.5, cy - 1.5, 0, 3, 3, 26, '#5b4636', { lw: 0.5 });
    const [sx, sy] = P(cx, cy, 40);
    const w = 96, h = 30;
    g.fillStyle = '#2d3436'; I.roundRect(g, sx - w / 2 + 2, sy + 2, w, h, 5); g.fill();
    g.fillStyle = '#ffd43b'; I.roundRect(g, sx - w / 2, sy, w, h, 5); g.fill();
    g.strokeStyle = '#2d3436'; g.lineWidth = 1.4; g.stroke();
    g.save(); I.roundRect(g, sx - w / 2, sy, w, 5, 2); g.clip();
    for (let i = -w; i < w; i += 8) { g.fillStyle = '#2d3436'; g.beginPath(); g.moveTo(sx + i, sy); g.lineTo(sx + i + 4, sy); g.lineTo(sx + i + 8, sy + 5); g.lineTo(sx + i + 4, sy + 5); g.fill(); }
    g.restore();
    g.fillStyle = '#2d3436'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 11px ${FONT}`; g.fillText(o.title || '', sx, sy + 13);
    g.font = `700 7px ${FONT}`; g.fillText(o.sub || '', sx, sy + 23);
  }
  function stake(g, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.d / 2;
    box(g, cx - 1.5, cy - 1.5, 0, 3, 3, 12, '#c98a4b', { lw: 0.4 });
    box(g, cx - 2, cy - 2, 9, 4, 4, 2, '#e74c3c', { lw: 0.4 });
  }

  const DRAW = { undercover, tree, lamp, bench, planter, vending, hydrant, signpost, fountain, bush, board, barrier, crane, bricks, mixer, cone, lotsign, stake };

  BM.Props = { paintGround, make, extents, ISLAND, MARGIN };
})(this);

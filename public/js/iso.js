// 等角投影與立體繪圖工具（城市、室內、角色共用）
// 世界座標：x、y 為地面，z 向上；畫面 x = x − y，畫面 y = (x + y) / 2 − z
(function (root) {
  'use strict';
  const BM = root.BM = root.BM || {};

  const P = (x, y, z) => [x - y, (x + y) / 2 - (z || 0)];

  // ---------- 顏色 ----------
  const rgbCache = new Map(), shadeCache = new Map();
  function rgb(hex) {
    let c = rgbCache.get(hex);
    if (!c) {
      const n = parseInt(hex.slice(1), 16);
      c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      rgbCache.set(hex, c);
    }
    return c;
  }
  // f < 1 變暗、f > 1 變亮（往白色混）
  function shade(hex, f, gray) {
    const key = hex + '|' + f + (gray ? 'g' : '');
    let s = shadeCache.get(key);
    if (s) return s;
    let [r, g, b] = rgb(hex);
    if (gray) { const l = Math.round(r * 0.3 + g * 0.59 + b * 0.11); r = g = b = Math.round(l * 0.85 + 30); }
    if (f <= 1) { r *= f; g *= f; b *= f; }
    else { const t = f - 1; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
    s = `rgb(${r | 0},${g | 0},${b | 0})`;
    shadeCache.set(key, s);
    return s;
  }
  function rgba(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }

  // ---------- 多邊形 ----------
  function poly(g, pts, fill, stroke, lw) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
  }

  // ---------- 與座標軸平行的方塊（建築、家具） ----------
  // 看得到三個面：頂面、+x 面（畫面右下）、+y 面（畫面左下）
  const LIGHT = { top: 1.06, left: 0.9, right: 0.74 };
  function box(g, x, y, z, w, d, h, color, o) {
    o = o || {};
    const c = o.colors || { top: shade(color, LIGHT.top), left: shade(color, LIGHT.left), right: shade(color, LIGHT.right) };
    const edge = o.edge === undefined ? shade(color, 0.55) : o.edge;
    const lw = o.lw || 0.8;
    if (!o.noLeft) poly(g, [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], c.left, edge, lw);
    if (!o.noRight) poly(g, [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], c.right, edge, lw);
    if (!o.noTop) poly(g, [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], c.top, edge, lw);
  }
  // 平面上的矩形
  const quadZ = (g, x0, y0, x1, y1, z, fill, stroke, lw) => poly(g, [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)], fill, stroke, lw);
  const quadY = (g, x0, x1, y, z0, z1, fill, stroke, lw) => poly(g, [P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)], fill, stroke, lw);
  const quadX = (g, x, y0, y1, z0, z1, fill, stroke, lw) => poly(g, [P(x, y0, z0), P(x, y1, z0), P(x, y1, z1), P(x, y0, z1)], fill, stroke, lw);

  // 在牆面上畫字或圖：把 [0,w]×[0,h] 的平面座標對應到牆上（左上角為原點）
  // face 'y'：牆面在 y = 常數（畫面左下那面），沿 +x 往右
  // face 'x'：牆面在 x = 常數（畫面右下那面），沿 −y 往右
  function onWall(g, face, x, y, zTop, fn) {
    g.save();
    const [ox, oy] = P(x, y, zTop);
    if (face === 'y') g.transform(1, 0.5, 0, 1, ox, oy);
    else g.transform(1, -0.5, 0, 1, ox, oy);
    fn(g);
    g.restore();
  }
  // 地面上的圖（沿 +x、+y）
  function onFloor(g, x, y, z, fn) {
    g.save();
    const [ox, oy] = P(x, y, z);
    g.transform(1, 0.5, -1, 0.5, ox, oy);
    fn(g);
    g.restore();
  }

  // 地面橢圓（圓在等角投影下的樣子）
  function floorEllipse(g, cx, cy, z, r, fill, stroke, lw) {
    const [sx, sy] = P(cx, cy, z);
    g.beginPath(); g.ellipse(sx, sy, r * Math.SQRT2, r * Math.SQRT2 / 2, 0, 0, Math.PI * 2);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
  }
  // 直立圓柱（側面＋頂面）
  function cylinder(g, cx, cy, z, r, h, color, o) {
    o = o || {};
    const [sx, sy0] = P(cx, cy, z), sy1 = sy0 - h, rx = r * Math.SQRT2, ry = r * Math.SQRT2 / 2;
    const grad = g.createLinearGradient(sx - rx, 0, sx + rx, 0);
    grad.addColorStop(0, shade(color, 0.95)); grad.addColorStop(0.45, shade(color, 1.08)); grad.addColorStop(1, shade(color, 0.68));
    g.beginPath(); g.ellipse(sx, sy0, rx, ry, 0, 0, Math.PI); g.lineTo(sx - rx, sy1); g.ellipse(sx, sy1, rx, ry, 0, Math.PI, 0, true); g.closePath();
    g.fillStyle = grad; g.fill();
    if (o.edge !== null) { g.strokeStyle = o.edge || shade(color, 0.55); g.lineWidth = o.lw || 0.8; g.stroke(); }
    if (!o.noTop) {
      g.beginPath(); g.ellipse(sx, sy1, rx, ry, 0, 0, Math.PI * 2);
      g.fillStyle = o.top || shade(color, 1.12); g.fill();
      if (o.edge !== null) g.stroke();
    }
  }

  // ---------- 旋轉方塊（角色的身體部位） ----------
  // 中心 (cx, cy)，底部高度 z；hu = 前後半長、hv = 左右半長；yaw = 朝向
  // 回傳前面（+u）那個面的四個角，方便畫表情
  function rbox(g, cx, cy, z, hu, hv, h, yaw, color, o) {
    o = o || {};
    const cs = Math.cos(yaw), sn = Math.sin(yaw), gray = o.gray;
    const W = (u, v) => [cx + u * cs - v * sn, cy + u * sn + v * cs];
    const c = [W(hu, -hv), W(hu, hv), W(-hu, hv), W(-hu, -hv)];   // 前左、前右、後右、後左
    const normals = [[cs, sn], [-sn, cs], [-cs, -sn], [sn, -cs]];   // 前、右、後、左
    const sides = [[0, 1, 0], [1, 2, 1], [2, 3, 2], [3, 0, 3]];
    const edge = o.edge === undefined ? shade(color, 0.5, gray) : o.edge;
    const lw = o.lw || 0.7;
    let front = null;
    for (const [a, b, ni] of sides) {
      const n = normals[ni];
      if (n[0] + n[1] <= 0.001) continue;             // 背對鏡頭的面不畫
      const f = 0.79 + 0.13 * n[1] - 0.07 * n[0];
      const pts = [P(c[a][0], c[a][1], z), P(c[b][0], c[b][1], z), P(c[b][0], c[b][1], z + h), P(c[a][0], c[a][1], z + h)];
      poly(g, pts, shade(color, f, gray), edge, lw);
      if (ni === 0) front = { a: c[0], b: c[1], z0: z, z1: z + h, vis: n[0] + n[1] };
    }
    if (!o.noTop) poly(g, c.map(q => P(q[0], q[1], z + h)), shade(color, 1.07, gray), edge, lw);
    if (!front) front = { a: c[0], b: c[1], z0: z, z1: z + h, vis: 0 };
    return front;
  }
  // 讓 [0,1]×[0,1] 對應到某個直立面：s 從 b（右）→ a（左）、t 從上往下
  function onFace(g, f, fn) {
    const o = P(f.b[0], f.b[1], f.z1), ex = P(f.a[0], f.a[1], f.z1), ey = P(f.b[0], f.b[1], f.z0);
    g.save();
    g.transform(ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1]);
    fn(g);
    g.restore();
  }

  // ---------- 預先繪製成圖片（精靈圖） ----------
  // bounds：世界座標下物件的範圍 {x, y, w, d, h}，margin：畫面上的額外留白
  // 回傳 { img, sx, sy, sw, sh }：sx, sy 是圖片左上角在畫面座標的位置
  function sprite(bounds, scale, margin, draw) {
    const { x, y, w, d, h } = bounds;
    const m = margin || [20, 20, 20, 20];     // 上、右、下、左
    const minX = x - (y + d) - m[3], maxX = x + w - y + m[1];
    const minY = (x + y) / 2 - h - m[0], maxY = (x + w + y + d) / 2 + m[2];
    const sw = maxX - minX, sh = maxY - minY;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(sw * scale)); c.height = Math.max(1, Math.ceil(sh * scale));
    const g = c.getContext('2d');
    g.scale(scale, scale); g.translate(-minX, -minY);
    g.lineJoin = 'round'; g.lineCap = 'round';
    draw(g);
    return { img: c, sx: minX, sy: minY, sw, sh };
  }

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif';

  BM.Iso = { P, rgb, shade, rgba, poly, box, quadX, quadY, quadZ, onWall, onFloor, floorEllipse, cylinder, rbox, onFace, sprite, roundRect, rng, FONT, LIGHT };
})(this);

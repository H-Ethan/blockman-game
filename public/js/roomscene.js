// 建築內部：誰是臥底的大廳與遊戲室（等角視角，圍繞中央圓桌就座）
(function (root) {
  'use strict';
  const BM = root.BM = root.BM || {};
  const I = BM.Iso;
  const { P, box, quadX, quadY, quadZ, onWall, shade, poly, FONT } = I;

  const RW = 460, RD = 460, WH = 150, CX = 230, CY = 236, TABLE_R = 66, SEAT_R = 122;

  function seatPos(i, max) {
    // 從畫面正下方開始順時針排座位
    const a = Math.PI / 4 + (i / max) * Math.PI * 2;
    return { x: CX + Math.cos(a) * SEAT_R, y: CY + Math.sin(a) * SEAT_R, yaw: a + Math.PI };
  }

  // ---------- 靜態背景 ----------
  function paintRoom(g, kind) {
    const r = I.rng(kind === 'room' ? 5 : 9);
    // 外圍
    const [l] = P(0, RD, 0), [rr] = P(RW, 0, 0);
    // 牆（後面兩面）
    const wallA = '#cdbff0', wallB = '#bba9e8', trim = '#4b3b7a';
    quadY(g, 0, RW, 0, 0, WH, shade(wallA, 0.98));
    quadX(g, 0, 0, RD, 0, WH, shade(wallB, 0.9));
    // 壁紙條紋
    for (let x = 16; x < RW; x += 32) quadY(g, x, x + 14, 0.1, 30, WH, 'rgba(255,255,255,.18)');
    for (let y = 16; y < RD; y += 32) quadX(g, 0.1, y, y + 14, 30, WH, 'rgba(255,255,255,.14)');
    // 護牆板
    quadY(g, 0, RW, 0.2, 0, 32, '#8a6a4a'); quadX(g, 0.2, 0, RD, 0, 32, '#7a5b3e');
    quadY(g, 0, RW, 0.3, 30, 34, trim); quadX(g, 0.3, 0, RD, 30, 34, trim);
    // 牆頂
    poly(g, [P(-10, -10, WH), P(RW, -10, WH), P(RW, 0, WH), P(0, 0, WH), P(0, RD, WH), P(-10, RD, WH)], '#3d2f6b');
    // 地板（木紋）
    quadZ(g, 0, 0, RW, RD, 0, '#d9a066');
    for (let y = 0; y < RD; y += 23) {
      quadZ(g, 0, y, RW, y + 1, 0.1, 'rgba(110,60,20,.25)');
      for (let x = (y / 23 % 3) * 40; x < RW; x += 120) quadZ(g, x, y, x + 1.2, y + 23, 0.1, 'rgba(110,60,20,.2)');
    }
    for (let i = 0; i < 80; i++) { const x = r() * RW, y = r() * RD; quadZ(g, x, y, x + 14 + r() * 20, y + 1, 0.1, 'rgba(255,240,210,.18)'); }
    // 牆角陰影
    const sh = g.createLinearGradient(0, 0, 0, 60);
    poly(g, [P(0, 0, 0), P(RW, 0, 0), P(RW, 26, 0), P(26, 26, 0), P(26, RD, 0), P(0, RD, 0)], 'rgba(60,30,10,.16)');

    // 窗戶（看得到城市與天空）
    for (const wx of [60, 330]) {
      quadY(g, wx - 4, wx + 74, 0.4, 56, 124, trim);
      const [ax, ay] = P(wx, 0, 120), [bx, by] = P(wx + 70, 0, 60);
      const sky = g.createLinearGradient(ax, ay, bx, by); sky.addColorStop(0, '#9fdcff'); sky.addColorStop(1, '#e8f6ff');
      quadY(g, wx, wx + 70, 0.6, 60, 120, sky);
      onWall(g, 'y', wx, 0.7, 120, gg => {
        gg.fillStyle = '#fff'; gg.beginPath(); gg.ellipse(20, 16, 10, 5, 0, 0, Math.PI * 2); gg.ellipse(30, 13, 9, 6, 0, 0, Math.PI * 2); gg.fill();
        gg.fillStyle = '#8c7fd6'; for (let i = 0; i < 6; i++) { const h = 10 + (i * 7 % 18); gg.fillRect(i * 12, 60 - h, 10, h); }
        gg.fillStyle = '#ffe9a0'; for (let i = 0; i < 6; i++) gg.fillRect(i * 12 + 3, 60 - 6, 2, 2);
      });
      quadY(g, wx + 34, wx + 36, 0.8, 60, 120, trim); quadY(g, wx, wx + 70, 0.8, 89, 91, trim);
      box(g, wx - 8, 0, 54, 86, 7, 3, '#e4d8f5', { lw: 0.5 });
    }

    if (kind === 'room') {
      // 線索板（照片＋紅線）
      quadY(g, 160, 300, 0.5, 56, 128, '#8b5a2b');
      quadY(g, 164, 296, 0.7, 60, 124, '#d9b382');
      onWall(g, 'y', 164, 0.8, 124, gg => {
        const pins = [[18, 14], [62, 10], [108, 18], [28, 46], [84, 44], [116, 50]];
        gg.strokeStyle = '#d62828'; gg.lineWidth = 1.2; gg.beginPath();
        [[0, 1], [1, 2], [0, 4], [1, 3], [2, 5], [3, 4]].forEach(([a, b]) => { gg.moveTo(pins[a][0], pins[a][1]); gg.lineTo(pins[b][0], pins[b][1]); }); gg.stroke();
        pins.forEach(([x, y], i) => {
          gg.fillStyle = '#fff'; gg.fillRect(x - 9, y - 7, 18, 15);
          gg.fillStyle = ['#ff8fab', '#7cc6fe', '#ffd166', '#95e06c', '#c3a6ff', '#ffa94d'][i];
          gg.fillRect(x - 7, y - 5, 14, 9);
          gg.fillStyle = 'rgba(0,0,0,.55)'; gg.beginPath(); gg.arc(x, y - 2, 2.2, 0, Math.PI * 2); gg.fill(); gg.fillRect(x - 3, y + 1, 6, 3);
          gg.fillStyle = '#d62828'; gg.beginPath(); gg.arc(x, y - 7, 1.6, 0, Math.PI * 2); gg.fill();
        });
        gg.font = `900 16px ${FONT}`; gg.fillStyle = '#7c3aed'; gg.fillText('?', 60, 64);
      });
    } else {
      // 大廳：海報
      quadY(g, 172, 288, 0.6, 52, 132, '#2b2050');
      onWall(g, 'y', 172, 0.8, 132, gg => {
        gg.fillStyle = '#ffcf5a'; gg.font = `900 15px ${FONT}`; gg.textAlign = 'center'; gg.textBaseline = 'middle';
        gg.fillText('誰是臥底', 58, 18);
        gg.strokeStyle = '#ffcf5a'; gg.lineWidth = 3; gg.beginPath(); gg.arc(52, 48, 13, 0, Math.PI * 2); gg.stroke();
        gg.beginPath(); gg.moveTo(61, 57); gg.lineTo(72, 68); gg.stroke();
        gg.font = `900 16px ${FONT}`; gg.fillStyle = '#ff8fab'; gg.fillText('?', 52, 49);
      });
    }
    // 左牆：書櫃、時鐘
    const bx = 0, by = 120;
    box(g, bx, by, 0, 26, 92, 104, '#7a4a26');
    for (let s = 0; s < 4; s++) {
      const z = 10 + s * 24;
      quadX(g, 26.2, by + 4, by + 88, z, z + 20, '#4a2d14');
      let y = by + 6;
      while (y < by + 84) { const w = 4 + r() * 5, h = 12 + r() * 7; quadX(g, 26.4, y, y + w, z, z + h, ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#ecf0f1'][Math.floor(r() * 6)]); y += w + 0.6; }
    }
    // 時鐘
    {
      const [sx, sy] = P(0.5, 300, 112);
      g.save(); g.translate(sx, sy); g.transform(1, -0.5, 0, 1, 0, 0);
      g.fillStyle = '#4b3b7a'; g.beginPath(); g.arc(0, 0, 15, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#333'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -8); g.moveTo(0, 0); g.lineTo(6, 2); g.stroke();
      g.restore();
    }
    // 地毯
    if (kind === 'room') {
      I.floorEllipse(g, CX, CY, 0.2, SEAT_R + 40, '#8e3b46');
      I.floorEllipse(g, CX, CY, 0.3, SEAT_R + 30, '#c9504f');
      I.floorEllipse(g, CX, CY, 0.4, SEAT_R + 12, '#f1d6a7');
      I.floorEllipse(g, CX, CY, 0.5, SEAT_R - 8, null, 'rgba(142,59,70,.6)', 2);
    } else {
      I.floorEllipse(g, CX, CY + 30, 0.2, 150, '#5b4b9a');
      I.floorEllipse(g, CX, CY + 30, 0.3, 140, '#7d6cc9');
      I.floorEllipse(g, CX, CY + 30, 0.4, 112, null, 'rgba(255,207,90,.7)', 3);
    }
    // 盆栽
    for (const [px, py] of [[RW - 30, 26], [26, RD - 30]]) plant(g, px, py);
  }

  function plant(g, x, y) {
    I.cylinder(g, x, y, 0, 12, 18, '#d9773f');
    const [sx, sy] = P(x, y, 22);
    for (const [c, s] of [['#2f7a32', 1], ['#46a046', 0.8], ['#6cc464', 0.55]]) {
      g.fillStyle = c;
      for (const [dx, dy, R] of [[0, -14, 13], [-11, -4, 10], [11, -4, 10], [0, 2, 9]]) { g.beginPath(); g.arc(sx + dx * s, sy + dy * s - (1 - s) * 8, R * s + 2, 0, Math.PI * 2); g.fill(); }
    }
  }

  // 中央圓桌
  function drawTable(g, t) {
    I.cylinder(g, CX, CY, 0, 10, 30, '#4a2d14', { noTop: true });
    I.cylinder(g, CX, CY, 30, TABLE_R, 7, '#6b3f1f', { top: '#8a5530' });
    I.floorEllipse(g, CX, CY, 37.2, TABLE_R - 9, '#2f7a52');
    I.floorEllipse(g, CX, CY, 37.3, TABLE_R - 12, null, 'rgba(255,220,140,.5)', 1.2);
    // 桌上的道具：放大鏡、卡片、檯燈
    const [sx, sy] = P(CX, CY, 38);
    g.save(); g.translate(sx, sy);
    for (let i = 0; i < 5; i++) { g.save(); g.rotate(-0.5 + i * 0.25); g.fillStyle = i % 2 ? '#fff7d6' : '#ffffff'; g.strokeStyle = '#7c5a2a'; g.lineWidth = 0.8; I.roundRect(g, -30, -6, 14, 10, 2); g.fill(); g.stroke(); g.restore(); }
    g.strokeStyle = '#4a2d14'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(16, 4); g.lineTo(26, 10); g.stroke();
    g.fillStyle = '#ffcf5a'; g.beginPath(); g.arc(10, 0, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(190,235,255,.9)'; g.beginPath(); g.arc(10, 0, 6.5, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  function drawChair(g, x, y, yaw, color) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    I.rbox(g, x, y, 0, 7, 7, 8, yaw, '#6b3f1f');
    I.rbox(g, x, y, 8, 8.5, 8.5, 2.5, yaw, color);
    I.rbox(g, x - cs * 8, y - sn * 8, 8, 1.4, 8.5, 18, yaw, '#7a4a26');
  }

  const CUSHIONS = ['#ff8fab', '#7cc6fe', '#ffd166', '#95e06c', '#c3a6ff', '#ffa94d', '#6ee7d5', '#f4978e', '#a0c4ff', '#ffc6ff', '#caffbf', '#fdffb6'];

  class RoomScene {
    constructor(canvas, kind, opts) {
      this.cv = canvas; this.g = canvas.getContext('2d'); this.kind = kind; this.opts = opts || {};
      this.bubbles = new BM.Bubbles();
      this.state = { members: [], max: 8 };
      this.hits = [];
      this.anim = new Map();
      if (this.opts.onClick) canvas.addEventListener('click', e => {
        const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * this.dpr, y = (e.clientY - r.top) * this.dpr;
        const hit = this.hits.filter(h => x > h.x0 && x < h.x1 && y > h.y0 && y < h.y1).sort((a, b) => b.depth - a.depth)[0];
        if (hit) this.opts.onClick(hit.id);
      });
    }
    resize() {
      const r = this.cv.getBoundingClientRect();
      const q = this.opts.quality ? this.opts.quality() : { dpr: 2 };
      const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
      this.cssW = Math.max(200, r.width); this.cssH = Math.max(150, r.height); this.dpr = dpr;
      this.cv.width = Math.round(this.cssW * dpr); this.cv.height = Math.round(this.cssH * dpr);
      // 讓整個房間放進畫面（上方留給名牌與泡泡）
      let minX = -RD - 10, maxX = RW + 10, minY = -WH - 10, maxY = (RW + RD) / 2 + 12;
      let z = Math.min(this.cssW / (maxX - minX), (this.cssH - 10) / (maxY - minY + 40));
      // 直式手機：放大到圓桌與座位區，不浪費上下空間
      if (this.kind === 'room') {
        const r = SEAT_R + 34, [cx, cy] = P(CX, CY, 0);
        const tMinX = cx - r * Math.SQRT2, tMaxX = cx + r * Math.SQRT2, tMinY = cy - r / Math.SQRT2 - 95, tMaxY = cy + r / Math.SQRT2 + 16;
        const zt = Math.min(this.cssW / (tMaxX - tMinX), (this.cssH - 10) / (tMaxY - tMinY + 40));
        if (zt > z * 1.3) { z = zt; minX = tMinX; maxX = tMaxX; minY = tMinY; maxY = tMaxY; }
      }
      this.zoom = z;
      this.ox = (this.cssW / z - (maxX + minX)) / 2;
      this.oy = (this.cssH / z - (maxY + minY)) / 2 + 18;
      const k = z * dpr;
      const bg = document.createElement('canvas'); bg.width = this.cv.width; bg.height = this.cv.height;
      const g = bg.getContext('2d');
      g.fillStyle = '#2a2140'; g.fillRect(0, 0, bg.width, bg.height);
      g.setTransform(k, 0, 0, k, this.ox * k, this.oy * k); g.lineJoin = 'round'; g.lineCap = 'round';
      paintRoom(g, this.kind);
      this.bg = bg;
    }
    set(state) { this.state = state; }

    frame(t) {
      if (!this.bg) return;
      const g = this.g, k = this.zoom * this.dpr, st = this.state;
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(this.bg, 0, 0);
      g.setTransform(k, 0, 0, k, this.ox * k, this.oy * k); g.lineJoin = 'round'; g.lineCap = 'round';

      if (this.kind === 'lobby') { this.drawLobby(g, t); return; }

      const max = st.max || 8;
      const bySeat = new Map(st.members.map(m => [m.seat, m]));
      const items = [];
      items.push({ kind: 'table', x: CX - TABLE_R, y: CY - TABLE_R, w: TABLE_R * 2, d: TABLE_R * 2, bx0: -9999, bx1: 9999, by0: -9999, by1: 9999 });
      for (let i = 0; i < max; i++) {
        const sp = seatPos(i, max), m = bySeat.get(i);
        const [sx, sy] = P(sp.x, sp.y, 0);
        items.push({ kind: 'seat', i, sp, m, x: sp.x - 9, y: sp.y - 9, w: 18, d: 18, bx0: sx - 30, bx1: sx + 30, by0: sy - 70, by1: sy + 12 });
      }
      // 地上的高亮（目前發言者、投票候選、我投的人）
      for (const it of items) if (it.kind === 'seat' && it.m) {
        const m = it.m, hl = st.highlight && st.highlight[m.id];
        if (!hl) continue;
        const pulse = 0.65 + Math.sin(t * 0.006) * 0.35;
        const col = hl === 'speaker' ? `rgba(255,207,90,${0.85 * pulse})` : hl === 'myvote' ? `rgba(255,90,95,${0.9})` : hl === 'pk' ? `rgba(255,120,60,${0.7 * pulse})` : `rgba(120,200,255,${0.6 * pulse})`;
        I.floorEllipse(g, it.sp.x, it.sp.y, 0.5, 22, col);
        if (hl === 'speaker') {   // 聚光燈
          const [sx, sy] = P(it.sp.x, it.sp.y, 0), [tx, ty] = P(it.sp.x, it.sp.y, WH + 40);
          const gr = g.createLinearGradient(0, ty, 0, sy); gr.addColorStop(0, 'rgba(255,240,180,0)'); gr.addColorStop(1, `rgba(255,240,180,${0.32 * pulse})`);
          g.fillStyle = gr; g.beginPath(); g.moveTo(tx - 8, ty); g.lineTo(sx - 34, sy); g.lineTo(sx + 34, sy); g.lineTo(tx + 8, ty); g.closePath(); g.fill();
        }
      }
      const sorted = BM.isoSort(items);
      this.hits = [];
      const anchors = [];
      for (const it of sorted) {
        if (it.kind === 'table') { drawTable(g, t); continue; }
        drawChair(g, it.sp.x, it.sp.y, it.sp.yaw, CUSHIONS[it.i % CUSHIONS.length]);
        const m = it.m;
        if (!m) continue;
        const a = this.anim.get(m.id) || { bob: 0 };
        this.anim.set(m.id, a);
        const [sx, sy] = P(it.sp.x, it.sp.y, 0);
        g.save(); g.translate(sx, sy);
        if (!m.online) g.globalAlpha = 0.45;
        const speaking = st.highlight && st.highlight[m.id] === 'speaker';
        BM.Avatar.draw(g, m.profile, { yaw: it.sp.yaw, pose: 'sit', t: t + it.i * 400, gray: m.dead, bob: speaking ? Math.abs(Math.sin(t * 0.008)) * 1.5 : 0, noShadow: true });
        g.restore(); g.globalAlpha = 1;
        const [hx, hy] = P(it.sp.x, it.sp.y, 52 + BM.Avatar.hatHeight(m.profile.hat));
        const [fx, fy] = P(it.sp.x, it.sp.y, -4);
        this.hits.push({ id: m.id, x0: (sx - 22 + this.ox) * k, x1: (sx + 22 + this.ox) * k, y0: (hy + this.oy) * k, y1: (fy + this.oy) * k, depth: it.sp.x + it.sp.y });
        anchors.push({ m, x: (hx + this.ox) * k, y: (hy + this.oy) * k });
      }
      // 名牌＋泡泡
      g.setTransform(1, 0, 0, 1, 0, 0);
      const bAnch = [];
      for (const a of anchors) {
        const m = a.m, tg = BM.Tag(m.name, { bg: m.me ? '#ff5a5f' : m.dead ? 'rgba(90,90,100,.85)' : undefined, sub: m.badge, subBg: m.badgeBg }, this.dpr);
        const tw = tg.w * this.dpr, ax = Math.max(tw / 2 + 4, Math.min(this.cv.width - tw / 2 - 4, a.x));
        g.drawImage(tg.c, ax - tw / 2, a.y - tg.h * this.dpr);
        bAnch.push({ id: m.id, x: ax, y: a.y - tg.h * this.dpr });
      }
      this.bubbles.draw(g, bAnch, this.dpr);
    }

    drawLobby(g, t) {
      // 接待櫃台
      const x0 = 150, y0 = 120;
      box(g, x0, y0, 0, 160, 34, 34, '#6b3f1f');
      box(g, x0 - 4, y0 - 4, 34, 168, 42, 4, '#3d2f6b');
      onWall(g, 'y', x0 + 10, y0 + 34.2, 30, gg => {
        gg.fillStyle = '#ffcf5a'; gg.font = `900 13px ${FONT}`; gg.textBaseline = 'top'; gg.fillText('偵探事務所 ‧ 服務台', 6, 6);
      });
      // 櫃台上的放大鏡與鈴
      const [bx, by] = P(x0 + 120, y0 + 18, 38);
      g.fillStyle = '#ffcf5a'; g.beginPath(); g.ellipse(bx, by, 6, 3, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(bx, by - 3, 4.5, Math.PI, 0); g.fill();
      // 自己的角色站在中間
      const me = this.state.me;
      if (me) {
        const [sx, sy] = P(CX + 20, CY + 90, 0);
        g.save(); g.translate(sx, sy); BM.Avatar.draw(g, me, { yaw: Math.PI / 4, t }); g.restore();
      }
    }

    say(id, text, kind) { this.bubbles.add(id, text, kind); }
  }

  BM.RoomScene = RoomScene;
})(this);

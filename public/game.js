// 色塊人 2.5D 渲染器：3/4 俯視角，物件有頂面＋正面＋投影，依前後深度排序繪製
(function () {
  'use strict';
  const PAD_TOP = 72;   // 地面上方留空，讓後排的樹和牆有空間往上長
  const CLIFF = 30;     // 台地前緣的土壁厚度
  const CAP = 5;        // 角色頭頂「頂面」厚度
  const WALL_H = 38;    // 牆高

  let W = 960, H = 600, PW = 24, PH = 48, VW = 0, VH = 0;
  const stage = document.getElementById('stage');
  const ctx = stage.getContext('2d');
  let k = 1, myId = null, state = null, sprites = {}, obstacles = [], drawables = [], ground = null;
  const chars = {}, disp = {}, particles = [], floaters = [];
  let prevStars = new Map(), skipBurst = false, lastT = 0;

  // ---- 移動同步 ----
  const Move = window.Move;
  const INTERP_MS = 100;        // 其他玩家延後 100ms 顯示，永遠有兩個快照可以插值
  let io = { mask: () => 0, send: () => {} };
  let local = null;             // 自己的預測狀態 { x, y, vx, vy, facing }
  let prevPos = null;           // 上一個物理步的位置（高更新率螢幕用來補間）
  let pending = [];             // 已送出、伺服器尚未確認的指令
  let seq = 0, acc = 0, errX = 0, errY = 0;
  let snaps = [], clockOffset = null, renderOffset = null;
  const dust = [];

  // ---------- 小工具 ----------
  const rng = seed => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const hashf = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  function mk(w, h, s) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * s); c.height = Math.ceil(h * s);
    const g = c.getContext('2d'); g.scale(s, s);
    return [c, g];
  }
  const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const ellipse = (g, x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); g.fill(); };
  const tri = (g, x1, y1, x2, y2, x3, y3, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); g.fill(); };
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  let quality = 1;            // 依效能自動調整的解析度倍率（0.5 ~ 1）
  function resize() {
    if (!VW) return;
    const cssW = stage.getBoundingClientRect().width || VW;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * quality;
    const w = Math.max(320, Math.round(cssW * dpr));
    if (w === stage.width && ground) return;
    stage.width = w;
    stage.height = Math.round(w * VH / VW);
    k = stage.width / VW;
    if (obstacles.length) buildGround();
  }
  let resizeTimer = 0;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); });

  // 效能監控：持續明顯掉幀才降低解析度（最多 3 次、只降不升），避免反覆重畫背景造成頓挫
  let perfAvg = 16.7, perfCheck = 0, perfDrops = 0;
  function watchPerf(interval, now) {
    if (interval > 0 && interval < 200) perfAvg += (interval - perfAvg) * 0.03;
    if (!perfCheck) perfCheck = now + 3000;            // 剛進場先讓它穩定一下
    if (now < perfCheck) return;
    perfCheck = now + 4000;
    if (perfAvg > 25 && perfDrops < 3) {
      perfDrops++; quality = Math.max(0.5, quality * 0.75); resize();
      perfAvg = 16.7;
    }
  }

  // ---------- 地面（預先繪製一次） ----------
  function buildGround() {
    const r = rng(20261026), top = PAD_TOP, cy = PAD_TOP + H;
    const c = document.createElement('canvas'); c.width = stage.width; c.height = stage.height;
    const g = c.getContext('2d'); g.scale(k, k);

    const bg = g.createLinearGradient(0, 0, 0, VH);
    bg.addColorStop(0, '#22384f'); bg.addColorStop(1, '#0f1823');
    g.fillStyle = bg; g.fillRect(0, 0, VW, VH);
    // 遠景山丘
    [['#2c4a5e', 0.55, 26], ['#2f5a4a', 0.8, 18]].forEach(([col, base, amp], li) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, top);
      for (let x = 0; x <= W; x += 8) g.lineTo(x, top * base - Math.abs(Math.sin(x * 0.006 + li * 2) * amp + Math.sin(x * 0.021 + li) * amp * 0.35));
      g.lineTo(W, top); g.closePath(); g.fill();
    });

    // 台地前緣土壁
    const cg = g.createLinearGradient(0, cy, 0, cy + CLIFF);
    cg.addColorStop(0, '#9a6a44'); cg.addColorStop(1, '#4b2f1c');
    g.fillStyle = cg; g.fillRect(0, cy, W, CLIFF);
    for (let i = 1; i <= 3; i++) { g.fillStyle = 'rgba(0,0,0,.13)'; g.fillRect(0, cy + i * 7.5, W, 1.4); }
    for (let i = 0; i < 180; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,230,200,.16)' : 'rgba(0,0,0,.18)';
      g.fillRect(r() * W, cy + 4 + r() * (CLIFF - 6), 2 + r() * 3, 1.5 + r() * 2);
    }

    // 草地
    g.save(); g.beginPath(); g.rect(0, top, W, H); g.clip();
    g.fillStyle = '#84c75a'; g.fillRect(0, top, W, H);
    for (let i = 0; i < 46; i++) {
      const x = r() * W, y = top + r() * H, rad = 40 + r() * 110;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const col = r() < 0.5 ? '96,168,62' : '162,216,106';
      gr.addColorStop(0, `rgba(${col},.55)`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 7000; i++) {
      g.fillStyle = r() < 0.55 ? 'rgba(40,95,30,.16)' : 'rgba(230,255,190,.14)';
      g.fillRect(r() * W, top + r() * H, 1.4, 1.4);
    }
    g.strokeStyle = 'rgba(55,115,40,.55)'; g.lineWidth = 1;
    for (let i = 0; i < 320; i++) {
      const x = r() * W, y = top + r() * H;
      g.beginPath(); g.moveTo(x - 2, y - 3); g.lineTo(x, y); g.lineTo(x + 2, y - 3.5); g.moveTo(x, y); g.lineTo(x + 0.3, y - 4.5); g.stroke();
    }
    const flowers = ['#ffffff', '#ffe066', '#ff8fab', '#c3a6ff'];
    for (let i = 0; i < 70; i++) {
      const x = r() * W, y = top + r() * H;
      g.fillStyle = flowers[i % 4]; circle(g, x, y, 1.7);
      g.fillStyle = 'rgba(255,190,0,.9)'; circle(g, x, y, 0.6);
    }
    const edge = (x0, y0, x1, y1, a) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, top, W, H);
    };
    edge(0, top, 0, top + 46, 0.25); edge(0, cy, 0, cy - 24, 0.12); edge(0, 0, 34, 0, 0.18); edge(W, 0, W - 34, 0, 0.18);

    // 靜態物件的投影（光從左上來，影子落在右下）
    const [sc, sg] = mk(VW, VH, Math.min(2, k));
    sg.fillStyle = '#000'; sg.translate(0, top);
    for (const o of obstacles) {
      if (o.type === 'wall') {
        const sx = WALL_H * 0.55, sy = WALL_H * 0.3;
        sg.beginPath(); sg.moveTo(o.x, o.y); sg.lineTo(o.x + o.w, o.y); sg.lineTo(o.x + o.w + sx, o.y + sy);
        sg.lineTo(o.x + o.w + sx, o.y + o.d + sy); sg.lineTo(o.x + sx, o.y + o.d + sy); sg.lineTo(o.x, o.y + o.d);
        sg.closePath(); sg.fill();
      } else if (o.type === 'rock') {
        ellipse(sg, o.x + o.w / 2 + 7, o.y + o.d / 2 + 5, o.w / 2 + 6, o.d / 2 + 5);
      } else {
        ellipse(sg, o.x + o.w / 2 + 16, o.y + o.d + 1, 30, 11);
      }
    }
    g.globalAlpha = 0.26; g.drawImage(sc, 0, 0, VW, VH); g.globalAlpha = 1;
    g.restore();

    // 草皮垂到土壁上的邊
    g.fillStyle = '#6aa844';
    g.beginPath(); g.moveTo(0, cy - 1);
    for (let x = 0; x < W; x += 10) g.quadraticCurveTo(x + 5, cy + 3 + r() * 5, x + 10, cy - 1);
    g.closePath(); g.fill();
    ground = c;
  }

  // ---------- 磚牆（立方體：頂面＋正面） ----------
  function boxCanvas(w, d, h, seed, first, last) {
    const r = rng(seed);
    const [c, g] = mk(w, d + h, 3);
    g.fillStyle = '#d8c6a6'; g.fillRect(0, d, w, h); // 灰縫
    const bh = 7.6;
    for (let row = 0, y = d; y < d + h; row++, y += bh) {
      for (let x = row % 2 ? -8 : 0; x < w; x += 16) {
        g.fillStyle = `hsl(${12 + r() * 10},${38 + r() * 12}%,${33 + r() * 9}%)`;
        g.fillRect(x + 1, y + 1, 14, bh - 1.6);
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + 1, y + 1, 14, 1);
      }
    }
    const ao = g.createLinearGradient(0, d, 0, d + h);
    ao.addColorStop(0, 'rgba(0,0,0,.05)'); ao.addColorStop(1, 'rgba(0,0,0,.38)');
    g.fillStyle = ao; g.fillRect(0, d, w, h);

    g.fillStyle = '#cbc3b4'; g.fillRect(0, 0, w, d);
    for (let i = 0; i < (w * d) / 40; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.14)';
      g.fillRect(r() * w, r() * d, 2 + r() * 4, 1.5 + r() * 3);
    }
    if (first) { g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(0, 0, w, 1); }
    if (last) { g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, d - 1, w, 1.2); }
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(0, 0, 1.5, d + h);
    g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(w - 1.5, 0, 1.5, d + h);
    return c;
  }

  // ---------- 石頭 ----------
  function rockCanvas(o) {
    const r = rng(o.seed), w = o.w, d = o.d, rh = 12 + r() * 10, P = 4, N = 16;
    const CW = w + P * 2, CH = d + rh + P * 2;
    const [c, g] = mk(CW, CH, 3);
    const cx = P + w / 2, cy = P + d / 2, rx = w / 2, ry = d / 2;
    const jit = Array.from({ length: N }, () => 0.84 + r() * 0.2);
    const pt = (i, shift) => { const a = (i / N) * Math.PI * 2, j = jit[i % N]; return [cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j + shift]; };
    const sil = () => {
      g.beginPath();
      for (let i = N / 2; i <= N; i++) { const [x, y] = pt(i, 0); i === N / 2 ? g.moveTo(x, y) : g.lineTo(x, y); }
      for (let i = 0; i <= N / 2; i++) { const [x, y] = pt(i, rh); g.lineTo(x, y); }
      g.closePath();
    };
    const topPath = (sc, ox, oy) => {
      g.beginPath();
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2, j = jit[i];
        const x = cx + ox + Math.cos(a) * rx * j * sc, y = cy + oy + Math.sin(a) * ry * j * sc;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
    };
    sil();
    const fg = g.createLinearGradient(P, 0, P + w, 0);
    fg.addColorStop(0, '#8f939a'); fg.addColorStop(1, '#5b5f66');
    g.fillStyle = fg; g.fill();
    g.lineWidth = 1.2; g.strokeStyle = '#393c42'; g.stroke();
    g.save(); sil(); g.clip();
    const ao = g.createLinearGradient(0, cy, 0, CH);
    ao.addColorStop(0, 'rgba(0,0,0,0)'); ao.addColorStop(1, 'rgba(0,0,0,.32)');
    g.fillStyle = ao; g.fillRect(0, 0, CW, CH);
    g.strokeStyle = 'rgba(40,42,48,.6)'; g.lineWidth = 0.9;
    for (let i = 0; i < 2; i++) {
      let x = P + w * (0.25 + r() * 0.5), y = cy + ry * 0.7;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 3; s++) { x += (r() - 0.5) * 6; y += 3 + r() * 3; g.lineTo(x, y); }
      g.stroke();
    }
    g.restore();
    topPath(1, 0, 0);
    const tg = g.createLinearGradient(P, P, P + w, P + d);
    tg.addColorStop(0, '#c6cad0'); tg.addColorStop(1, '#989ca4');
    g.fillStyle = tg; g.fill();
    g.strokeStyle = 'rgba(60,62,68,.5)'; g.lineWidth = 0.8; g.stroke();
    topPath(0.55, -rx * 0.18, -ry * 0.2); g.fillStyle = 'rgba(255,255,255,.28)'; g.fill();
    if (r() < 0.5) { topPath(0.35, rx * 0.25, ry * 0.1); g.fillStyle = 'rgba(95,150,60,.85)'; g.fill(); }
    return { img: c, x: o.x - P, y: o.y - rh - P, w: CW, h: CH, sort: o.y + o.d };
  }

  // ---------- 樹（闊葉樹 / 松樹） ----------
  function treeCanvas(seed) {
    const r = rng(seed), pine = r() < 0.35, bx = 40, by = 112;
    const [c, g] = mk(80, 120, 3);
    const tw = pine ? 8 : 10, th = pine ? 26 : 40;
    g.fillStyle = '#4f311c'; ellipse(g, bx, by, tw * 0.9, 3);
    g.fillStyle = '#6b4226'; g.fillRect(bx - tw / 2, by - th, tw, th);
    g.fillStyle = '#8b5a35'; g.fillRect(bx - tw / 2, by - th, tw * 0.35, th);
    g.fillStyle = '#3f2614'; g.fillRect(bx + tw / 2 - 2, by - th, 2, th);
    if (!pine) {
      const hue = 92 + r() * 28, cx = bx, cy = by - th - 22;
      const blobs = [[0, 0, 25], [-17, 9, 17], [17, 9, 17], [-9, -14, 17], [10, -13, 16], [0, 14, 15]]
        .map(([x, y, R]) => [x + (r() - 0.5) * 4, y + (r() - 0.5) * 4, R * (0.92 + r() * 0.16)]);
      g.fillStyle = 'rgba(0,0,0,.25)'; ellipse(g, bx, cy + 27, 13, 5);
      g.fillStyle = `hsl(${hue},45%,17%)`; blobs.forEach(([x, y, R]) => circle(g, cx + x, cy + y, R + 1.6));
      g.fillStyle = `hsl(${hue},46%,29%)`; blobs.forEach(([x, y, R]) => circle(g, cx + x, cy + y, R));
      g.fillStyle = `hsl(${hue},50%,38%)`; blobs.forEach(([x, y, R]) => circle(g, cx + x - 2.5, cy + y - 3.5, R * 0.8));
      g.fillStyle = `hsl(${hue},55%,50%)`; blobs.forEach(([x, y, R]) => circle(g, cx + x - 5, cy + y - 7, R * 0.45));
      g.save(); g.beginPath();
      blobs.forEach(([x, y, R]) => { g.moveTo(cx + x + R, cy + y); g.arc(cx + x, cy + y, R, 0, Math.PI * 2); });
      g.clip();
      for (let i = 0; i < 90; i++) {
        g.fillStyle = r() < 0.5 ? `hsla(${hue},50%,18%,.35)` : `hsla(${hue},60%,64%,.35)`;
        circle(g, cx + (r() - 0.5) * 64, cy + (r() - 0.5) * 56, 0.8 + r() * 1.8);
      }
      if (r() < 0.4) { g.fillStyle = '#e63946'; for (let i = 0; i < 6; i++) circle(g, cx + (r() - 0.5) * 40, cy + (r() - 0.3) * 30, 2); }
      g.restore();
    } else {
      const hue = 135 + r() * 20;
      for (let i = 0; i < 4; i++) {
        const baseY = by - th + 6 - i * 19, half = 30 - i * 6.5, tipY = baseY - 32;
        tri(g, bx, tipY - 1.5, bx - half - 1.5, baseY + 1.5, bx + half + 1.5, baseY + 1.5, `hsl(${hue},45%,14%)`);
        tri(g, bx, tipY, bx - half, baseY, bx, baseY, `hsl(${hue},42%,38%)`);
        tri(g, bx, tipY, bx, baseY, bx + half, baseY, `hsl(${hue},45%,26%)`);
      }
    }
    return c;
  }

  function buildMap() {
    drawables = [];
    for (const o of obstacles) {
      if (o.type === 'wall') {
        if (o.d > o.w) { // 直向牆切成小段，前後排序才會正確
          const SEG = 18;
          for (let y0 = 0; y0 < o.d; y0 += SEG) {
            const sd = Math.min(SEG, o.d - y0);
            drawables.push({ img: boxCanvas(o.w, sd, WALL_H, o.seed + y0, y0 === 0, y0 + sd >= o.d),
              x: o.x, y: o.y + y0 - WALL_H, w: o.w, h: sd + WALL_H, sort: o.y + y0 + sd });
          }
        } else {
          drawables.push({ img: boxCanvas(o.w, o.d, WALL_H, o.seed, true, true),
            x: o.x, y: o.y - WALL_H, w: o.w, h: o.d + WALL_H, sort: o.y + o.d });
        }
      } else if (o.type === 'rock') {
        drawables.push(rockCanvas(o));
      } else {
        const bx = o.x + o.w / 2, by = o.y + o.d;
        drawables.push({ img: treeCanvas(o.seed), x: bx - 40, y: by - 112, w: 80, h: 120, sort: by,
          canopy: { x: bx - 36, y: by - 110, w: 72, h: 84 } });
      }
    }
    buildGround();
  }

  // ---------- 角色：自訂圖 → 立體色塊人（頂面＋明暗＋外框） ----------
  function buildChar(img) {
    const s = 4;
    const tmp = document.createElement('canvas'); tmp.width = PW; tmp.height = PH;
    const tg = tmp.getContext('2d'); tg.imageSmoothingEnabled = false; tg.drawImage(img, 0, 0, PW, PH);
    const data = tg.getImageData(0, 0, PW, PH).data;
    const c = document.createElement('canvas'); c.width = PW * s; c.height = (PH + CAP) * s;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    const tops = [];
    for (let x = 0; x < PW; x++) {
      let t = -1;
      for (let y = 0; y < PH; y++) if (data[(y * PW + x) * 4 + 3] > 20) { t = y; break; }
      tops.push(t);
      if (t < 0) continue;
      const i = (t * PW + x) * 4, L = v => Math.round(v + (255 - v) * 0.38);
      g.fillStyle = `rgb(${L(data[i])},${L(data[i + 1])},${L(data[i + 2])})`;
      g.fillRect(x * s, t * s, s, CAP * s);
    }
    g.drawImage(tmp, 0, 0, PW, PH, 0, CAP * s, PW * s, PH * s);
    g.save(); g.globalCompositeOperation = 'source-atop';
    const vg = g.createLinearGradient(0, CAP * s, 0, (PH + CAP) * s);
    vg.addColorStop(0, 'rgba(255,255,255,.06)'); vg.addColorStop(0.6, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.24)');
    g.fillStyle = vg; g.fillRect(0, CAP * s, PW * s, PH * s);
    const hg = g.createLinearGradient(0, 0, PW * s, 0);
    hg.addColorStop(0, 'rgba(255,255,255,.12)'); hg.addColorStop(0.45, 'rgba(0,0,0,0)'); hg.addColorStop(1, 'rgba(0,0,0,.2)');
    g.fillStyle = hg; g.fillRect(0, 0, PW * s, (PH + CAP) * s);
    g.fillStyle = 'rgba(0,0,0,.2)';
    tops.forEach((t, x) => { if (t >= 0) g.fillRect(x * s, (t + CAP) * s, s, s * 0.5); });
    g.restore();

    const pad = 2;
    const sil = document.createElement('canvas'); sil.width = c.width; sil.height = c.height;
    const sg = sil.getContext('2d'); sg.drawImage(c, 0, 0);
    sg.globalCompositeOperation = 'source-in'; sg.fillStyle = 'rgba(18,20,30,.9)'; sg.fillRect(0, 0, sil.width, sil.height);
    const out = document.createElement('canvas'); out.width = c.width + pad * 2; out.height = c.height + pad * 2;
    const og = out.getContext('2d');
    for (const [dx, dy] of [[-pad, 0], [pad, 0], [0, -pad], [0, pad]]) og.drawImage(sil, pad + dx, pad + dy);
    og.drawImage(c, pad, pad);
    return { c: out, s, pad };
  }

  // ---------- 星星與粒子 ----------
  const GLOW = (() => {
    const [c, g] = mk(56, 56, 2);
    const gr = g.createRadialGradient(28, 28, 0, 28, 28, 28);
    gr.addColorStop(0, 'rgba(255,225,110,.55)'); gr.addColorStop(1, 'rgba(255,225,110,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 56, 56);
    return c;
  })();
  function starPath(g, R, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r : R;
      g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.closePath();
  }
  const starZ = (s, t) => 18 + Math.sin(t * 0.004 + hashf(s.id) * 6) * 4;
  function drawStar(s, t) {
    const z = starZ(s, t), x = s.x, y = s.y - z, ph = hashf(s.id) * 6;
    ctx.drawImage(GLOW, x - 28, y - 28, 56, 56);
    ctx.save(); ctx.translate(x, y);
    ctx.scale(Math.max(0.18, Math.abs(Math.cos(t * 0.003 + ph))), 1);
    ctx.translate(0, 2.2); starPath(ctx, 10.5, 4.6); ctx.fillStyle = '#b06a06'; ctx.fill();
    ctx.translate(0, -2.2);
    const gr = ctx.createLinearGradient(0, -10, 0, 10);
    gr.addColorStop(0, '#fff7b8'); gr.addColorStop(0.5, '#ffd23f'); gr.addColorStop(1, '#f2a100');
    starPath(ctx, 10.5, 4.6); ctx.fillStyle = gr; ctx.fill();
    ctx.lineWidth = 1.1; ctx.strokeStyle = '#7f4a00'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)'; circle(ctx, -2.5, -4, 1.6);
    ctx.restore();
    const sp = (t * 0.002 + ph) % 1;
    if (sp < 0.3) {
      const a = sp / 0.3, sx = x + Math.cos(ph * 9) * 13, sy = y + Math.sin(ph * 9) * 9, L = 3.5 * Math.sin(a * Math.PI);
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx - L, sy); ctx.lineTo(sx + L, sy); ctx.moveTo(sx, sy - L); ctx.lineTo(sx, sy + L); ctx.stroke();
    }
  }
  function burst(x, y) {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 90;
      particles.push({ x, y, z: 18, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5, vz: 80 + Math.random() * 120, life: 1,
        col: Math.random() < 0.3 ? '#ffffff' : (Math.random() < 0.5 ? '#ffd23f' : '#ffb703'), size: 2 + Math.random() * 2 });
    }
    floaters.push({ x, y: y - 30, life: 1 });
  }

  // ---------- 繪製角色 ----------
  function animate(d, id, dt) {
    const sp = Math.min(1, Math.hypot(d.vx || 0, d.vy || 0) / Move.MAX_SPEED);
    const e = x => 1 - Math.exp(-dt * x);
    if (d.amp === undefined) { d.amp = sp; d.face = d.facing || 1; d.lean = 0; d.walk = 0; d.foot = 0; }
    d.amp += (sp - d.amp) * e(9);                                    // 晃動幅度隨速度漸變
    d.lean += (((d.vx || 0) / Move.MAX_SPEED) * 0.07 - d.lean) * e(10); // 前傾漸變
    const tf = (d.facing || 1) < 0 ? -1 : 1;                          // 轉身：約 0.15 秒翻過去
    d.face = tf > d.face ? Math.min(tf, d.face + dt * 13) : Math.max(tf, d.face - dt * 13);
    d.walk += Math.hypot(d.vx || 0, d.vy || 0) * dt * 0.11;
    const foot = Math.floor(d.walk / Math.PI);                        // 每踩一步揚起一點灰塵
    if (foot !== d.foot) { d.foot = foot; if (d.amp > 0.45) puff(d.x - (d.vx || 0) * 0.04, d.y + 1, 2); }
    if (Math.abs(tf - d.face) > 1.6 && d.amp > 0.3 && !d.turnPuff) { d.turnPuff = true; puff(d.x, d.y + 1, 4); }
    if (Math.abs(tf - d.face) < 0.01) d.turnPuff = false;
  }
  function puff(x, y, n) {
    for (let i = 0; i < n && dust.length < 80; i++)
      dust.push({ x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 3, r: 2 + Math.random() * 2,
                  vx: (Math.random() - 0.5) * 18, life: 1 });
  }
  function charMotion(d, id, t) {
    const ph = hashf(id) * 10, amp = d.amp || 0;
    const s2 = Math.sin(d.walk || 0) ** 2;                             // sin² 在落地點是圓滑的，不會「頓」一下
    const breathe = Math.sin(t * 0.004 + ph) * 0.018 * (1 - amp);
    return { bob: s2 * 3 * amp, sx: 1 - s2 * 0.035 * amp, sy: 1 + s2 * 0.035 * amp + breathe, lean: d.lean || 0 };
  }
  function drawPlayer(p, t, alpha) {
    const ch = chars[p.id], d = disp[p.id];
    if (!ch || !ch.c || !d) return;
    const m = charMotion(d, p.id, t); d.bob = m.bob;
    const dw = ch.c.width / ch.s, dh = ch.c.height / ch.s;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(d.x, d.y - m.bob);
    if (m.lean) ctx.rotate(m.lean);
    ctx.scale((Math.abs(d.face) < 0.08 ? 0.08 * Math.sign(d.face || 1) : d.face) * m.sx, m.sy);
    ctx.drawImage(ch.c, -dw / 2, -dh + ch.pad / ch.s, dw, dh);
    ctx.restore();
  }
  function drawLabel(p, leader) {
    const d = disp[p.id]; if (!d) return;
    const name = sprites[p.id] ? sprites[p.id].name : '';
    const txt = `${leader ? '👑 ' : ''}${name}  ${p.score}`;
    ctx.font = '600 11px "Noto Sans TC", system-ui, sans-serif';
    const tw = ctx.measureText(txt).width + 14, ax = d.x, x = Math.max(tw / 2 + 4, Math.min(W - tw / 2 - 4, d.x)), y = d.y - PH - CAP - 14 - (d.bob || 0);
    const mine = p.id === myId;
    ctx.fillStyle = mine ? 'rgba(255,90,95,.95)' : 'rgba(18,24,34,.74)';
    roundRect(ctx, x - tw / 2, y - 9, tw, 17, 8.5); ctx.fill();
    if (mine) { ctx.beginPath(); ctx.moveTo(ax - 4, y + 8); ctx.lineTo(ax + 4, y + 8); ctx.lineTo(ax, y + 12); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
  }

  // ---------- 主迴圈 ----------
  function frame(t) {
    requestAnimationFrame(frame);
    if (!state || !ground || !VW) return;
    const rawDt = lastT ? (t - lastT) / 1000 : 0; lastT = t;
    watchPerf(rawDt * 1000, t);
    const dt = Math.min(0.05, rawDt);

    // 1) 自己：固定步長本機預測，按下就動，不必等伺服器回應
    let alpha = 1;
    if (local) {
      acc = Math.min(acc + rawDt, 0.25);
      const out = [];
      while (acc >= Move.STEP) {
        acc -= Move.STEP;
        prevPos = { x: local.x, y: local.y };
        const mask = state.winner ? 0 : io.mask();
        if (state.winner || (!mask && !local.vx && !local.vy)) continue; // 靜止時不送封包
        seq++;
        Move.step(local, mask, obstacles, W, H);
        pending.push([seq, mask]); out.push([seq, mask]);
      }
      if (out.length) io.send(out);
      alpha = acc / Move.STEP;
      const fade = Math.exp(-dt * 12); errX *= fade; errY *= fade; // 校正誤差慢慢消化掉
      if (Math.abs(errX) < 0.01) errX = 0; if (Math.abs(errY) < 0.01) errY = 0;
      const d = disp[myId] || (disp[myId] = { walk: 0 });
      d.x = prevPos.x + (local.x - prevPos.x) * alpha + errX;
      d.y = prevPos.y + (local.y - prevPos.y) * alpha + errY;
      d.vx = local.vx; d.vy = local.vy; d.facing = local.facing;
    }

    // 2) 其他玩家：在兩個伺服器快照之間依時間插值
    if (clockOffset !== null && snaps.length) {
      if (renderOffset === null || Math.abs(clockOffset - renderOffset) > 250) renderOffset = clockOffset;
      else {
        const lim = rawDt * 1000 * 0.1;
        renderOffset += Math.max(-lim, Math.min(lim, clockOffset - renderOffset));
      }
      const rt = performance.now() + renderOffset - INTERP_MS;
      let i = snaps.length - 1;
      while (i > 0 && snaps[i].t > rt) i--;
      const A = snaps[i], B = snaps[i + 1];
      for (const p of state.players) {
        if (p.id === myId) continue;
        const d = disp[p.id] || (disp[p.id] = { x: p.x, y: p.y, walk: 0 });
        const pa = A.map[p.id], pb = B && B.map[p.id];
        let q = pa || pb || p;
        if (pa && pb) {
          const f = Math.max(0, Math.min(1, (rt - A.t) / (B.t - A.t)));
          if (Math.hypot(pb.x - pa.x, pb.y - pa.y) > 60) q = f < 0.5 ? pa : pb; // 傳送（新回合）不插值
          else q = { x: pa.x + (pb.x - pa.x) * f, y: pa.y + (pb.y - pa.y) * f,
                     vx: pa.vx + (pb.vx - pa.vx) * f, vy: pa.vy + (pb.vy - pa.vy) * f, facing: f < 0.5 ? pa.facing : pb.facing };
        } else if (pa && !B) {
          const ex = Math.min(0.1, Math.max(0, (rt - A.t) / 1000)); // 封包晚到：依速度短暫外推
          q = { x: pa.x + pa.vx * ex, y: pa.y + pa.vy * ex, vx: pa.vx, vy: pa.vy, facing: pa.facing };
        }
        d.x = q.x; d.y = q.y; d.vx = q.vx || 0; d.vy = q.vy || 0; d.facing = q.facing;
      }
    }
    for (const p of state.players) if (disp[p.id]) animate(disp[p.id], p.id, dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(ground, 0, 0); // 與畫布同尺寸，直接貼上不縮放（最省效能）
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';
    ctx.translate(0, PAD_TOP);

    // 動態影子
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    for (const p of state.players) {
      const d = disp[p.id]; if (!d) continue;
      const b = d.bob || 0;
      ellipse(ctx, d.x + 3, d.y + 1, 13 - b * 0.8, 5 - b * 0.3);
    }
    for (let i = dust.length - 1; i >= 0; i--) {
      const q = dust[i]; q.life -= dt * 2.2; q.x += q.vx * dt; q.r += dt * 9;
      if (q.life <= 0) { dust.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(236,226,196,${0.5 * q.life})`; ellipse(ctx, q.x, q.y - (1 - q.life) * 4, q.r, q.r * 0.6);
    }
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    for (const s of state.stars) { const z = starZ(s, t); ellipse(ctx, s.x + 2, s.y + 1, 10 - z * 0.15, 4 - z * 0.05); }

    // 依前後深度排序繪製
    const me = disp[myId];
    const ents = [];
    for (const dr of drawables) ents.push({ sort: dr.sort, fn: () => {
      let alpha = 1;
      if (dr.canopy && me && me.y < dr.sort) {
        const c = dr.canopy;
        if (me.x + 12 > c.x && me.x - 12 < c.x + c.w && me.y > c.y && me.y - PH < c.y + c.h) alpha = 0.45;
      }
      ctx.globalAlpha = alpha; ctx.drawImage(dr.img, dr.x, dr.y, dr.w, dr.h); ctx.globalAlpha = 1;
    } });
    for (const p of state.players) if (disp[p.id]) ents.push({ sort: disp[p.id].y, fn: () => drawPlayer(p, t, 1) });
    for (const s of state.stars) ents.push({ sort: s.y, fn: () => drawStar(s, t) });
    ents.sort((x, y) => x.sort - y.sort);
    for (const e of ents) e.fn();

    // 自己被擋住時仍看得到淡淡的身影
    const mine = state.players.find(p => p.id === myId);
    if (mine) drawPlayer(mine, t, 0.22);

    // 粒子
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.x += q.vx * dt; q.y += q.vy * dt; q.vz -= 380 * dt; q.z += q.vz * dt;
      if (q.z < 0) { q.z = 0; q.vz *= -0.4; }
      q.life -= dt * 1.4;
      if (q.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, q.life * 1.5); ctx.fillStyle = q.col;
      ctx.fillRect(q.x - q.size / 2, q.y - q.z - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.life -= dt * 1.2; f.y -= dt * 30;
      if (f.life <= 0) { floaters.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.lineWidth = 3; ctx.strokeStyle = '#7f4a00'; ctx.strokeText('+1', f.x, f.y);
      ctx.fillStyle = '#ffe066'; ctx.fillText('+1', f.x, f.y);
    }
    ctx.globalAlpha = 1;

    // 名牌
    const best = Math.max(0, ...state.players.map(p => p.score));
    const leaders = state.players.filter(p => p.score === best);
    for (const p of state.players) drawLabel(p, best > 0 && leaders.length === 1 && p.score === best);

    // 勝利畫面
    if (state.winner) {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.fillStyle = 'rgba(8,12,20,.6)'; ctx.fillRect(0, 0, VW, VH);
      const bw = 440, bh = 140, bx = (VW - bw) / 2, by = (VH - bh) / 2;
      ctx.fillStyle = '#222'; roundRect(ctx, bx + 6, by + 6, bw, bh, 14); ctx.fill();
      ctx.fillStyle = '#fff'; roundRect(ctx, bx, by, bw, bh, 14); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#222'; ctx.stroke();
      ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 34px "Noto Sans TC", system-ui, sans-serif';
      ctx.fillText(`🏆 ${state.winner} 獲勝！`, VW / 2, by + 56);
      ctx.font = '16px "Noto Sans TC", system-ui, sans-serif'; ctx.fillStyle = '#666';
      ctx.fillText('新地圖即將生成…', VW / 2, by + 100);
    }
  }
  requestAnimationFrame(frame);

  // ---------- 對外介面 ----------
  window.Game = {
    _disp: disp, // 除錯用
    start(cfg, id, hooks) {
      W = cfg.W; H = cfg.H; PW = cfg.PW; PH = cfg.PH; myId = id;
      if (hooks) io = hooks;
      local = null; pending = []; snaps = []; clockOffset = null; renderOffset = null; acc = 0; errX = errY = 0;
      VW = W; VH = PAD_TOP + H + CLIFF;
      resize();
      if (obstacles.length) buildMap();
    },
    setMap(list) {
      obstacles = list || []; skipBurst = true;
      if (VW) buildMap();
    },
    setSprites(map) {
      sprites = map;
      for (const [id, s] of Object.entries(map)) {
        if (chars[id] && chars[id].src === s.sprite) continue;
        const entry = chars[id] = { src: s.sprite, c: null, s: 4, pad: 2 };
        const im = new Image();
        im.onload = () => { if (chars[id] === entry) Object.assign(entry, buildChar(im)); };
        im.src = s.sprite;
      }
    },
    setState(s) {
      const ids = new Set(s.stars.map(x => x.id));
      if (!skipBurst) for (const [id, st] of prevStars) if (!ids.has(id)) burst(st.x, st.y);
      skipBurst = false;
      prevStars = new Map(s.stars.map(x => [x.id, x]));
      state = s;

      // 時鐘對齊：估計「伺服器時間 − 本機時間」，偏向延遲最低的那次
      const now = performance.now(), sample = s.t - now;
      if (clockOffset === null || sample > clockOffset) clockOffset = sample;
      else clockOffset += (sample - clockOffset) * 0.02;
      const map = {};
      for (const p of s.players) map[p.id] = p;
      snaps.push({ t: s.t, map });
      while (snaps.length > 2 && snaps[1].t < now + clockOffset - INTERP_MS - 500) snaps.shift();

      // 伺服器校正：從伺服器確認的位置重播尚未確認的指令
      const mine = map[myId];
      if (!mine) return;
      if (!local) {
        local = { x: mine.x, y: mine.y, vx: mine.vx, vy: mine.vy, facing: mine.facing };
        prevPos = { x: mine.x, y: mine.y };
        return;
      }
      pending = pending.filter(c => c[0] > mine.ack);
      const r = { x: mine.x, y: mine.y, vx: mine.vx, vy: mine.vy, facing: local.facing };
      for (const c of pending) Move.step(r, c[1], obstacles, W, H);
      const ex = local.x - r.x, ey = local.y - r.y;
      if (Math.hypot(ex, ey) > 60) { errX = errY = 0; prevPos = { x: r.x, y: r.y }; } // 新回合傳送：直接跳過去
      else if (ex || ey) { errX += ex; errY += ey; prevPos.x -= ex; prevPos.y -= ey; }
      Object.assign(local, r);
    }
  };
})();

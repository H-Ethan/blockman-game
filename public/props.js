// 宇宙廣場的建築與擺設（2.5D：頂面在上、正面在下，座標同地面俯視座標）
(function () {
  'use strict';
  const FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif';
  const rng = seed => {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  function mk(w, h, s = window.Props.scale) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * s); c.height = Math.ceil(h * s);
    const g = c.getContext('2d'); g.scale(s, s);
    return [c, g];
  }
  const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const ellipse = (g, x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); g.fill(); };
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function outlineText(g, text, x, y, size, fill, stroke, weight = 900) {
    g.font = `${weight} ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = Math.max(2, size / 5); g.strokeStyle = stroke; g.strokeText(text, x, y);
    g.fillStyle = fill; g.fillText(text, x, y);
  }

  // =========================================================
  // 「你畫我猜」：立在畫架上的巨幅畫作，屋頂是調色盤
  // =========================================================
  function drawGuessBuilding(o) {
    const w = o.w, d = o.d, h = o.h, PX = 46, PT = 14;
    const CW = w + PX * 2, CH = PT + d + h + 4;
    const [c, g] = mk(CW, CH);
    const r = rng(o.seed);
    const X = PX, TOP = PT, FY = PT + d, BOT = FY + h; // 正面左上角 (X, FY)

    // --- 畫架後腳（從屋頂後方伸出） ---
    g.fillStyle = '#7a4a26'; g.save(); g.translate(X + w / 2, TOP + 6); g.rotate(-0.05);
    g.fillRect(-6, -14, 12, 30); g.restore();

    // --- 牆面本體（側邊厚度感） ---
    const wall = g.createLinearGradient(0, FY, 0, BOT);
    wall.addColorStop(0, '#fff6e2'); wall.addColorStop(1, '#efd9b4');
    g.fillStyle = wall; g.fillRect(X, FY, w, h);

    // --- 巨幅畫框 ---
    const fx = X + 8, fy = FY + 10, fw = w - 16, fh = h - 22;
    const gold = g.createLinearGradient(fx, fy, fx + fw, fy + fh);
    gold.addColorStop(0, '#ffe08a'); gold.addColorStop(0.5, '#e0a93a'); gold.addColorStop(1, '#b77a1c');
    g.fillStyle = gold; g.fillRect(fx, fy, fw, fh);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(fx, fy, fw, 2); g.fillRect(fx, fy, 2, fh);
    g.fillStyle = 'rgba(90,50,0,.35)'; g.fillRect(fx, fy + fh - 2, fw, 2); g.fillRect(fx + fw - 2, fy, 2, fh);
    for (let i = 0; i < 26; i++) { // 畫框雕花小點
      g.fillStyle = 'rgba(255,240,190,.75)';
      circle(g, fx + 5 + (i / 25) * (fw - 10), fy + 5, 1.3); circle(g, fx + 5 + (i / 25) * (fw - 10), fy + fh - 5, 1.3);
    }
    // 畫作內容（童趣風景）
    const ix = fx + 10, iy = fy + 10, iw = fw - 20, ih = fh - 20;
    g.save(); g.beginPath(); g.rect(ix, iy, iw, ih); g.clip();
    const sky = g.createLinearGradient(0, iy, 0, iy + ih);
    sky.addColorStop(0, '#8fd3ff'); sky.addColorStop(1, '#e8f7ff');
    g.fillStyle = sky; g.fillRect(ix, iy, iw, ih);
    // 彩虹
    ['#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#9775fa'].forEach((col, i) => {
      g.strokeStyle = col; g.lineWidth = 4; g.beginPath(); g.arc(ix + iw * 0.28, iy + ih * 0.95, 70 - i * 4, Math.PI, 0); g.stroke();
    });
    // 太陽（蠟筆風）
    g.fillStyle = '#ffd43b'; circle(g, ix + iw * 0.84, iy + 20, 12);
    g.strokeStyle = '#ffa94d'; g.lineWidth = 2.2;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.beginPath(); g.moveTo(ix + iw * 0.84 + Math.cos(a) * 16, iy + 20 + Math.sin(a) * 16);
      g.lineTo(ix + iw * 0.84 + Math.cos(a) * 21, iy + 20 + Math.sin(a) * 21); g.stroke();
    }
    // 白雲
    g.fillStyle = '#fff';
    [[0.55, 18], [0.12, 14]].forEach(([fxp, y]) => { const cx = ix + iw * fxp; circle(g, cx, iy + y, 7); circle(g, cx + 9, iy + y - 3, 8); circle(g, cx + 18, iy + y, 7); });
    // 山丘
    g.fillStyle = '#74c365'; g.beginPath(); g.moveTo(ix, iy + ih);
    g.quadraticCurveTo(ix + iw * 0.25, iy + ih * 0.45, ix + iw * 0.55, iy + ih * 0.8);
    g.quadraticCurveTo(ix + iw * 0.8, iy + ih * 0.5, ix + iw, iy + ih * 0.72); g.lineTo(ix + iw, iy + ih); g.fill();
    g.fillStyle = '#5aa84f'; g.beginPath(); g.moveTo(ix, iy + ih * 0.9);
    g.quadraticCurveTo(ix + iw * 0.5, iy + ih * 0.65, ix + iw, iy + ih * 0.92); g.lineTo(ix + iw, iy + ih); g.lineTo(ix, iy + ih); g.fill();
    // 小花
    for (let i = 0; i < 14; i++) {
      g.fillStyle = ['#ff8fab', '#fff', '#ffe066', '#c3a6ff'][i % 4];
      circle(g, ix + 6 + r() * (iw - 12), iy + ih * 0.82 + r() * ih * 0.16, 1.8);
    }
    // 蠟筆筆觸紋理
    for (let i = 0; i < 260; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.05)'; g.fillRect(ix + r() * iw, iy + r() * ih, 3 + r() * 5, 1); }
    g.restore();

    // --- 顏料從屋頂流下來 ---
    const drips = ['#ff5a5f', '#ffd23f', '#3b82f6', '#22c55e', '#ff8fab', '#a855f7'];
    for (let i = 0; i < 9; i++) {
      const dx = X + 14 + (i / 8) * (w - 28) + (r() - 0.5) * 10, len = 8 + r() * 26, dw = 5 + r() * 4;
      g.fillStyle = drips[i % drips.length];
      g.fillRect(dx - dw / 2, FY - 1, dw, len); circle(g, dx, FY - 1 + len, dw / 2 + 0.6);
      g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(dx - dw / 2 + 1, FY, 1.3, len - 2);
    }

    // --- 入口：拱門 + 溫暖燈光 ---
    const dw = 58, dh = 66, dx = X + w / 2 - dw / 2, dy = BOT - dh;
    g.fillStyle = '#6b3f1f'; rr(g, dx - 6, dy - 6, dw + 12, dh + 6, 26); g.fill();
    g.save(); rr(g, dx, dy, dw, dh + 2, 22); g.clip();
    const glow = g.createLinearGradient(0, dy, 0, BOT);
    glow.addColorStop(0, '#ffcf6b'); glow.addColorStop(1, '#fff3c4');
    g.fillStyle = glow; g.fillRect(dx, dy, dw, dh + 2);
    // 門內看得到的小畫架剪影
    g.strokeStyle = 'rgba(150,90,30,.45)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(dx + 14, BOT); g.lineTo(dx + 22, dy + 22); g.lineTo(dx + 30, BOT); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(dx + 13, dy + 22, 18, 14);
    g.restore();
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(dx - 6, dy + 8, 2, dh - 8);

    // --- 招牌「你畫我猜」 ---
    const sw = 136, sh = 30, sx = X + w / 2 - sw / 2, sy = dy - 40;
    g.strokeStyle = '#4a3020'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(sx + 18, fy + 2); g.lineTo(sx + 18, sy); g.moveTo(sx + sw - 18, fy + 2); g.lineTo(sx + sw - 18, sy); g.stroke();
    g.fillStyle = '#2b1a10'; rr(g, sx + 2, sy + 3, sw, sh, 7); g.fill();
    const sg = g.createLinearGradient(0, sy, 0, sy + sh);
    sg.addColorStop(0, '#ff7b7b'); sg.addColorStop(1, '#e8434b');
    g.fillStyle = sg; rr(g, sx, sy, sw, sh, 7); g.fill();
    g.lineWidth = 2; g.strokeStyle = '#2b1a10'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.3)'; rr(g, sx + 4, sy + 3, sw - 8, 5, 3); g.fill();
    outlineText(g, '你畫我猜', sx + sw / 2 + 8, sy + sh / 2 + 1, 17, '#fff', '#7a1d22');
    // 小鉛筆圖示
    g.save(); g.translate(sx + 17, sy + sh / 2); g.rotate(-0.7);
    g.fillStyle = '#ffd23f'; g.fillRect(-9, -3, 14, 6); g.fillStyle = '#ff8fab'; g.fillRect(-12, -3, 3, 6);
    g.fillStyle = '#f4d3a1'; g.beginPath(); g.moveTo(5, -3); g.lineTo(10, 0); g.lineTo(5, 3); g.fill();
    g.fillStyle = '#333'; g.beginPath(); g.moveTo(8.5, -1); g.lineTo(10, 0); g.lineTo(8.5, 1); g.fill();
    g.restore();

    // --- 屋頂：巨大調色盤（頂面） ---
    g.fillStyle = '#8a5a2b'; // 調色盤厚度
    g.beginPath(); g.ellipse(X + w / 2, FY - 2, w / 2 + 10, 9, 0, 0, Math.PI); g.fill();
    g.fillRect(X - 10, TOP + d / 2, w + 20, d / 2 - 2);
    const pal = g.createLinearGradient(X, TOP, X + w, FY);
    pal.addColorStop(0, '#f6d9a8'); pal.addColorStop(1, '#d9a866');
    g.fillStyle = pal;
    g.beginPath(); g.ellipse(X + w / 2, TOP + d / 2, w / 2 + 10, d / 2 + 2, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a5a2b'; g.lineWidth = 1.5; g.stroke();
    // 拇指洞
    g.fillStyle = '#5b3a1c'; ellipse(g, X + w * 0.78, TOP + d * 0.38, 13, 8);
    g.fillStyle = '#3a2412'; ellipse(g, X + w * 0.78, TOP + d * 0.42, 11, 5);
    // 木紋
    g.strokeStyle = 'rgba(140,90,40,.25)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(X + w / 2, TOP + d / 2, w / 2 - 10 - i * 18, d / 2 - 8 - i * 6, 0, 0.3, 2.6); g.stroke(); }
    // 顏料團
    const blobs = [[0.12, 0.45], [0.24, 0.2], [0.42, 0.14], [0.6, 0.18], [0.2, 0.72], [0.4, 0.8], [0.6, 0.78], [0.86, 0.7]];
    blobs.forEach(([bx, by], i) => {
      const cx = X + w * bx, cy = TOP + d * by, col = drips[i % drips.length], rad = 9 + r() * 4;
      g.fillStyle = 'rgba(0,0,0,.18)'; ellipse(g, cx + 1.5, cy + 2, rad, rad * 0.7);
      g.fillStyle = col; ellipse(g, cx, cy, rad, rad * 0.7);
      ellipse(g, cx + rad * 0.6, cy - 2, rad * 0.5, rad * 0.35);
      g.fillStyle = 'rgba(255,255,255,.55)'; ellipse(g, cx - rad * 0.35, cy - rad * 0.25, rad * 0.3, rad * 0.18);
    });
    // 一大坨白色顏料（像奶油）
    g.fillStyle = '#ffffff'; ellipse(g, X + w * 0.44, TOP + d * 0.48, 14, 9); ellipse(g, X + w * 0.47, TOP + d * 0.42, 9, 6);
    g.fillStyle = 'rgba(0,0,0,.08)'; ellipse(g, X + w * 0.45, TOP + d * 0.53, 12, 3);

    // --- 畫架前腳（斜斜撐在兩側） ---
    const leg = (x1, y1, x2, y2) => {
      g.strokeStyle = '#5b3416'; g.lineWidth = 11; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.strokeStyle = '#8b5a2b'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.strokeStyle = 'rgba(255,230,190,.45)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x1 - 2, y1); g.lineTo(x2 - 2, y2); g.stroke();
    };
    leg(X + 8, FY + 6, X - 22, BOT + 2);
    leg(X + w - 8, FY + 6, X + w + 22, BOT + 2);
    // 畫架托盤（放畫的橫木）
    g.fillStyle = '#5b3416'; g.fillRect(X - 8, BOT - 12, w + 16, 9);
    g.fillStyle = '#9a6a38'; g.fillRect(X - 8, BOT - 12, w + 16, 5);
    // 托盤上的蠟筆
    ['#ff5a5f', '#3b82f6', '#22c55e', '#ffd23f'].forEach((col, i) => {
      const cx = X + 20 + i * 14;
      g.fillStyle = col; g.fillRect(cx, BOT - 17, 11, 5);
      g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(cx, BOT - 17, 11, 1.4);
    });

    // --- 右側斜靠的大畫筆 ---
    g.save(); g.translate(X + w + 30, BOT); g.rotate(-0.22);
    g.fillStyle = '#b5372d'; rr(g, -5, -128, 10, 96, 5); g.fill();
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(-3, -124, 2, 88);
    g.fillStyle = '#c9ced6'; g.fillRect(-6, -148, 12, 22);
    g.fillStyle = '#9aa1ab'; g.fillRect(-6, -136, 12, 3);
    g.fillStyle = '#3b2a1a'; g.beginPath(); g.moveTo(-6, -148); g.quadraticCurveTo(0, -180, 6, -148); g.fill();
    g.fillStyle = '#3b82f6'; g.beginPath(); g.moveTo(-4.5, -158); g.quadraticCurveTo(0, -182, 4.5, -158); g.fill();
    g.restore();
    // --- 左側斜靠的大鉛筆 ---
    g.save(); g.translate(X - 30, BOT); g.rotate(0.2);
    g.fillStyle = '#ffd23f'; g.fillRect(-6, -120, 12, 108);
    g.fillStyle = '#f2b705'; g.fillRect(2, -120, 4, 108);
    g.fillStyle = '#c9ced6'; g.fillRect(-6, -128, 12, 8);
    g.fillStyle = '#ff8fab'; rr(g, -6, -142, 12, 15, 4); g.fill();
    g.fillStyle = '#f4d3a1'; g.beginPath(); g.moveTo(-6, -12); g.lineTo(0, 4); g.lineTo(6, -12); g.fill();
    g.restore();

    return { img: c, x: o.x - PX, y: o.y - h - PT, w: CW, h: CH, sort: o.y + o.d, ghostFade: true };
  }

  // =========================================================
  // 搶星星草原：石柱拱門
  // =========================================================
  function pillar(o) {
    const h = 74, P = 4, CW = o.w + P * 2, CH = o.d + h + P * 2 + 10;
    const [c, g] = mk(CW, CH);
    const x = P, y = P + 10;
    const side = g.createLinearGradient(x, 0, x + o.w, 0);
    side.addColorStop(0, '#d9d2c3'); side.addColorStop(1, '#a89f8c');
    g.fillStyle = side; g.fillRect(x, y + o.d, o.w, h);
    for (let i = 1; i < 5; i++) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, y + o.d + i * 15, o.w, 1.2); }
    g.fillStyle = '#efe8da'; g.fillRect(x, y, o.w, o.d);
    g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(x, y, o.w, 1.5);
    g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x + o.w - 2, y, 2, o.d + h);
    return { img: c, x: o.x - P, y: o.y - h - P - 10, w: CW, h: CH, sort: o.y + o.d };
  }
  function starGate(o) {
    const h = 74, beamH = 22, P = 30, CW = o.w + P * 2, CH = 70 + beamH;
    const [c, g] = mk(CW, CH);
    const bx = P - 4, by = 40, bw = o.w + 8;
    g.fillStyle = '#8a7f6a'; g.fillRect(bx, by + 8, bw, beamH - 4);
    g.fillStyle = '#e6dfcf'; g.fillRect(bx, by, bw, 9);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(bx, by, bw, 1.5);
    // 招牌
    const sw = 98, sx = P + o.w / 2 - sw / 2, sy = by + 6;
    g.fillStyle = '#1f3a5f'; rr(g, sx, sy, sw, 18, 5); g.fill();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 1.5; g.stroke();
    outlineText(g, '搶星星草原', sx + sw / 2, sy + 9.5, 11, '#ffe066', '#0b1a2e', 800);
    // 大星星
    const cx = P + o.w / 2, cy = 20;
    g.save(); g.translate(cx, cy);
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? 7.5 : 17; g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } g.closePath();
    const sg = g.createLinearGradient(0, -17, 0, 17); sg.addColorStop(0, '#fff7b8'); sg.addColorStop(1, '#f2a100');
    g.fillStyle = sg; g.fill(); g.lineWidth = 2; g.strokeStyle = '#7f4a00'; g.stroke();
    g.restore();
    return { img: c, x: o.x - P, y: o.y - h - 30 + 0, w: CW, h: CH, sort: o.y + o.d + 0.5 };
  }

  // =========================================================
  // 施工中的空地
  // =========================================================
  function lot(o) {
    const fh = 20, P = 8, CW = o.w + P * 2, CH = o.d + fh + 70;
    const [c, g] = mk(CW, CH);
    const x = P, y = 60, r = rng(o.seed);
    // 泥土地
    g.fillStyle = '#b98a5a'; g.fillRect(x, y, o.w, o.d);
    for (let i = 0; i < 160; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.08)'; g.fillRect(x + r() * o.w, y + r() * o.d, 3, 2); }
    // 鷹架
    g.strokeStyle = '#7d8590'; g.lineWidth = 2.2;
    for (let i = 0; i < 4; i++) { const sx = x + 24 + i * 36; g.beginPath(); g.moveTo(sx, y + o.d * 0.55); g.lineTo(sx, y - 40); g.stroke(); }
    for (let j = 0; j < 3; j++) { const sy = y - 36 + j * 26; g.beginPath(); g.moveTo(x + 22, sy); g.lineTo(x + 134, sy); g.stroke(); }
    g.strokeStyle = 'rgba(125,133,144,.6)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x + 24, y - 36); g.lineTo(x + 60, y - 10); g.moveTo(x + 96, y - 36); g.lineTo(x + 132, y - 10); g.stroke();
    // 招牌
    const sw = 120, sx = x + o.w / 2 - sw / 2, sy = y + 6;
    g.fillStyle = '#5b3416'; g.fillRect(sx + 16, sy + 20, 5, 22); g.fillRect(sx + sw - 21, sy + 20, 5, 22);
    g.fillStyle = '#ffd23f'; rr(g, sx, sy, sw, 26, 4); g.fill(); g.strokeStyle = '#2b2b2b'; g.lineWidth = 1.6; g.stroke();
    outlineText(g, o.label || '建設中', sx + sw / 2, sy + 13.5, 11.5, '#2b2b2b', '#ffd23f', 800);
    // 前方圍欄（紅白相間）
    const top = y + o.d - 2;
    for (let i = 0; i < o.w; i += 12) { g.fillStyle = (i / 12) % 2 ? '#ffffff' : '#ef4444'; g.fillRect(x + i, top, 12, fh * 0.45); }
    g.fillStyle = '#334155'; for (let i = 0; i <= o.w; i += 44) g.fillRect(x + i - 2, top - 2, 4, fh + 2);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.strokeRect(x, top, o.w, fh * 0.45);
    // 三角錐
    [[x + 8, top + fh + 2], [x + o.w - 8, top + fh + 2]].forEach(([cx, cy]) => {
      g.fillStyle = '#f97316'; g.beginPath(); g.moveTo(cx, cy - 18); g.lineTo(cx - 7, cy); g.lineTo(cx + 7, cy); g.fill();
      g.fillStyle = '#fff'; g.fillRect(cx - 4, cy - 10, 8, 3);
    });
    return { img: c, x: o.x - P, y: o.y - 60, w: CW, h: CH, sort: o.y + o.d };
  }

  // =========================================================
  // 噴水池、長椅、路燈
  // =========================================================
  function fountain(o) {
    const rimH = 16, P = 6, CW = o.w + P * 2, CH = o.d + rimH + 54;
    const [c, g] = mk(CW, CH);
    const cx = P + o.w / 2, cy = 46 + o.d / 2, rx = o.w / 2, ry = o.d / 2;
    // 外緣正面
    g.fillStyle = '#9a9488'; g.beginPath(); g.ellipse(cx, cy + rimH, rx, ry, 0, 0, Math.PI); g.lineTo(cx - rx, cy); g.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true); g.fill();
    g.fillStyle = 'rgba(0,0,0,.15)'; for (let i = 1; i < 6; i++) { g.fillRect(cx - rx + i * (o.w / 6), cy + ry * 0.4, 1.2, rimH); }
    // 外緣頂面
    g.fillStyle = '#e4ddcf'; ellipse(g, cx, cy, rx, ry);
    // 水
    const water = g.createRadialGradient(cx - 10, cy - 6, 2, cx, cy, rx);
    water.addColorStop(0, '#9be7ff'); water.addColorStop(1, '#2f8fd8');
    g.fillStyle = water; ellipse(g, cx, cy + 1, rx - 7, ry - 5);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(cx, cy + 2, 12 + i * 10, 5 + i * 4, 0, 0.2, 2.8); g.stroke(); }
    // 中央柱與水花
    g.fillStyle = '#cfc7b6'; g.fillRect(cx - 5, cy - 22, 10, 22);
    g.fillStyle = '#e4ddcf'; ellipse(g, cx, cy - 22, 12, 5);
    g.fillStyle = 'rgba(190,240,255,.85)';
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      g.beginPath(); g.moveTo(cx, cy - 26); g.quadraticCurveTo(cx + Math.cos(a) * 18, cy - 44, cx + Math.cos(a) * 26, cy - 16 + Math.abs(Math.sin(a)) * 4);
      g.lineWidth = 2; g.strokeStyle = 'rgba(190,240,255,.85)'; g.stroke();
    }
    g.fillStyle = '#e6faff'; ellipse(g, cx, cy - 28, 4, 6);
    return { img: c, x: o.x - P, y: o.y - 46, w: CW, h: CH, sort: o.y + o.d };
  }
  function bench(o) {
    const P = 3, CW = o.w + P * 2, CH = o.d + 26;
    const [c, g] = mk(CW, CH);
    const x = P, y = 8;
    g.fillStyle = '#3f3f46'; g.fillRect(x + 4, y + 8, 3, o.d + 10); g.fillRect(x + o.w - 7, y + 8, 3, o.d + 10);
    g.fillStyle = '#8b5a2b'; g.fillRect(x, y, o.w, 5); // 椅背
    g.fillStyle = '#b07a43'; g.fillRect(x, y + 9, o.w, o.d - 2);
    g.fillStyle = 'rgba(0,0,0,.15)'; for (let i = 1; i < 3; i++) g.fillRect(x, y + 9 + i * (o.d - 2) / 3, o.w, 1);
    g.fillStyle = '#8b5a2b'; g.fillRect(x, y + 7 + o.d, o.w, 4);
    return { img: c, x: o.x - P, y: o.y - 10, w: CW, h: CH, sort: o.y + o.d };
  }
  function lamp(o) {
    const CW = 24, CH = 74;
    const [c, g] = mk(CW, CH);
    const cx = 12;
    g.fillStyle = '#2f3542'; g.fillRect(cx - 2, 18, 4, 52); g.fillRect(cx - 5, 66, 10, 5);
    g.fillStyle = '#2f3542'; g.beginPath(); g.moveTo(cx - 8, 8); g.lineTo(cx + 8, 8); g.lineTo(cx + 5, 2); g.lineTo(cx - 5, 2); g.fill();
    const lg = g.createRadialGradient(cx, 13, 1, cx, 13, 9); lg.addColorStop(0, '#fff8d6'); lg.addColorStop(1, '#ffc94d');
    g.fillStyle = lg; g.fillRect(cx - 6, 8, 12, 11);
    g.fillStyle = '#2f3542'; g.fillRect(cx - 7, 18, 14, 3);
    return { img: c, x: o.x + o.w / 2 - cx, y: o.y + o.d - 71, w: CW, h: CH, sort: o.y + o.d };
  }

  // =========================================================
  // 廣場地面
  // =========================================================
  function plazaGround(g, W, H, top, r) {
    // 草地底
    g.fillStyle = '#86c95b'; g.fillRect(0, top, W, H);
    for (let i = 0; i < 40; i++) {
      const x = r() * W, y = top + r() * H, rad = 40 + r() * 100;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      const col = r() < 0.5 ? '96,168,62' : '162,216,106';
      gr.addColorStop(0, `rgba(${col},.5)`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 4000; i++) { g.fillStyle = r() < 0.55 ? 'rgba(40,95,30,.16)' : 'rgba(230,255,190,.14)'; g.fillRect(r() * W, top + r() * H, 1.4, 1.4); }

    // 石板鋪面（中央廣場＋通往各建築的步道）
    const paved = new Path2D();
    const roundRect = (x, y, w, h, rad) => { paved.moveTo(x + rad, y); paved.arcTo(x + w, y, x + w, y + h, rad); paved.arcTo(x + w, y + h, x, y + h, rad); paved.arcTo(x, y + h, x, y, rad); paved.arcTo(x, y, x + w, y, rad); paved.closePath(); };
    roundRect(110, top + 214, 740, 362, 46);   // 中央廣場
    roundRect(426, top + 186, 108, 60, 10);    // 往你畫我猜
    roundRect(122, top + 160, 96, 80, 10);     // 往搶星星草原
    roundRect(750, top + 186, 100, 60, 10);    // 往建設中空地
    g.save(); g.clip(paved);
    g.fillStyle = '#e7dccb'; g.fillRect(0, top, W, H);
    const T = 24;
    for (let y = top + 160; y < top + H; y += T) {
      const off = (Math.floor((y - top) / T) % 2) * (T / 2);
      for (let x = -T; x < W + T; x += T) {
        const v = 210 + Math.floor(r() * 26);
        g.fillStyle = `rgb(${v + 14},${v + 4},${v - 14})`;
        g.fillRect(x + off + 1, y + 1, T - 2, T - 2);
        g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + off + 1, y + 1, T - 2, 1.5);
      }
    }
    // 噴水池周圍的圓形花紋
    const fx = 480, fy = top + 358;
    ['rgba(232,122,98,.55)', 'rgba(255,214,102,.5)', 'rgba(110,170,220,.45)'].forEach((col, i) => {
      g.strokeStyle = col; g.lineWidth = 7; g.beginPath(); g.ellipse(fx, fy, 112 - i * 13, 66 - i * 8, 0, 0, Math.PI * 2); g.stroke();
    });
    g.restore();

    // 建築前的花圃
    const bed = (x, y, w) => {
      g.fillStyle = '#7a5230'; rr(g, x, top + y, w, 14, 5); g.fill();
      g.fillStyle = '#5b3a1c'; rr(g, x + 2, top + y + 2, w - 4, 10, 4); g.fill();
      for (let i = 0; i < w / 7; i++) {
        g.fillStyle = '#3f8f3a'; circle(g, x + 5 + i * 7, top + y + 6, 3.2);
        g.fillStyle = ['#ff5a5f', '#ffd23f', '#ff8fab', '#ffffff', '#a855f7'][i % 5]; circle(g, x + 5 + i * 7, top + y + 4.5, 2);
      }
    };
    bed(360, 206, 76); bed(524, 206, 76);
  }

  window.Props = { scale: 3, drawGuessBuilding, pillar, starGate, lot, fountain, bench, lamp, plazaGround, outlineText, rr, FONT };
})();

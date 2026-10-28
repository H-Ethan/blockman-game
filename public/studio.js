// 你畫我猜建築內部：畫室場景（大廳／房間共用），邏輯座標 960 × 600
(function () {
  'use strict';
  const VW = 960, VH = 600, WALL = 150;
  const BOARD = { x: 250, y: 66, w: 460, h: 345 };          // 中央大畫板（4:3）
  // 座位（腳底位置）：左右各 4 個
  const SEATS = [
    { x: 78, y: 262 }, { x: 882, y: 262 }, { x: 182, y: 300 }, { x: 778, y: 300 },
    { x: 78, y: 470 }, { x: 882, y: 470 }, { x: 182, y: 508 }, { x: 778, y: 508 },
  ];
  const CUSHIONS = ['#ff8fab', '#7cc6fe', '#ffd166', '#95e06c', '#c3a6ff', '#ffa94d', '#6ee7d5', '#f4978e'];
  const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  const ellipse = (g, x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };

  function wallAndFloor(g, r) {
    // 牆：奶油色直條紋
    g.fillStyle = '#fff1d6'; g.fillRect(0, 0, VW, WALL);
    for (let x = 0; x < VW; x += 32) { g.fillStyle = '#ffe7bf'; g.fillRect(x, 0, 16, WALL); }
    // 窗戶（看得到宇宙都市的夜空）
    for (const wx of [34, 816]) {
      g.fillStyle = '#7a4a26'; g.fillRect(wx - 6, 18, 122, 86);
      const sky = g.createLinearGradient(0, 24, 0, 98); sky.addColorStop(0, '#1a1240'); sky.addColorStop(1, '#4b3a8a');
      g.fillStyle = sky; g.fillRect(wx, 24, 110, 74);
      for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`; g.fillRect(wx + r() * 108, 26 + r() * 50, 1.6, 1.6); }
      g.fillStyle = '#ffe9a8'; circle(g, wx + 84, 42, 9); g.fillStyle = '#4b3a8a'; circle(g, wx + 88, 39, 8);
      g.fillStyle = '#2a1f55'; for (let i = 0; i < 6; i++) { const bh = 10 + r() * 22; g.fillRect(wx + i * 19, 98 - bh, 16, bh); }
      g.fillStyle = '#7a4a26'; g.fillRect(wx + 52, 24, 6, 74); g.fillRect(wx, 58, 110, 5);
      g.fillStyle = '#9a6a38'; g.fillRect(wx - 10, 102, 130, 8);
    }
    // 牆上的小畫作
    const frames = [[168, 26, 58, 44, 'sun'], [736, 26, 58, 44, 'cat']];
    for (const [fx, fy, fw, fh, kind] of frames) {
      g.fillStyle = '#e0a93a'; g.fillRect(fx - 5, fy - 5, fw + 10, fh + 10);
      g.fillStyle = '#fff'; g.fillRect(fx, fy, fw, fh);
      if (kind === 'sun') {
        g.fillStyle = '#ffd43b'; circle(g, fx + 20, fy + 18, 9);
        g.fillStyle = '#74c365'; g.fillRect(fx, fy + 32, fw, 12);
        g.fillStyle = '#ff6b6b'; g.fillRect(fx + 36, fy + 20, 14, 12); g.beginPath(); g.moveTo(fx + 34, fy + 21); g.lineTo(fx + 43, fy + 12); g.lineTo(fx + 52, fy + 21); g.fill();
      } else {
        g.fillStyle = '#ffa94d'; circle(g, fx + 29, fy + 24, 13);
        g.beginPath(); g.moveTo(fx + 18, fy + 16); g.lineTo(fx + 20, fy + 5); g.lineTo(fx + 27, fy + 13); g.fill();
        g.beginPath(); g.moveTo(fx + 40, fy + 16); g.lineTo(fx + 38, fy + 5); g.lineTo(fx + 31, fy + 13); g.fill();
        g.fillStyle = '#333'; circle(g, fx + 24, fy + 22, 1.6); circle(g, fx + 34, fy + 22, 1.6);
      }
    }
    // 三角旗彩帶
    g.strokeStyle = '#8b5a2b'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(240, 8); g.quadraticCurveTo(480, 34, 720, 8); g.stroke();
    const flags = ['#ff5a5f', '#ffd23f', '#3b82f6', '#22c55e', '#ff8fab', '#a855f7'];
    for (let i = 0; i < 15; i++) {
      const t = (i + 0.5) / 15, x = 240 + t * 480, y = 8 + 52 * t * (1 - t);
      g.fillStyle = flags[i % flags.length]; g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y); g.lineTo(x, y + 15); g.fill();
    }
    // 護牆板與踢腳板
    g.fillStyle = '#c98b4f'; g.fillRect(0, WALL - 34, VW, 34);
    for (let x = 0; x < VW; x += 48) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, WALL - 30, 2, 28); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + 4, WALL - 30, 40, 2); }
    g.fillStyle = '#8b5a2b'; g.fillRect(0, WALL - 36, VW, 4); g.fillRect(0, WALL - 4, VW, 6);

    // 木地板
    g.fillStyle = '#e2a96b'; g.fillRect(0, WALL, VW, VH - WALL);
    for (let y = WALL + 2, row = 0; y < VH; y += 26, row++) {
      for (let x = -((row % 3) * 60); x < VW; x += 180) {
        const v = r() * 18 - 9;
        g.fillStyle = `rgb(${226 + v},${169 + v},${107 + v})`; g.fillRect(x + 1, y, 178, 24);
        g.fillStyle = 'rgba(120,70,30,.10)'; for (let i = 0; i < 3; i++) g.fillRect(x + 10 + r() * 150, y + 6 + r() * 12, 20 + r() * 30, 1);
      }
      g.fillStyle = 'rgba(110,60,20,.28)'; g.fillRect(0, y + 24, VW, 2);
    }
    const shade = g.createLinearGradient(0, WALL, 0, WALL + 40);
    shade.addColorStop(0, 'rgba(60,30,10,.28)'); shade.addColorStop(1, 'rgba(60,30,10,0)');
    g.fillStyle = shade; g.fillRect(0, WALL, VW, 40);
  }

  function rug(g, cx, cy, rx, ry) {
    g.fillStyle = '#b5543f'; ellipse(g, cx, cy, rx, ry);
    g.fillStyle = '#f6c56b'; ellipse(g, cx, cy, rx - 10, ry - 7);
    g.fillStyle = '#4f9dcf'; ellipse(g, cx, cy, rx - 22, ry - 15);
    g.fillStyle = '#fdf0d5'; ellipse(g, cx, cy, rx - 34, ry - 22);
    g.strokeStyle = 'rgba(181,84,63,.5)'; g.setLineDash([6, 6]); g.lineWidth = 2;
    g.beginPath(); g.ellipse(cx, cy, rx - 46, ry - 30, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  }
  function paintBucket(g, x, y, col) {
    g.fillStyle = 'rgba(0,0,0,.2)'; ellipse(g, x + 2, y + 2, 17, 6);
    g.fillStyle = '#9aa1ab'; g.fillRect(x - 15, y - 26, 30, 26); ellipse(g, x, y, 15, 5);
    g.fillStyle = '#c9ced6'; ellipse(g, x, y - 26, 15, 5);
    g.fillStyle = col; ellipse(g, x, y - 26, 12, 3.8);
    g.fillRect(x - 13, y - 26, 6, 14); circle(g, x - 10, y - 12, 3);
    g.strokeStyle = '#6b7280'; g.lineWidth = 1.4; g.beginPath(); g.arc(x, y - 28, 15, Math.PI, 0); g.stroke();
  }
  function plant(g, x, y) {
    g.fillStyle = 'rgba(0,0,0,.2)'; ellipse(g, x + 3, y + 2, 18, 5);
    g.fillStyle = '#d9773f'; g.beginPath(); g.moveTo(x - 15, y - 26); g.lineTo(x + 15, y - 26); g.lineTo(x + 11, y); g.lineTo(x - 11, y); g.fill();
    g.fillStyle = '#b85f2c'; g.fillRect(x - 16, y - 30, 32, 6);
    const leaf = (a, l) => { g.save(); g.translate(x, y - 30); g.rotate(a); g.fillStyle = '#3f8f3a'; ellipse(g, 0, -l / 2, 6, l / 2); g.fillStyle = '#5fb653'; ellipse(g, -1.5, -l / 2, 3, l / 2 - 3); g.restore(); };
    [[-0.9, 34], [-0.4, 44], [0, 50], [0.45, 42], [0.9, 32]].forEach(([a, l]) => leaf(a, l));
  }
  function easel(g, b) {
    g.strokeStyle = '#6b3f1f'; g.lineWidth = 10; g.lineCap = 'round';
    g.beginPath(); g.moveTo(b.x + 60, b.y + b.h - 10); g.lineTo(b.x + 20, b.y + b.h + 80);
    g.moveTo(b.x + b.w - 60, b.y + b.h - 10); g.lineTo(b.x + b.w - 20, b.y + b.h + 80); g.stroke();
    g.strokeStyle = '#9a6a38'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(b.x + 60, b.y + b.h - 10); g.lineTo(b.x + 20, b.y + b.h + 80);
    g.moveTo(b.x + b.w - 60, b.y + b.h - 10); g.lineTo(b.x + b.w - 20, b.y + b.h + 80); g.stroke();
    // 畫框
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(b.x - 8, b.y - 4, b.w + 22, b.h + 18);
    g.fillStyle = '#8b5a2b'; g.fillRect(b.x - 12, b.y - 12, b.w + 24, b.h + 24);
    g.fillStyle = '#b07a43'; g.fillRect(b.x - 9, b.y - 9, b.w + 18, b.h + 18);
    g.fillStyle = '#fff'; g.fillRect(b.x, b.y, b.w, b.h);
    // 托盤與蠟筆
    g.fillStyle = '#5b3416'; g.fillRect(b.x - 24, b.y + b.h + 8, b.w + 48, 12);
    g.fillStyle = '#9a6a38'; g.fillRect(b.x - 24, b.y + b.h + 8, b.w + 48, 5);
    ['#ff5a5f', '#ffd23f', '#3b82f6', '#22c55e', '#a855f7', '#222'].forEach((c, i) => {
      g.fillStyle = c; g.fillRect(b.x + 20 + i * 22, b.y + b.h + 2, 16, 6);
      g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(b.x + 20 + i * 22, b.y + b.h + 2, 16, 1.5);
    });
  }
  function stool(g, s, i, dim) {
    g.globalAlpha = dim ? 0.55 : 1;
    g.fillStyle = 'rgba(0,0,0,.22)'; ellipse(g, s.x + 3, s.y + 3, 26, 8);
    g.fillStyle = '#7a4a26'; g.fillRect(s.x - 18, s.y - 4, 5, 10); g.fillRect(s.x + 13, s.y - 4, 5, 10);
    g.fillStyle = '#9a6a38'; ellipse(g, s.x, s.y - 4, 24, 8);
    g.fillStyle = CUSHIONS[i % CUSHIONS.length]; ellipse(g, s.x, s.y - 7, 20, 6);
    g.fillStyle = 'rgba(255,255,255,.4)'; ellipse(g, s.x - 6, s.y - 9, 7, 2);
    g.globalAlpha = 1;
  }

  // 靜態背景：kind = 'room' | 'lobby'
  function paint(g, kind) {
    const r = rng(kind === 'room' ? 77 : 99);
    wallAndFloor(g, r);
    if (kind === 'room') {
      rug(g, 480, 500, 270, 70);
      easel(g, BOARD);
      SEATS.forEach((s, i) => stool(g, s, i, true));
      paintBucket(g, 40, 590, '#3b82f6'); paintBucket(g, 74, 596, '#ff5a5f'); paintBucket(g, 924, 592, '#22c55e');
      plant(g, 300, 590); plant(g, 664, 590);
    } else {
      rug(g, 480, 470, 330, 100);
      // 兩側展示的畫架
      for (const [x, tilt] of [[120, -0.05], [840, 0.05]]) {
        g.save(); g.translate(x, 420); g.rotate(tilt);
        g.strokeStyle = '#6b3f1f'; g.lineWidth = 7; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-30, -60); g.lineTo(-48, 70); g.moveTo(30, -60); g.lineTo(48, 70); g.moveTo(0, -150); g.lineTo(0, 60); g.stroke();
        g.fillStyle = '#b07a43'; g.fillRect(-58, -150, 116, 92);
        g.fillStyle = '#fff'; g.fillRect(-52, -144, 104, 80);
        const sky = g.createLinearGradient(0, -144, 0, -64); sky.addColorStop(0, x < 480 ? '#8fd3ff' : '#ffd6e0'); sky.addColorStop(1, '#fff');
        g.fillStyle = sky; g.fillRect(-52, -144, 104, 80);
        g.fillStyle = x < 480 ? '#74c365' : '#c3a6ff'; g.beginPath(); g.moveTo(-52, -64); g.quadraticCurveTo(0, -110, 52, -64); g.fill();
        g.fillStyle = x < 480 ? '#ffd43b' : '#ff8fab'; circle(g, x < 480 ? 26 : -24, -122, 10);
        g.fillStyle = '#5b3416'; g.fillRect(-62, -60, 124, 8);
        g.restore();
      }
      paintBucket(g, 60, 590, '#ffd23f'); paintBucket(g, 96, 594, '#a855f7'); paintBucket(g, 900, 590, '#ff5a5f');
      plant(g, 300, 250); plant(g, 664, 250);
    }
    // 角落光暈
    const vig = g.createRadialGradient(480, 330, 260, 480, 330, 620);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(40,20,0,.28)');
    g.fillStyle = vig; g.fillRect(0, 0, VW, VH);
  }

  window.Studio = { VW, VH, BOARD, SEATS, CUSHIONS, paint, stool };
})();

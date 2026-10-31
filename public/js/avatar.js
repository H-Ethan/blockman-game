// 色塊人：立體幾何角色（頭、身體、手、腳、表情、帽子、眼鏡），支援站立、走路、轉向、坐下、淘汰灰階
(function (root) {
  'use strict';
  const BM = root.BM = root.BM || {};
  const { P, rbox, onFace, shade, poly } = BM.Iso;

  // 選項需和伺服器 server/core/filter.js 一致
  const OPT = {
    skins: ['#ffd9b8', '#f5c49c', '#e0a476', '#b9784f', '#8a5536', '#ffe7d1'],
    bodies: ['#ff6b6b', '#ff9f43', '#feca57', '#1dd1a1', '#48dbfb', '#54a0ff', '#5f27cd', '#ff9ff3', '#576574', '#ffffff', '#10ac84', '#c8d6e5'],
    accents: ['#3b5bdb', '#222f3e', '#ee5253', '#0abde3', '#f368e0', '#ff9f43', '#10ac84', '#8395a7', '#feca57', '#5f27cd', '#ffffff', '#6d4c41'],
    hairs: ['#3a2a1e', '#1e1e24', '#8d5524', '#d4a017', '#e67e22', '#c0392b', '#8e44ad', '#ecf0f1'],
    exprs: [['smile', '微笑'], ['happy', '開心'], ['cool', '酷酷'], ['surprise', '驚訝'], ['sleepy', '想睡'], ['angry', '生氣']],
    hats: [['none', '無'], ['cap', '鴨舌帽'], ['beanie', '毛帽'], ['top', '紳士帽'], ['detective', '偵探帽'], ['crown', '皇冠'], ['bow', '蝴蝶結']],
    glasses: [['none', '無'], ['round', '圓眼鏡'], ['sun', '墨鏡'], ['mono', '單片眼鏡']],
  };
  const DEFAULT = { name: '', body: '#ff6b6b', accent: '#3b5bdb', hair: '#3a2a1e', skin: '#ffd9b8', expr: 'smile', hat: 'none', glasses: 'none' };
  const HEAD_TOP = 38;   // 頭頂高度（不含帽子）

  function hatHeight(hat) { return { none: 2, cap: 5, beanie: 7, top: 15, detective: 6, crown: 8, bow: 5 }[hat] || 2; }

  // ---------- 表情（在臉的 [0,1]×[0,1] 平面上畫） ----------
  function face(g, expr, gray, t, blink) {
    const ink = gray ? '#555' : '#2b2118';
    g.fillStyle = ink; g.strokeStyle = ink; g.lineCap = 'round'; g.lineJoin = 'round';
    const eye = (x, y) => {
      if (blink) { g.lineWidth = 0.05; g.beginPath(); g.moveTo(x - 0.07, y); g.lineTo(x + 0.07, y); g.stroke(); return; }
      g.beginPath(); g.ellipse(x, y, 0.055, 0.075, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 0.018, y - 0.03, 0.018, 0, Math.PI * 2); g.fill(); g.fillStyle = ink;
    };
    const blush = () => { if (gray) return; g.fillStyle = 'rgba(255,120,140,.45)'; g.beginPath(); g.ellipse(0.2, 0.74, 0.08, 0.045, 0, 0, Math.PI * 2); g.ellipse(0.8, 0.74, 0.08, 0.045, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = ink; };
    g.lineWidth = 0.055;
    switch (expr) {
      case 'happy':
        g.beginPath(); g.arc(0.3, 0.6, 0.07, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
        g.beginPath(); g.arc(0.7, 0.6, 0.07, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
        g.fillStyle = gray ? '#666' : '#9b2c2c'; g.beginPath(); g.moveTo(0.36, 0.76); g.lineTo(0.64, 0.76); g.arc(0.5, 0.76, 0.14, 0, Math.PI); g.fill();
        blush(); break;
      case 'cool':
        g.lineWidth = 0.06;
        g.beginPath(); g.moveTo(0.2, 0.58); g.lineTo(0.38, 0.6); g.moveTo(0.62, 0.6); g.lineTo(0.8, 0.58); g.stroke();
        g.lineWidth = 0.045; g.beginPath(); g.moveTo(0.4, 0.82); g.quadraticCurveTo(0.55, 0.85, 0.66, 0.78); g.stroke(); break;
      case 'surprise':
        g.fillStyle = '#fff'; g.beginPath(); g.arc(0.3, 0.58, 0.1, 0, Math.PI * 2); g.arc(0.7, 0.58, 0.1, 0, Math.PI * 2); g.fill();
        g.lineWidth = 0.035; g.beginPath(); g.arc(0.3, 0.58, 0.1, 0, Math.PI * 2); g.moveTo(0.8, 0.58); g.arc(0.7, 0.58, 0.1, 0, Math.PI * 2); g.stroke();
        g.fillStyle = ink; g.beginPath(); g.arc(0.3, 0.6, 0.045, 0, Math.PI * 2); g.arc(0.7, 0.6, 0.045, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(0.5, 0.84, 0.06, 0.075, 0, 0, Math.PI * 2); g.fill(); break;
      case 'sleepy':
        g.beginPath(); g.arc(0.3, 0.56, 0.07, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
        g.beginPath(); g.arc(0.7, 0.56, 0.07, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
        g.beginPath(); g.ellipse(0.5, 0.82, 0.05, 0.035, 0, 0, Math.PI * 2); g.fill();
        blush(); break;
      case 'angry':
        g.lineWidth = 0.06; g.beginPath(); g.moveTo(0.18, 0.46); g.lineTo(0.4, 0.53); g.moveTo(0.82, 0.46); g.lineTo(0.6, 0.53); g.stroke();
        eye(0.3, 0.62); eye(0.7, 0.62);
        g.lineWidth = 0.05; g.beginPath(); g.arc(0.5, 0.9, 0.1, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); break;
      default:   // smile
        eye(0.3, 0.6); eye(0.7, 0.6);
        g.lineWidth = 0.05; g.beginPath(); g.arc(0.5, 0.74, 0.11, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
        blush();
    }
  }
  function glassesOn(g, kind, gray) {
    if (kind === 'none') return;
    g.lineWidth = 0.045; g.strokeStyle = gray ? '#444' : '#2b2118';
    if (kind === 'round') {
      g.beginPath(); g.arc(0.3, 0.6, 0.13, 0, Math.PI * 2); g.moveTo(0.83, 0.6); g.arc(0.7, 0.6, 0.13, 0, Math.PI * 2);
      g.moveTo(0.43, 0.6); g.lineTo(0.57, 0.6); g.stroke();
      g.fillStyle = 'rgba(200,235,255,.25)'; g.beginPath(); g.arc(0.3, 0.6, 0.12, 0, Math.PI * 2); g.arc(0.7, 0.6, 0.12, 0, Math.PI * 2); g.fill();
    } else if (kind === 'sun') {
      g.fillStyle = gray ? '#333' : '#11131a';
      BM.Iso.roundRect(g, 0.13, 0.5, 0.32, 0.2, 0.06); g.fill(); BM.Iso.roundRect(g, 0.55, 0.5, 0.32, 0.2, 0.06); g.fill();
      g.fillRect(0.44, 0.54, 0.12, 0.04);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0.18, 0.53, 0.1, 0.04); g.fillRect(0.6, 0.53, 0.1, 0.04);
    } else if (kind === 'mono') {
      g.strokeStyle = gray ? '#777' : '#c9a227'; g.lineWidth = 0.05;
      g.beginPath(); g.arc(0.7, 0.6, 0.14, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(220,240,255,.25)'; g.fill();
      g.lineWidth = 0.025; g.beginPath(); g.moveTo(0.82, 0.68); g.quadraticCurveTo(0.95, 0.85, 0.92, 1.0); g.stroke();
    }
  }

  // ---------- 主繪製 ----------
  // st: { yaw, walk（步伐相位）, amp（0～1 走路幅度）, t（毫秒）, pose: 'stand' | 'sit', gray, bob }
  function draw(g, look, st) {
    look = look || DEFAULT;
    const gray = !!st.gray, yaw = st.yaw || 0, amp = st.amp || 0, ph = st.walk || 0, t = st.t || 0;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const L = (u, v) => [u * cs - v * sn, u * sn + v * cs];
    const sit = st.pose === 'sit';
    const swing = Math.sin(ph) * amp;
    const breathe = sit || amp > 0.1 ? 0 : Math.sin(t * 0.0032) * 0.6;
    const lift = sit ? 0 : Math.abs(Math.sin(ph)) * 1.6 * amp + (st.bob || 0);
    const blink = (t % 3700) < 120 && look.expr !== 'happy' && look.expr !== 'sleepy';
    const body = look.body, accent = look.accent, skin = look.skin, hair = look.hair;

    // 影子
    if (!st.noShadow) {
      const [sx, sy] = P(0, 0, 0);
      g.fillStyle = 'rgba(30,20,40,.22)';
      g.beginPath(); g.ellipse(sx, sy, 15 - lift, 7.5 - lift * 0.4, 0, 0, Math.PI * 2); g.fill();
    }

    const parts = [];
    const add = (u, v, z, hu, hv, h, color, o, extra) => {
      const [x, y] = L(u, v);
      parts.push({ x, y, z, hu, hv, h, color, o: o || {}, depth: x + y, extra });
    };
    const zb = lift;   // 全身上下起伏

    // 腳
    if (sit) {
      for (const s of [-1, 1]) {
        add(4.5, s * 3.4, zb + 8, 5.5, 2.7, 3.6, accent, { noTop: false }, 'leg');
        add(9.2, s * 3.4, zb + 0, 2.6, 2.7, 9, accent, {}, 'leg');
        add(10.4, s * 3.4, zb + 0, 2.8, 2.9, 2.4, shade(accent, 0.6), {}, 'leg');
      }
    } else {
      for (const s of [-1, 1]) {
        const off = swing * 3.4 * s, up = Math.max(0, -Math.sin(ph) * s) * 2 * amp;
        add(off, s * 3.4, zb + up, 2.7, 2.7, 11 - Math.min(2, up), accent, { noTop: true }, 'leg');
        add(off + 0.6, s * 3.4, zb + up, 3.1, 2.9, 2.4, shade(accent, 0.55), { noTop: false }, 'leg');
      }
    }
    // 身體
    const torsoZ = zb + 11 + breathe * 0.3;
    add(0, 0, torsoZ, 4.6, 7.2, 13, body, {}, 'torso');
    // 手（袖子＋手掌）
    for (const s of [-1, 1]) {
      const off = sit ? 2.5 : -swing * 3 * s;
      add(off, s * 9.6, torsoZ + 4, 2.3, 2.3, 8.8, body, {}, 'arm');
      add(off + (sit ? 1 : 0), s * 9.6, torsoZ + 1, 2.2, 2.2, 3, skin, { noTop: true }, 'arm');
    }
    // 頭（含臉、頭髮、帽子、眼鏡）
    add(0, 0, torsoZ + 13.2, 7.2, 7.6, 13, skin, {}, 'head');

    // 繪製順序：腳 → 遠處的手 → 身體 → 近處的手 → 頭
    const order = p => (p.extra === 'leg' ? 0 : p.extra === 'head' ? 4 : p.extra === 'torso' ? 2 : 1);
    const torsoDepth = 0;
    parts.sort((a, b) => {
      const oa = a.extra === 'arm' && a.depth > torsoDepth ? 3 : order(a), ob = b.extra === 'arm' && b.depth > torsoDepth ? 3 : order(b);
      return oa - ob || a.depth - b.depth || a.z - b.z;
    });
    for (const p of parts) {
      const f = rbox(g, p.x, p.y, p.z, p.hu, p.hv, p.h, yaw, p.color, { ...p.o, gray });
      if (p.extra === 'torso' && f.vis > 0.05 && !gray) {
        // 胸前的配色條紋
        onFace(g, f, gg => { gg.fillStyle = shade(accent, 0.95); gg.fillRect(0.0, 0.62, 1, 0.12); });
      }
      if (p.extra === 'head') headDetails(g, p, f, look, yaw, gray, t, blink);
    }
  }

  function headDetails(g, p, f, look, yaw, gray, t, blink) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const zTop = p.z + p.h;
    const hairCol = look.hair;
    // 頭髮：頭頂一層＋後腦
    if (look.hat !== 'top' && look.hat !== 'crown' || true) {
      rbox(g, p.x, p.y, zTop - 0.5, 7.7, 8.1, 3, yaw, hairCol, { gray });
      const bx = p.x - cs * 6.4, by = p.y - sn * 6.4;
      const back = cs + sn < 0;   // 背對鏡頭時才看得到後腦頭髮
      if (back) rbox(g, bx, by, p.z + 3, 1.4, 7.8, p.h - 2.5, yaw, hairCol, { gray });
    }
    // 臉
    if (f.vis > 0.05) {
      onFace(g, f, gg => {
        gg.fillStyle = shade(hairCol, 1, gray); gg.fillRect(0, 0, 1, 0.2);          // 瀏海
        gg.fillRect(0, 0.18, 0.12, 0.1); gg.fillRect(0.88, 0.18, 0.12, 0.1);
        face(gg, look.expr, gray, t, blink);
        glassesOn(gg, look.glasses, gray);
      });
    }
    hat(g, p, look, yaw, gray, zTop + 2.4);
  }

  function hat(g, p, look, yaw, gray, z) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const at = (u, v) => [p.x + u * cs - v * sn, p.y + u * sn + v * cs];
    const acc = look.accent;
    switch (look.hat) {
      case 'cap': {
        rbox(g, p.x, p.y, z - 1, 7.9, 8.3, 4.2, yaw, acc, { gray });
        const [x, y] = at(10.5, 0); rbox(g, x, y, z - 1, 3.2, 6.6, 1.2, yaw, shade(acc, 0.8), { gray });
        const [bx, by] = at(0, 0); rbox(g, bx, by, z + 3.2, 1.3, 1.3, 1, yaw, '#ffffff', { gray });
        break;
      }
      case 'beanie':
        rbox(g, p.x, p.y, z - 2, 8.1, 8.5, 5.5, yaw, acc, { gray });
        rbox(g, p.x, p.y, z - 2.5, 8.3, 8.7, 2, yaw, '#ffffff', { gray });
        rbox(g, p.x, p.y, z + 3.5, 2.2, 2.2, 2.6, yaw, '#ffffff', { gray });
        break;
      case 'top':
        rbox(g, p.x, p.y, z - 1, 10, 10.4, 1.3, yaw, '#22222a', { gray });
        rbox(g, p.x, p.y, z + 0.3, 6.2, 6.6, 12, yaw, '#22222a', { gray });
        rbox(g, p.x, p.y, z + 0.3, 6.35, 6.75, 2.4, yaw, acc, { gray });
        break;
      case 'detective': {
        const brown = '#8b6b3f';
        rbox(g, p.x, p.y, z - 1.5, 8.2, 8.6, 5.2, yaw, brown, { gray });
        for (const s of [-1, 1]) { const [x, y] = at(s * 10.2, 0); rbox(g, x, y, z - 1.2, 2.4, 6.4, 1.2, yaw, shade(brown, 0.85), { gray }); }
        rbox(g, p.x, p.y, z + 3.7, 2, 2, 1.4, yaw, shade(brown, 0.7), { gray });
        for (const s of [-1, 1]) { const [x, y] = at(0, s * 8.7); rbox(g, x, y, z - 3.8, 2.5, 0.8, 3.5, yaw, shade(brown, 0.9), { gray }); }
        break;
      }
      case 'crown': {
        const gold = '#f6c343';
        rbox(g, p.x, p.y, z - 1, 6.8, 7.2, 4.2, yaw, gold, { gray });
        for (const [u, v] of [[5.6, 5.9], [5.6, -5.9], [-5.6, 5.9], [-5.6, -5.9], [5.6, 0]]) {
          const [x, y] = at(u, v); rbox(g, x, y, z + 3.2, 1.2, 1.2, 3.2, yaw, gold, { gray });
        }
        const [gx, gy] = at(7, 0); rbox(g, gx, gy, z + 0.2, 0.4, 1.4, 1.8, yaw, '#e74c3c', { gray, edge: null });
        break;
      }
      case 'bow': {
        const pink = '#ff6fa8';
        for (const s of [-1, 1]) { const [x, y] = at(0, s * 3.4); rbox(g, x, y, z - 0.5, 2.4, 2.8, 4, yaw, pink, { gray }); }
        rbox(g, p.x, p.y, z, 1.6, 1.4, 3, yaw, shade(pink, 0.8), { gray });
        break;
      }
    }
  }

  // ---------- 縮圖（列表、排行用） ----------
  const thumbCache = new Map();
  function thumb(look, size, gray) {
    const key = JSON.stringify(look) + '|' + size + '|' + (gray ? 1 : 0);
    let url = thumbCache.get(key);
    if (url) return url;
    const c = document.createElement('canvas');
    const s = size / 64, dpr = 2;
    c.width = c.height = size * dpr;
    const g = c.getContext('2d');
    g.scale(s * dpr, s * dpr); g.translate(32, 54);
    g.lineJoin = 'round';
    draw(g, look, { yaw: Math.PI / 4, t: 0, gray, noShadow: true });
    url = c.toDataURL();
    thumbCache.set(key, url);
    return url;
  }

  BM.Avatar = { OPT, DEFAULT, draw, thumb, HEAD_TOP, hatHeight };
})(this);

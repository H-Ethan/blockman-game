// 頭頂名牌與對話泡泡（預先畫成小圖，每格只貼圖，不重新排版文字）
(function (root) {
  'use strict';
  const BM = root.BM = root.BM || {};
  const { roundRect, FONT } = BM.Iso;

  const STYLES = {
    chat: { bg: '#ffffff', fg: '#222', border: '#2b2b3a', label: null },
    desc: { bg: '#fff7d6', fg: '#3b2a00', border: '#e0a100', label: '描述' },
    ghost: { bg: 'rgba(60,60,80,.88)', fg: '#e8e8f0', border: '#8a8aa0', label: '觀戰' },
    sys: { bg: '#e8f4ff', fg: '#0b4f86', border: '#4a90d9', label: null },
  };
  const MAX_W = 168, LINE = 15, MAX_LINES = 3;

  function wrap(g, text, maxW) {
    const lines = []; let cur = '';
    for (const ch of Array.from(text)) {
      if (ch === '\n') { lines.push(cur); cur = ''; continue; }
      if (g.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
    }
    if (cur) lines.push(cur);
    if (lines.length > MAX_LINES) { lines.length = MAX_LINES; lines[MAX_LINES - 1] = Array.from(lines[MAX_LINES - 1]).slice(0, -1).join('') + '…'; }
    return lines;
  }

  function bubbleCanvas(text, kind, dpr) {
    const st = STYLES[kind] || STYLES.chat;
    const c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = `600 12.5px ${FONT}`;
    const lines = wrap(g, text, MAX_W);
    const tw = Math.max(...lines.map(l => g.measureText(l).width), st.label ? 30 : 0);
    const padX = 9, padY = 6, labelH = st.label ? 13 : 0;
    const w = Math.ceil(tw + padX * 2), h = Math.ceil(lines.length * LINE + padY * 2 + labelH), tail = 7;
    c.width = Math.ceil((w + 4) * dpr); c.height = Math.ceil((h + tail + 4) * dpr);
    g.scale(dpr, dpr); g.translate(2, 2);
    g.fillStyle = 'rgba(0,0,0,.18)'; roundRect(g, 1.5, 2.5, w, h, 9); g.fill();
    g.fillStyle = st.bg; roundRect(g, 0, 0, w, h, 9); g.fill();
    g.beginPath(); g.moveTo(w / 2 - 6, h - 1); g.lineTo(w / 2, h + tail); g.lineTo(w / 2 + 6, h - 1); g.closePath(); g.fill();
    g.strokeStyle = st.border; g.lineWidth = 1.5; roundRect(g, 0, 0, w, h, 9); g.stroke();
    g.beginPath(); g.moveTo(w / 2 - 6, h); g.lineTo(w / 2, h + tail); g.lineTo(w / 2 + 6, h); g.stroke();
    g.fillStyle = st.bg; g.fillRect(w / 2 - 5, h - 2.5, 10, 3);
    if (st.label) {
      g.font = `800 9.5px ${FONT}`; g.fillStyle = st.border; g.textBaseline = 'top'; g.textAlign = 'left';
      g.fillText(st.label, padX, padY - 1);
    }
    g.font = `600 12.5px ${FONT}`; g.fillStyle = st.fg; g.textBaseline = 'top'; g.textAlign = 'center';
    lines.forEach((l, i) => g.fillText(l, w / 2, padY + labelH + i * LINE + 1));
    return { c, w: w + 4, h: h + tail + 4 };
  }

  // 名牌：name + 可選的副標（例如「房主」「離線」）
  const tagCache = new Map();
  function tag(name, o, dpr) {
    o = o || {};
    const key = [name, o.bg, o.fg, o.sub, o.subBg, dpr].join('|');
    let t = tagCache.get(key);
    if (t) return t;
    const c = document.createElement('canvas'), g = c.getContext('2d');
    g.font = `800 11.5px ${FONT}`;
    const nw = g.measureText(name).width;
    g.font = `800 9.5px ${FONT}`;
    const sw = o.sub ? g.measureText(o.sub).width + 10 : 0;
    const w = Math.ceil(nw + 14 + (sw ? sw + 4 : 0)), h = 18;
    c.width = Math.ceil((w + 4) * dpr); c.height = Math.ceil((h + 4) * dpr);
    g.scale(dpr, dpr); g.translate(2, 2);
    g.fillStyle = o.bg || 'rgba(25,22,40,.78)'; roundRect(g, 0, 0, w, h, 9); g.fill();
    let x = 7;
    if (o.sub) {
      g.fillStyle = o.subBg || '#ffcf5a'; roundRect(g, 3, 3, sw, h - 6, 6); g.fill();
      g.fillStyle = '#2b2050'; g.font = `800 9.5px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText(o.sub, 3 + sw / 2, h / 2 + 0.5);
      x = sw + 7;
    }
    g.font = `800 11.5px ${FONT}`; g.fillStyle = o.fg || '#fff'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(name, x, h / 2 + 0.5);
    t = { c, w: w + 4, h: h + 4 };
    if (tagCache.size > 400) tagCache.clear();
    tagCache.set(key, t);
    return t;
  }

  class Bubbles {
    constructor() { this.map = new Map(); }
    // 依內容長短決定顯示時間
    add(id, text, kind) {
      const n = Array.from(text).length;
      const dur = Math.min(9000, 2600 + n * 160);
      this.map.set(id, { text, kind, t0: performance.now(), dur, cv: null, dpr: 0 });
    }
    clear() { this.map.clear(); }
    // anchors：[{ id, x, y }]（裝置像素座標，名牌頂端位置）
    draw(g, anchors, dpr) {
      const now = performance.now(), items = [];
      for (const a of anchors) {
        const b = this.map.get(a.id);
        if (!b) continue;
        const age = now - b.t0;
        if (age > b.dur) { this.map.delete(a.id); continue; }
        if (!b.cv || b.dpr !== dpr) { b.cv = bubbleCanvas(b.text, b.kind, dpr); b.dpr = dpr; }
        const w = b.cv.w * dpr, h = b.cv.h * dpr;
        const alpha = Math.min(1, age / 150, (b.dur - age) / 400);
        const cw = g.canvas.width, bx = Math.max(4, Math.min(cw - w - 4, a.x - w / 2));
        items.push({ b, x: bx, y: a.y - h - 2 * dpr, w, h, alpha, pop: Math.min(1, age / 160) });
      }
      // 多人同時發言：由下往上排，重疊就往上推
      items.sort((p, q) => q.y - p.y);
      for (let i = 0; i < items.length; i++) {
        for (let j = 0; j < i; j++) {
          const a = items[i], b = items[j];
          if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) a.y = b.y - a.h - 2 * dpr;
        }
      }
      for (const it of items) {
        g.globalAlpha = it.alpha;
        const s = 0.85 + 0.15 * it.pop;
        g.drawImage(it.b.cv.c, it.x + it.w * (1 - s) / 2, it.y + it.h * (1 - s), it.w * s, it.h * s);
      }
      g.globalAlpha = 1;
    }
  }

  BM.Bubbles = Bubbles;
  BM.Tag = tag;
})(this);

// 城市場景：鏡頭跟隨、前後遮擋排序、移動預測與伺服器校正、其他玩家插值、入口提示、對話泡泡
(function (root) {
  'use strict';
  const BM = root.BM = root.BM || {};
  const { P } = BM.Iso;
  const C = BM.CITY, Move = BM.Move;

  // ---------- 前後排序（等角） ----------
  // a 在 b 後面：a 的範圍在 x 或 y 方向完全落在 b 之前
  function behind(a, b) { return a.x + a.w <= b.x + 0.01 || a.y + a.d <= b.y + 0.01; }
  function isoSort(items) {
    const n = items.length, after = items.map(() => []), indeg = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = items[i], b = items[j];
      if (a.bx1 < b.bx0 || b.bx1 < a.bx0 || a.by1 < b.by0 || b.by1 < a.by0) continue;   // 畫面上不重疊就不用比
      let ab = behind(a, b), ba = behind(b, a);
      if (ab && ba) { const ka = a.x + a.w / 2 + a.y + a.d / 2, kb = b.x + b.w / 2 + b.y + b.d / 2; ab = ka <= kb; ba = !ab; }
      if (!ab && !ba) { ab = (a.z || 0) < (b.z || 0) || ((a.z || 0) === (b.z || 0) && a.x + a.y < b.x + b.y); ba = !ab; }
      if (ab) { after[i].push(j); indeg[j]++; } else { after[j].push(i); indeg[i]++; }
    }
    const key = it => it.x + it.w / 2 + it.y + it.d / 2;
    const out = [], ready = [];
    for (let i = 0; i < n; i++) if (!indeg[i]) ready.push(i);
    while (out.length < n) {
      if (!ready.length) {   // 有循環（極少見）：挑剩下最前面的
        let best = -1; for (let i = 0; i < n; i++) if (indeg[i] >= 0 && !out.includes(items[i]) && (best < 0 || key(items[i]) < key(items[best]))) best = i;
        indeg[best] = 0; ready.push(best);
      }
      ready.sort((p, q) => key(items[q]) - key(items[p]));
      const i = ready.pop();
      if (indeg[i] < 0) continue;
      indeg[i] = -1; out.push(items[i]);
      for (const j of after[i]) if (indeg[j] > 0 && --indeg[j] === 0) ready.push(j);
    }
    return out;
  }

  class CityScene {
    constructor(canvas, opts) {
      this.cv = canvas; this.g = canvas.getContext('2d');
      this.opts = opts;                         // { quality(), send(list), onNear(portal|null) }
      this.ex = BM.Props.extents(C);
      this.bubbles = new BM.Bubbles();
      this.roster = new Map(); this.disp = new Map(); this.snaps = [];
      this.keys = { up: 0, down: 0, left: 0, right: 0 }; this.stick = [0, 0];
      this.active = false; this.ground = null; this.sprites = null; this.spriteScale = 0;
      this.camX = 0; this.camY = 0; this.camInit = false;
      this.fps = 60; this.lastFrame = 0;
    }

    // ---------- 資源（預先繪製） ----------
    buildAssets() {
      const q = this.opts.quality();
      const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
      const ss = Math.min(3.5, Math.max(0.75, this.zoom * dpr));   // 精靈圖解析度＝畫面實際倍率，貼圖時不必縮放
      const ex = this.ex, area = (ex.maxX - ex.minX) * (ex.maxY - ex.minY);
      const gs = Math.min(ss, q.groundMax, Math.sqrt(14e6 / area));
      if (!this.ground || Math.abs(gs - this.groundScale) > 0.01) {
        const c = document.createElement('canvas');
        c.width = Math.ceil((ex.maxX - ex.minX) * gs); c.height = Math.ceil((ex.maxY - ex.minY) * gs);
        const g = c.getContext('2d'); g.scale(gs, gs); g.translate(-ex.minX, -ex.minY);
        g.lineJoin = 'round'; g.lineCap = 'round';
        BM.Props.paintGround(g, C, q.level);
        this.ground = c; this.groundScale = gs;
      }
      if (!this.sprites || Math.abs(ss - this.spriteScale) > 0.01) {
        this.sprites = [];
        for (const o of C.objects) {
          if (o.type === 'steps') continue;
          const s = BM.Props.make(o, ss);
          if (!s) continue;
          this.sprites.push({ kind: 'obj', o, s, x: o.x, y: o.y, w: o.w, d: o.d, z: 0,
            bx0: s.sx, by0: s.sy, bx1: s.sx + s.sw, by1: s.sy + s.sh, big: o.type === 'undercover' });
        }
        this.spriteScale = ss;
      }
    }

    resize() {
      const r = this.cv.getBoundingClientRect();
      const q = this.opts.quality();
      const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
      this.cssW = Math.max(200, r.width); this.cssH = Math.max(200, r.height);
      this.cv.width = Math.round(this.cssW * dpr); this.cv.height = Math.round(this.cssH * dpr);
      this.dpr = dpr;
      this.zoom = Math.max(0.7, Math.min(2.4, Math.min(this.cssW / 900, this.cssH / 520)));
      this.buildAssets();
    }

    // ---------- 生命週期 ----------
    start(myId, spawn, epoch) {
      this.me = myId; this.epoch = epoch;
      this.local = { x: spawn.x, y: spawn.y, vx: 0, vy: 0 };
      this.prev = { x: spawn.x, y: spawn.y };
      this.pending = []; this.seq = 0; this.acc = 0; this.err = [0, 0];
      this.snaps = []; this.clockOff = null; this.renderOff = null; this.interp = 110; this.interpTarget = 110;
      this.lastArrive = 0; this.lastSnapT = 0; this.jit = 0; this.gap = 40;
      this.disp.clear(); this.bubbles.clear();
      this.camInit = false; this.active = true; this.lastFrame = 0;
      this.resize();
    }
    stop() { this.active = false; this.keys = { up: 0, down: 0, left: 0, right: 0 }; this.stick = [0, 0]; }

    setRoster(list) {
      this.roster = new Map(list.map(p => [p.id, p.profile]));
      for (const id of [...this.disp.keys()]) if (!this.roster.has(id)) this.disp.delete(id);
    }
    chat(id, text) { this.bubbles.add(id, text, 'chat'); }

    setState(st) {
      if (!this.active) return;
      const now = performance.now();
      const sample = st.t - now;
      if (this.lastArrive) {
        const gap = st.t - this.lastSnapT, arrive = now - this.lastArrive;
        if (gap > 0 && gap < 500) {
          this.gap += (gap - this.gap) * 0.1;
          this.jit += (Math.abs(arrive - gap) - this.jit) * 0.1;
          this.interpTarget = Math.max(70, Math.min(300, this.gap * 1.7 + this.jit * 2.5));
        }
      }
      this.lastArrive = now; this.lastSnapT = st.t;
      if (this.clockOff === null || sample > this.clockOff) this.clockOff = sample;
      else this.clockOff += (sample - this.clockOff) * 0.02;
      const map = new Map();
      for (const q of st.p) map.set(q[0], q);
      this.snaps.push({ t: st.t, map });
      while (this.snaps.length > 2 && this.snaps[1].t < now + this.clockOff - this.interp - 600) this.snaps.shift();

      // 伺服器校正：從伺服器確認的位置重播尚未確認的指令
      const mine = map.get(this.me);
      if (!mine) return;
      const [, x, y, vx, vy, ack] = mine;
      this.pending = this.pending.filter(c => c[0] > ack);
      const r = { x, y, vx, vy };
      for (const c of this.pending) Move.step(r, c[1] / 100, c[2] / 100, C.solids, C.W, C.H);
      const ex = this.local.x - r.x, ey = this.local.y - r.y;
      if (Math.hypot(ex, ey) > 80) { this.err = [0, 0]; this.prev = { x: r.x, y: r.y }; }
      else if (ex || ey) { this.err[0] += ex; this.err[1] += ey; this.prev.x -= ex; this.prev.y -= ey; }
      Object.assign(this.local, r);
    }

    // ---------- 輸入 ----------
    inputDir() {
      let u = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0), v = (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0);
      if (!u && !v) { u = this.stick[0]; v = this.stick[1]; }
      const [wx, wy] = Move.screenToWorld(u, v);
      return [Move.quant(wx), Move.quant(wy)];
    }

    // ---------- 每格 ----------
    frame(t) {
      if (!this.active || !this.ground) return;
      const rawDt = this.lastFrame ? (t - this.lastFrame) / 1000 : 0;
      this.lastFrame = t;
      const dt = Math.min(0.05, rawDt);
      this.frameDt = dt;
      if (rawDt > 0) this.fps += (1 / Math.max(rawDt, 0.001) - this.fps) * 0.05;

      // 1) 自己：固定步長預測
      this.acc = Math.min(this.acc + rawDt, 0.25);
      const out = [];
      while (this.acc >= Move.STEP) {
        this.acc -= Move.STEP;
        this.prev = { x: this.local.x, y: this.local.y };
        const [qx, qy] = this.inputDir();
        if (!qx && !qy && !this.local.vx && !this.local.vy) continue;
        this.seq++;
        Move.step(this.local, qx / 100, qy / 100, C.solids, C.W, C.H);
        const c = [this.seq, qx, qy];
        this.pending.push(c); out.push(c);
      }
      if (out.length) this.opts.send(out, this.epoch);
      const a = this.acc / Move.STEP;
      const fade = Math.exp(-dt * 12); this.err[0] *= fade; this.err[1] *= fade;
      const me = this.ensure(this.me);
      me.x = this.prev.x + (this.local.x - this.prev.x) * a + this.err[0];
      me.y = this.prev.y + (this.local.y - this.prev.y) * a + this.err[1];
      me.vx = this.local.vx; me.vy = this.local.vy;

      // 2) 其他人：在兩個快照之間依時間插值
      if (this.clockOff !== null && this.snaps.length) {
        this.interp += Math.max(-rawDt * 100, Math.min(rawDt * 100, this.interpTarget - this.interp));
        if (this.renderOff === null || Math.abs(this.clockOff - this.renderOff) > 250) this.renderOff = this.clockOff;
        else { const lim = rawDt * 100; this.renderOff += Math.max(-lim, Math.min(lim, this.clockOff - this.renderOff)); }
        const rt = performance.now() + this.renderOff - this.interp;
        let i = this.snaps.length - 1;
        while (i > 0 && this.snaps[i].t > rt) i--;
        const A = this.snaps[i], B = this.snaps[i + 1];
        for (const id of this.roster.keys()) {
          if (id === this.me) continue;
          const pa = A.map.get(id), pb = B && B.map.get(id);
          const q = pa || pb; if (!q) continue;
          const d = this.ensure(id, q);
          if (pa && pb) {
            const f = Math.max(0, Math.min(1, (rt - A.t) / (B.t - A.t)));
            if (Math.hypot(pb[1] - pa[1], pb[2] - pa[2]) > 80) { const s = f < 0.5 ? pa : pb; d.x = s[1]; d.y = s[2]; }
            else { d.x = pa[1] + (pb[1] - pa[1]) * f; d.y = pa[2] + (pb[2] - pa[2]) * f; }
            d.vx = pa[3] + (pb[3] - pa[3]) * f; d.vy = pa[4] + (pb[4] - pa[4]) * f;
          } else {
            const e = Math.min(0.12, Math.max(0, (rt - A.t) / 1000));
            d.x = q[1] + q[3] * e; d.y = q[2] + q[4] * e; d.vx = q[3]; d.vy = q[4];
          }
        }
      }
      for (const d of this.disp.values()) this.animate(d, dt);
      this.draw(t);
    }

    ensure(id, q) {
      let d = this.disp.get(id);
      if (!d) { d = { id, x: q ? q[1] : this.local.x, y: q ? q[2] : this.local.y, vx: 0, vy: 0, yaw: Math.PI / 4, walk: 0, amp: 0 }; this.disp.set(id, d); }
      return d;
    }
    animate(d, dt) {
      const sp = Math.hypot(d.vx, d.vy);
      if (sp > 12) {
        const target = Math.atan2(d.vy, d.vx);
        let diff = target - d.yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        d.yaw += diff * (1 - Math.exp(-dt * 14));             // 轉向：平滑轉過去
      }
      d.amp += (Math.min(1, sp / 120) - d.amp) * (1 - Math.exp(-dt * 10));
      d.walk += sp * dt * 0.085;
    }

    // ---------- 繪製 ----------
    draw(t) {
      const g = this.g, dpr = this.dpr, z = this.zoom, k = z * dpr;
      const me = this.disp.get(this.me);
      // 鏡頭：跟著自己，平滑移動，限制在地圖範圍
      const [mx, my] = me ? P(me.x, me.y, 18) : [0, 300];
      const vw = this.cssW / z, vh = this.cssH / z, ex = this.ex;
      const clampX = v => Math.max(-C.H - 120 + vw / 2, Math.min(C.W + 120 - vw / 2, v));
      const clampY = v => Math.max(-200 + vh / 2, Math.min((C.W + C.H) / 2 + 140 - vh / 2, v));
      const tx = vw > C.W + C.H + 240 ? (C.W - C.H) / 2 : clampX(mx), ty = vh > (C.W + C.H) / 2 + 340 ? (C.W + C.H) / 4 : clampY(my);
      if (!this.camInit) { this.camX = tx; this.camY = ty; this.camInit = true; }
      const cf = 1 - Math.exp(-(this.frameDt || 0.016) * 8);
      this.camX += (tx - this.camX) * cf; this.camY += (ty - this.camY) * cf;
      // 鏡頭對齊到裝置像素，地面區塊才能 1:1 貼上（不縮放，最省效能）
      const camDX = Math.round((this.camX - ex.minX) * k), camDY = Math.round((this.camY - ex.minY) * k);
      const camX = camDX / k + ex.minX, camY = camDY / k + ex.minY;
      const ox = vw / 2 - camX, oy = vh / 2 - camY;
      const vx0 = camX - vw / 2, vy0 = camY - vh / 2;

      // 地面：切成區塊，每塊預先縮放成畫面實際解析度並快取
      g.setTransform(1, 0, 0, 1, 0, 0);
      this.drawGround(g, k, Math.round(camDX - this.cv.width / 2), Math.round(camDY - this.cv.height / 2));
      g.setTransform(k, 0, 0, k, ox * k, oy * k);
      g.lineJoin = 'round'; g.lineCap = 'round';

      // 入口光圈
      for (const po of C.portals) this.drawPortal(g, po, t);

      // 物件＋角色排序後繪製（只處理畫面內的）
      const pad = 80, items = [];
      for (const s of this.sprites) if (s.bx1 > vx0 - pad && s.bx0 < vx0 + vw + pad && s.by1 > vy0 - pad && s.by0 < vy0 + vh + pad) items.push(s);
      const chars = [];
      for (const d of this.disp.values()) {
        const look = this.roster.get(d.id) || (d.id === this.me ? this.myProfile : null);
        if (!look) continue;
        const [sx, sy] = P(d.x, d.y, 0);
        const it = { kind: 'char', dd: d, look, x: d.x - 7, y: d.y - 7, w: 14, d: 14, z: 1, bx0: sx - 18, bx1: sx + 18, by0: sy - 62, by1: sy + 8 };
        items.push(it); chars.push(it);
      }
      const sorted = isoSort(items);
      let meHidden = false;
      for (const it of sorted) {
        if (it.kind === 'obj') {
          // 精靈圖解析度與畫面相同：在裝置像素座標、整數位置直接貼上（最快的路徑）
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.drawImage(it.s.img, Math.round((it.s.sx + ox) * k), Math.round((it.s.sy + oy) * k));
          g.setTransform(k, 0, 0, k, ox * k, oy * k);
        } else this.drawChar(g, it.dd, it.look, t, 1);
      }
      // 自己被建築擋住時，仍看得到淡淡的身影
      if (me) {
        const myIt = chars.find(c => c.dd.id === this.me);
        if (myIt) {
          const idx = sorted.indexOf(myIt);
          meHidden = sorted.slice(idx + 1).some(it => it.kind === 'obj' && it.bx0 < myIt.bx1 && it.bx1 > myIt.bx0 && it.by0 < myIt.by1 && it.by1 > myIt.by0 && (it.big || it.o.type === 'tree'));
          if (meHidden) { g.globalAlpha = 0.35; this.drawChar(g, me, myIt.look, t, 1, true); g.globalAlpha = 1; }
        }
      }

      // 名牌與泡泡（裝置像素，字比較清楚）
      g.setTransform(1, 0, 0, 1, 0, 0);
      const anchors = [];
      for (const c of chars) {
        const d = c.dd, look = c.look;
        const [sx, sy] = P(d.x, d.y, BM.Avatar.HEAD_TOP + BM.Avatar.hatHeight(look.hat) + 6);
        const px = (sx + ox) * k, py = (sy + oy) * k;
        const mine = d.id === this.me;
        const tg = BM.Tag(look.name, mine ? { bg: '#ff5a5f' } : {}, dpr);
        g.drawImage(tg.c, px - tg.w * dpr / 2, py - tg.h * dpr);
        anchors.push({ id: d.id, x: px, y: py - tg.h * dpr });
      }
      this.bubbles.draw(g, anchors, dpr);

      // 入口提示
      let near = null;
      if (me) for (const po of C.portals) {
        const cx = po.x + po.w / 2, cy = po.y + po.d / 2;
        if (Math.hypot(me.x - cx, me.y - cy) < 110) near = po;
      }
      if (near !== this.near) { this.near = near; this.opts.onNear && this.opts.onNear(near); }
    }

    drawGround(g, k, dx0, dy0) {
      const CH = 512;
      if (!this.chunks || this.chunkK !== k || this.chunkGround !== this.ground) { this.chunks = new Map(); this.chunkK = k; this.chunkGround = this.ground; }
      const gs = this.groundScale, f = gs / k;
      const cx0 = Math.floor(dx0 / CH), cy0 = Math.floor(dy0 / CH), cx1 = Math.floor((dx0 + this.cv.width) / CH), cy1 = Math.floor((dy0 + this.cv.height) / CH);
      let made = 0;
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const key = cx + ',' + cy;
        let c = this.chunks.get(key);
        if (!c) {
          if (made >= 3 && this.chunks.size) { g.drawImage(this.ground, cx * CH * f, cy * CH * f, CH * f, CH * f, cx * CH - dx0, cy * CH - dy0, CH, CH); continue; }   // 一格最多新建 3 塊，避免頓一下
          c = document.createElement('canvas'); c.width = CH; c.height = CH;
          const cg = c.getContext('2d'); cg.imageSmoothingQuality = 'high';
          cg.drawImage(this.ground, cx * CH * f, cy * CH * f, CH * f, CH * f, 0, 0, CH, CH);
          made++;
          this.chunks.set(key, c);
          if (this.chunks.size > 48) this.chunks.delete(this.chunks.keys().next().value);
        } else { this.chunks.delete(key); this.chunks.set(key, c); }   // 最近使用
        g.drawImage(c, cx * CH - dx0, cy * CH - dy0);
      }
    }

    drawChar(g, d, look, t, alpha, ghost) {
      const [sx, sy] = P(d.x, d.y, 0);
      g.save(); g.translate(sx, sy);
      BM.Avatar.draw(g, look, { yaw: d.yaw, walk: d.walk, amp: d.amp, t: t + (d.id.charCodeAt(0) * 97), noShadow: ghost });
      g.restore();
    }

    drawPortal(g, po, t) {
      const cx = po.x + po.w / 2, cy = po.y + po.d / 2;
      const pulse = 0.8 + Math.sin(t * 0.004) * 0.2;
      const [sx, sy] = P(cx, cy, 0);
      const rx = (po.w / 2 + 14) * 1.1, ry = rx / 2;
      g.save();
      const gr = g.createRadialGradient(sx, sy, 0, sx, sy, rx);
      gr.addColorStop(0, `rgba(255,255,255,${0.85 * pulse})`); gr.addColorStop(0.4, `rgba(255,207,90,${0.75 * pulse})`); gr.addColorStop(1, 'rgba(255,207,90,0)');
      g.translate(sx, sy); g.scale(1, ry / rx); g.translate(-sx, -sy);
      g.fillStyle = gr; g.beginPath(); g.arc(sx, sy, rx, 0, Math.PI * 2); g.fill();
      g.strokeStyle = `rgba(255,255,255,${0.7 * pulse})`; g.lineWidth = 2.5;
      g.beginPath(); g.arc(sx, sy, rx * (0.45 + ((t * 0.0005) % 0.5)), 0, Math.PI * 2); g.stroke();
      g.restore();
      if (this.opts.quality().level >= 1) {
        for (let i = 0; i < 9; i++) {
          const ph = (t * 0.0005 + i / 9) % 1, ox = Math.sin(i * 2.3 + t * 0.001) * po.w * 0.45;
          g.fillStyle = i % 2 ? `rgba(255,255,255,${(1 - ph) * 0.9})` : `rgba(255,207,90,${(1 - ph) * 0.95})`;
          g.fillRect(sx + ox - 1.5, sy - ph * 50 - 1.5, 3, 3);
        }
      }
    }
  }

  BM.CityScene = CityScene;
  BM.isoSort = isoSort;
})(this);

// 你畫我猜：大廳、房間介面、畫板、猜題
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const S = window.Studio;
  const BW = 800, BH = 600, BRES = 1.5;           // 畫板邏輯尺寸與解析度倍率
  const COLORS = ['#222222', '#ffffff', '#9ca3af', '#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6',
                  '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#92400e', '#fcd5b5'];
  const SIZES = [3, 6, 12, 24];

  let socket = null, sprites = () => ({}), myId = () => null;
  let room = null, deadline = 0, strokes = [];
  let tool = { c: '#222222', s: 6, e: false };
  let penDown = false, queue = [], flushTimer = 0, lastPt = null;
  let roomLoop = 0, lobbyShown = false;
  const imgCache = {};
  const pops = [];  // 座位上的 +分數 動畫

  // ---------- 小工具 ----------
  function spriteImg(id) {
    const sp = sprites()[id]; if (!sp) return null;
    let im = imgCache[id];
    if (!im || im._src !== sp.sprite) { im = new Image(); im._src = sp.sprite; im.src = sp.sprite; imgCache[id] = im; }
    return im.complete && im.naturalWidth ? im : null;
  }
  function fitCanvas(cv) {
    const w = cv.getBoundingClientRect().width || S.VW, dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(w * dpr), ph = Math.round(pw * S.VH / S.VW);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; return true; }
    return false;
  }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function toast(text) {
    const t = $('dgToast'); t.textContent = text; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function drawSprite(g, id, x, y, scale, bob) {
    const im = spriteImg(id); if (!im) return;
    g.imageSmoothingEnabled = false;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x, y + 1, 14 * scale / 1.75, 5, 0, 0, Math.PI * 2); g.fill();
    g.drawImage(im, x - 12 * scale, y - 48 * scale - bob, 24 * scale, 48 * scale);
    g.imageSmoothingEnabled = true;
  }
  function tag(g, text, x, y, bg, fg = '#fff', size = 12) {
    g.font = `800 ${size}px ${window.Props.FONT}`;
    const w = g.measureText(text).width + 14;
    g.fillStyle = bg; window.Props.rr(g, x - w / 2, y - 10, w, 20, 10); g.fill();
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y + 0.5);
  }

  // =========================================================
  // 大廳
  // =========================================================
  let lobbyBg = null;
  function paintLobby() {
    const cv = $('lobbyBg'); fitCanvas(cv);
    const g = cv.getContext('2d'); const k = cv.width / S.VW;
    if (!lobbyBg || lobbyBg.width !== cv.width) {
      lobbyBg = document.createElement('canvas'); lobbyBg.width = cv.width; lobbyBg.height = cv.height;
      const lg = lobbyBg.getContext('2d'); lg.scale(k, k); S.paint(lg, 'lobby');
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(lobbyBg, 0, 0);
    g.setTransform(k, 0, 0, k, 0, 0);
    drawSprite(g, myId(), 190, 590, 2, 0);
    tag(g, '你', 190, 590 - 112, '#ff5a5f');
  }
  function showLobby(info) {
    room = null; stopRoomLoop(); lobbyShown = true;
    $('dgRoom').classList.add('hidden'); $('dgLobby').classList.remove('hidden');
    $('dgNone').classList.add('hidden'); $('dgPrivatePanel').classList.add('hidden');
    $('dgOpenCount').textContent = info && info.open ? `目前有 ${info.open} 間公開房間在等人` : '目前還沒有公開房間';
    requestAnimationFrame(paintLobby);
  }

  // =========================================================
  // 房間
  // =========================================================
  let roomBg = null, roomBgW = 0;
  function startRoomLoop() {
    if (roomLoop) return;
    const loop = t => { roomLoop = requestAnimationFrame(loop); drawRoom(t); };
    roomLoop = requestAnimationFrame(loop);
  }
  function stopRoomLoop() { cancelAnimationFrame(roomLoop); roomLoop = 0; }

  function drawRoom(t) {
    if (!room) return;
    const cv = $('roomBg'); fitCanvas(cv);
    const g = cv.getContext('2d'), k = cv.width / S.VW;
    if (!roomBg || roomBgW !== cv.width) {
      roomBg = document.createElement('canvas'); roomBg.width = cv.width; roomBg.height = cv.height; roomBgW = cv.width;
      const bg = roomBg.getContext('2d'); bg.scale(k, k); S.paint(bg, 'room');
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(roomBg, 0, 0);
    g.setTransform(k, 0, 0, k, 0, 0);

    const order = room.members.slice().sort((a, b) => S.SEATS[a.seat].y - S.SEATS[b.seat].y);
    for (const m of order) {
      const s = S.SEATS[m.seat]; if (!s) continue;
      S.stool(g, s, m.seat, false);
      const isDrawer = m.id === room.drawerId && (room.state === 'intro' || room.state === 'drawing');
      const bob = Math.abs(Math.sin(t * 0.004 + m.seat)) * (isDrawer ? 3 : 1.4) + (m.guessed && room.state === 'drawing' ? Math.abs(Math.sin(t * 0.012)) * 4 : 0);
      if (m.guessed && room.state !== 'waiting') { g.fillStyle = 'rgba(34,197,94,.28)'; g.beginPath(); g.ellipse(s.x, s.y - 6, 30, 10, 0, 0, Math.PI * 2); g.fill(); }
      drawSprite(g, m.id, s.x, s.y - 8, 1.75, bob);
      // 名牌
      const me = m.id === myId();
      tag(g, `${m.name}${me ? '（你）' : ''}`, s.x, s.y + 16, me ? '#ff5a5f' : 'rgba(30,22,14,.82)', '#fff', 11);
      tag(g, `${m.score} 分`, s.x, s.y + 38, '#fff7e0', '#7a4a00', 11);
      // 狀態
      let st = null, col = '#334155';
      if (room.state === 'waiting') {
        if (m.id === room.hostId) { st = '👑 房主'; col = '#b45309'; }
        else if (m.ready) { st = '✓ 準備好了'; col = '#15803d'; }
        else { st = '… 還沒準備'; col = '#64748b'; }
      } else if (isDrawer) { st = '✏️ 畫畫中'; col = '#7c3aed'; }
      else if (m.guessed) { st = '✅ 答對了'; col = '#15803d'; }
      if (st) tag(g, st, s.x, s.y - 112 - bob, col, '#fff', 11);
    }
    // +分數 飄字
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i], m = room.members.find(mm => mm.id === p.id), s = m && S.SEATS[m.seat];
      const a = (t - p.t0) / 1800;
      if (!s || a > 1) { pops.splice(i, 1); continue; }
      g.globalAlpha = 1 - a * a;
      window.Props.outlineText(g, `+${p.v}`, s.x, s.y - 130 - a * 30, 20, '#ffe066', '#7f4a00');
      g.globalAlpha = 1;
    }
    // 倒數
    if (room.state === 'drawing' || room.state === 'intro' || room.state === 'reveal') {
      const remain = Math.max(0, deadline - performance.now()), sec = Math.ceil(remain / 1000);
      const tm = $('dgTimer');
      if (tm._v !== sec) { tm._v = sec; tm.querySelector('b').textContent = sec; }
      const frac = room.total ? remain / room.total : 0;
      tm.style.setProperty('--p', (frac * 360).toFixed(1) + 'deg');
      tm.classList.toggle('urgent', room.state === 'drawing' && sec <= 10);
    }
  }

  function amDrawer() { return room && room.drawerId === myId(); }
  function me() { return room && room.members.find(m => m.id === myId()); }

  function onRoom(r) {
    const prev = room;
    room = r;
    deadline = performance.now() + r.remain;
    if (!prev || $('dgRoom').classList.contains('hidden')) {
      lobbyShown = false;
      $('dgLobby').classList.add('hidden'); $('dgRoom').classList.remove('hidden');
      $('dgChatLog').innerHTML = '';
      roomBg = null; redrawBoard(); startRoomLoop();
    }
    // 新得分 → 座位飄字
    if (prev) for (const m of r.members) {
      const pm = prev.members.find(x => x.id === m.id);
      if (pm && m.score > pm.score) pops.push({ id: m.id, v: m.score - pm.score, t0: performance.now() });
    }
    renderTop(); renderOverlay(); renderTools(); renderInput();
  }

  // ---------- 上方資訊列 ----------
  function renderTop() {
    const r = room;
    $('dgRoomBadge').innerHTML = '';
    if (r.isPrivate) {
      const b = el('span', 'badge private', '🔒 私人房間 · 代碼 ');
      const code = el('b', 'code', r.code); b.appendChild(code);
      const copy = el('button', 'mini', '複製');
      copy.onclick = () => { try { navigator.clipboard.writeText(r.code); toast('已複製房間代碼 ' + r.code); } catch (e) { toast('房間代碼：' + r.code); } };
      $('dgRoomBadge').append(b, copy);
    } else $('dgRoomBadge').append(el('span', 'badge', `🏠 公開房間 · ${r.members.length}/${r.settings.max} 人`));

    const playing = ['intro', 'drawing', 'reveal'].includes(r.state);
    $('dgRound').textContent = playing ? `第 ${Math.min(r.round, r.rounds)} / ${r.rounds} 輪 · 第 ${Math.max(1, r.turn)} / ${r.turns} 位` : (r.state === 'ended' ? '遊戲結束' : '等待中');
    $('dgTimer').classList.toggle('hidden', !playing);

    const w = $('dgWord'); w.innerHTML = '';
    if (r.state === 'drawing' || r.state === 'intro') {
      if (amDrawer()) w.append(el('span', 'lbl', '你的題目'), el('b', 'answer', r.word));
      else if (r.word) w.append(el('span', 'lbl', '你答對了！答案'), el('b', 'answer ok', r.word));
      else {
        w.append(el('span', 'lbl', `猜猜看（${r.len} 個字）`), el('b', 'hint', r.hint));
        if (r.category) w.append(el('span', 'cat', '類別：' + r.category));
      }
    } else if (r.state === 'reveal') w.append(el('span', 'lbl', '答案'), el('b', 'answer', r.word));
    else w.append(el('span', 'lbl', r.state === 'ended' ? '看看誰是冠軍！' : '準備好就開始吧'));
  }

  // ---------- 畫板上的面板（等待／輪到誰／公布答案／排行榜） ----------
  function renderOverlay() {
    const ov = $('dgOverlay'), r = room;
    ov.innerHTML = ''; ov.className = 'board-ov';
    if (r.state === 'drawing') { ov.classList.add('hidden'); return; }
    const card = el('div', 'ov-card');
    ov.appendChild(card);

    if (r.state === 'waiting') {
      card.append(el('h3', null, '🎨 畫室準備中'));
      const host = r.hostId === myId();
      const grid = el('div', 'settings');
      const field = (label, key, values, fmt) => {
        const box = el('label', 'set'); box.append(el('span', null, label));
        if (host) {
          const sel = el('select');
          values.forEach(v => { const o = el('option', null, fmt(v)); o.value = v; if (v === r.settings[key]) o.selected = true; sel.appendChild(o); });
          sel.onchange = () => socket.emit('dg:settings', { ...r.settings, [key]: +sel.value });
          box.appendChild(sel);
        } else box.appendChild(el('b', null, fmt(r.settings[key])));
        grid.appendChild(box);
      };
      const maxVals = []; for (let i = Math.max(2, r.members.length); i <= r.opts.maxSeats; i++) maxVals.push(i);
      field('人數上限', 'max', maxVals, v => v + ' 人');
      field('作畫時間', 'time', r.opts.time, v => v + ' 秒');
      field('遊戲輪數', 'rounds', r.opts.rounds, v => v + ' 輪');
      card.appendChild(grid);
      const others = r.members.filter(m => m.id !== r.hostId);
      const readyN = others.filter(m => m.ready).length;
      card.appendChild(el('p', 'sub', `${r.members.length} 位玩家 · ${readyN}/${others.length} 人已準備`));
      if (r.isPrivate) card.appendChild(el('p', 'invite', `把代碼「${r.code}」傳給朋友，在大廳選「私人房間」輸入就能加入`));
      if (host) {
        const can = r.members.length >= 2 && others.every(m => m.ready);
        const btn = el('button', 'big primary', '▶ 開始遊戲'); btn.disabled = !can;
        btn.onclick = () => socket.emit('dg:start');
        card.appendChild(btn);
        card.appendChild(el('p', 'why', r.members.length < 2 ? '至少需要 2 位玩家' : can ? '大家都準備好了！' : '等待所有人按下「準備」'));
      } else {
        const mine = me();
        const btn = el('button', 'big ' + (mine && mine.ready ? '' : 'primary'), mine && mine.ready ? '取消準備' : '✓ 準備');
        btn.onclick = () => socket.emit('dg:ready', !(mine && mine.ready));
        card.appendChild(btn);
        card.appendChild(el('p', 'why', '準備好後，等房主開始遊戲'));
      }
    } else if (r.state === 'intro') {
      const drawer = r.members.find(m => m.id === r.drawerId);
      card.classList.add('intro');
      card.append(el('div', 'round-no', `第 ${r.round} 輪`));
      if (amDrawer()) {
        card.append(el('h3', null, '輪到你畫圖！'), el('p', 'sub', '你的題目是'), el('div', 'secret', r.word),
          el('p', 'why', '只有你看得到題目，準備好畫筆～'));
      } else {
        card.append(el('h3', null, `輪到 ${drawer ? drawer.name : '?'} 畫圖`), el('p', 'sub', `題目有 ${r.len} 個字，準備搶答！`));
      }
    } else if (r.state === 'reveal') {
      ov.classList.add('soft');
      card.append(el('p', 'sub', '答案是'), el('div', 'secret', r.word));
      const list = el('ol', 'gains');
      r.members.slice().sort((a, b) => b.gain - a.gain).forEach(m => {
        const li = el('li'); li.append(el('span', null, m.name + (m.id === r.drawerId ? '（畫圖）' : '')), el('b', m.gain ? 'plus' : 'zero', m.gain ? `+${m.gain}` : '+0'));
        list.appendChild(li);
      });
      card.appendChild(list);
    } else if (r.state === 'ended') {
      card.classList.add('ended');
      card.append(el('h3', null, '🏆 最終排行榜'));
      const podium = el('div', 'podium');
      [1, 0, 2].forEach(i => {
        const p = r.ranking[i]; if (!p) return;
        const col = el('div', 'pod p' + (i + 1));
        const sp = sprites()[p.id]; if (sp) { const im = el('img'); im.src = sp.sprite; col.appendChild(im); }
        col.append(el('b', null, p.name), el('span', null, p.score + ' 分'), el('div', 'step', ['🥇', '🥈', '🥉'][i]));
        podium.appendChild(col);
      });
      card.appendChild(podium);
      if (r.ranking.length > 3) {
        const rest = el('ol', 'gains'); rest.start = 4;
        r.ranking.slice(3).forEach(p => { const li = el('li'); li.append(el('span', null, p.name), el('b', 'zero', p.score + ' 分')); rest.appendChild(li); });
        card.appendChild(rest);
      }
      const btns = el('div', 'row-btns');
      const again = el('button', 'big primary', '🔁 再玩一次'); again.onclick = () => socket.emit('dg:again');
      const back = el('button', 'big', '🚪 返回大廳'); back.onclick = () => socket.emit('dg:leave');
      btns.append(again, back); card.appendChild(btns);
    }
  }

  // ---------- 畫圖工具列 ----------
  function buildTools() {
    const pal = $('dgColors');
    COLORS.forEach(c => {
      const b = el('button', 'color'); b.style.background = c; b.title = c; b.dataset.c = c;
      b.onclick = () => { tool.c = c; tool.e = false; syncTools(); };
      pal.appendChild(b);
    });
    const sz = $('dgSizes');
    SIZES.forEach(s => {
      const b = el('button', 'size'); b.dataset.s = s; const dot = el('i'); dot.style.width = dot.style.height = Math.max(4, s * 0.9) + 'px'; b.appendChild(dot);
      b.onclick = () => { tool.s = s; syncTools(); };
      sz.appendChild(b);
    });
    $('dgPen').onclick = () => { tool.e = false; syncTools(); };
    $('dgEraser').onclick = () => { tool.e = true; syncTools(); };
    $('dgUndo').onclick = undo;
    $('dgClear').onclick = () => { if (!canDraw()) return; strokes = []; redrawBoard(); socket.emit('dg:op', { t: 'c' }); };
    addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !$('dgRoom').classList.contains('hidden') && document.activeElement !== $('dgInput')) { e.preventDefault(); undo(); }
    });
    syncTools();
  }
  function undo() { if (!canDraw() || !strokes.length) return; strokes.pop(); redrawBoard(); socket.emit('dg:op', { t: 'u' }); }
  function syncTools() {
    document.querySelectorAll('#dgColors .color').forEach(b => b.classList.toggle('sel', !tool.e && b.dataset.c === tool.c));
    document.querySelectorAll('#dgSizes .size').forEach(b => b.classList.toggle('sel', +b.dataset.s === tool.s));
    $('dgPen').classList.toggle('on', !tool.e); $('dgEraser').classList.toggle('on', tool.e);
    $('dgBoard').style.cursor = tool.e ? 'cell' : 'crosshair';
  }
  function renderTools() {
    const show = amDrawer() && (room.state === 'drawing' || room.state === 'intro');
    $('dgTools').classList.toggle('hidden', !show);
    $('dgTools').classList.toggle('locked', room.state !== 'drawing');
    $('dgSpectate').classList.toggle('hidden', show || room.state !== 'drawing');
  }
  const canDraw = () => room && room.state === 'drawing' && amDrawer();

  // ---------- 畫板繪製 ----------
  function boardCtx() { const g = $('dgBoard').getContext('2d'); g.setTransform(BRES, 0, 0, BRES, 0, 0); g.lineCap = 'round'; g.lineJoin = 'round'; return g; }
  function redrawBoard() {
    const g = boardCtx(); g.fillStyle = '#fff'; g.fillRect(0, 0, BW, BH);
    for (const st of strokes) drawStroke(g, st, 0);
  }
  function drawStroke(g, st, from) {
    const p = st.p; if (!p.length) return;
    g.strokeStyle = g.fillStyle = st.e ? '#ffffff' : st.c; g.lineWidth = st.s;
    if (p.length === 2) { g.beginPath(); g.arc(p[0], p[1], st.s / 2, 0, Math.PI * 2); g.fill(); return; }
    const start = Math.max(0, from - 2);
    g.beginPath(); g.moveTo(p[start], p[start + 1]);
    for (let i = start + 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
    g.stroke();
  }
  function applyOp(o) {
    if (o.t === 'b') strokes.push({ c: o.c, s: o.s, e: o.e, p: [] });
    else if (o.t === 'p') {
      const st = strokes[strokes.length - 1]; if (!st) return;
      const from = st.p.length; st.p.push(...o.p);
      const g = boardCtx();
      if (from === 0 && st.p.length === 2) drawStroke(g, st, 0); else drawStroke(g, st, from);
    } else if (o.t === 'u') { strokes.pop(); redrawBoard(); }
    else if (o.t === 'c') { strokes = []; redrawBoard(); }
  }

  // ---------- 畫圖輸入 ----------
  function boardPos(e) {
    const r = $('dgBoard').getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(BW, (e.clientX - r.left) / r.width * BW))), Math.round(Math.max(0, Math.min(BH, (e.clientY - r.top) / r.height * BH)))];
  }
  function flush() {
    clearTimeout(flushTimer); flushTimer = 0;
    while (queue.length) socket.emit('dg:op', { t: 'p', p: queue.splice(0, 400) });
  }
  function addPoint(x, y) {
    const st = strokes[strokes.length - 1]; if (!st) return;
    if (lastPt && Math.hypot(x - lastPt[0], y - lastPt[1]) < 1.5) return;
    const from = st.p.length; st.p.push(x, y); lastPt = [x, y];
    drawStroke(boardCtx(), st, from);
    queue.push(x, y);
    if (!flushTimer) flushTimer = setTimeout(flush, 40);
  }
  function bindBoard() {
    const b = $('dgBoard');
    b.addEventListener('pointerdown', e => {
      if (!canDraw()) return;
      e.preventDefault(); b.setPointerCapture(e.pointerId); penDown = true; lastPt = null;
      const st = { c: tool.c, s: tool.s, e: tool.e, p: [] };
      strokes.push(st); socket.emit('dg:op', { t: 'b', c: st.c, s: st.s, e: st.e });
      const [x, y] = boardPos(e); addPoint(x, y);
    });
    b.addEventListener('pointermove', e => {
      if (!penDown || !canDraw()) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) { const [x, y] = boardPos(ev); addPoint(x, y); }
    });
    const up = () => { if (penDown) { penDown = false; flush(); } };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }

  // ---------- 猜題 / 聊天 ----------
  function renderInput() {
    const inp = $('dgInput'), r = room, m = me();
    const active = r.state === 'drawing' || r.state === 'intro';
    if (active && amDrawer()) { inp.disabled = true; inp.placeholder = '你正在畫圖，不能說出答案喔'; }
    else if (r.state === 'drawing' && m && m.guessed) { inp.disabled = false; inp.placeholder = '你答對了！只有答對的人看得到你說的話'; }
    else if (r.state === 'drawing') { inp.disabled = false; inp.placeholder = '輸入答案，按 Enter 搶答！'; }
    else { inp.disabled = false; inp.placeholder = '聊天…（按 Enter 送出）'; }
    $('dgSend').disabled = inp.disabled;
    if (r.state === 'drawing' && !amDrawer() && !(m && m.guessed) && document.activeElement !== inp && !matchMedia('(pointer:coarse)').matches) inp.focus();
  }
  function addChat(c) {
    const log = $('dgChatLog'), row = el('div', 'msg ' + c.kind);
    if (c.kind === 'guess' || c.kind === 'private') { row.append(el('b', null, c.name + (c.kind === 'private' ? '（已答對）' : '') + '：'), document.createTextNode(c.text)); }
    else row.textContent = c.text;
    log.appendChild(row);
    while (log.children.length > 120) log.firstChild.remove();
    log.scrollTop = 1e9;
  }
  function send() {
    const inp = $('dgInput'), t = inp.value.trim();
    if (!t || inp.disabled) return;
    socket.emit('dg:guess', t); inp.value = '';
  }

  // =========================================================
  // 初始化
  // =========================================================
  function init(sock, getSprites, getId) {
    socket = sock; sprites = getSprites; myId = getId;
    // 大廳按鈕
    $('dgCreatePublic').onclick = () => socket.emit('dg:create', { private: false });
    $('dgNoneCreate').onclick = () => socket.emit('dg:create', { private: false });
    $('dgRandom').onclick = () => { $('dgNone').classList.add('hidden'); socket.emit('dg:random'); };
    $('dgPrivate').onclick = () => { $('dgPrivatePanel').classList.toggle('hidden'); $('dgNone').classList.add('hidden'); setTimeout(() => $('dgCodeInput').focus(), 0); };
    $('dgCreatePrivate').onclick = () => socket.emit('dg:create', { private: true });
    const joinCode = () => { const c = $('dgCodeInput').value.trim(); if (c.length < 4) return toast('請輸入 4 碼房間代碼'); socket.emit('dg:join', c); };
    $('dgJoinCode').onclick = joinCode;
    $('dgCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') joinCode(); });
    $('dgCodeInput').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
    $('dgExit').onclick = () => socket.emit('toPlaza');
    $('dgLeave').onclick = () => socket.emit('dg:leave');
    $('dgInput').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    $('dgSend').onclick = send;
    buildTools(); bindBoard();
    const b = $('dgBoard'); b.width = BW * BRES; b.height = BH * BRES; redrawBoard();

    socket.on('dg:lobby', showLobby);
    socket.on('dg:none', () => { $('dgNone').classList.remove('hidden'); $('dgPrivatePanel').classList.add('hidden'); });
    socket.on('dg:error', toast);
    socket.on('dg:room', onRoom);
    socket.on('dg:strokes', list => { strokes = list.map(s => ({ c: s.c, s: s.s, e: s.e, p: s.p.slice() })); redrawBoard(); });
    socket.on('dg:op', applyOp);
    socket.on('dg:chat', addChat);
    addEventListener('resize', () => { if (lobbyShown) paintLobby(); roomBg = null; });
  }
  function hide() { stopRoomLoop(); room = null; lobbyShown = false; $('dgLobby').classList.add('hidden'); $('dgRoom').classList.add('hidden'); }

  window.DG = { init, hide, repaintLobby: () => lobbyShown && paintLobby() };
})();

// 色塊人城市：連線、角色建立、畫面切換、輸入、畫質
(function (root) {
  'use strict';
  const BM = root.BM;
  const { $, el, kids, toast } = BM.UI;
  const A = BM.Avatar;

  // ---------- 本機保存 ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  let token = store.get('bm_token', null);
  if (!/^[a-f0-9]{32}$/.test(token || '')) {
    const b = new Uint8Array(16); crypto.getRandomValues(b);
    token = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    store.set('bm_token', token);
  }

  // ---------- 畫質 ----------
  const QUALITIES = [
    { name: '省電', level: 0, dpr: 1, groundMax: 1 },
    { name: '標準', level: 1, dpr: 1.5, groundMax: 1.5 },
    { name: '高', level: 2, dpr: 2, groundMax: 2 },
  ];
  const coarse = matchMedia('(pointer: coarse)').matches;
  let qIdx = store.get('bm_quality', coarse ? 1 : 2);
  const quality = () => QUALITIES[qIdx];
  function setQuality(i, quiet) {
    qIdx = i; store.set('bm_quality', i);
    $('qualityLbl').textContent = '畫質：' + quality().name;
    if (!quiet) toast(`畫質：${quality().name}`);
    city.resize(); lobby.resize(); room.resize();
  }
  $('qualityBtn').onclick = () => setQuality((qIdx + 2) % 3);

  // ---------- 連線 ----------
  const socket = io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 3000 });
  let myId = null, profile = store.get('bm_profile', null), zone = null, everConnected = false;
  const app = BM.App = { where: t => { $('where').textContent = t; } };

  const city = new BM.CityScene($('cityCanvas'), {
    quality, send: (list, epoch) => socket.emit('city:cmd', { e: epoch, c: list }),
    onNear: po => { const n = $('nearTip'); if (po) { n.textContent = `⬆ 走進發光的門口，進入「${po.title}」`; n.classList.remove('hidden'); } else n.classList.add('hidden'); },
  });
  const lobby = new BM.LobbyUI(socket, { quality, profile: () => profile });
  const room = new BM.RoomUI(socket, { quality, myId: () => myId });

  const SCREENS = ['scrBoot', 'scrCreator', 'scrCity', 'scrLobby', 'scrRoom'];
  let screen = 'scrBoot';
  function show(id) { screen = id; SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id)); $('editBtn').classList.toggle('hidden', id !== 'scrCity'); }
  function fade(text, fn) {
    const f = $('fade'); f.textContent = text || ''; f.classList.add('show');
    setTimeout(() => { fn(); setTimeout(() => f.classList.remove('show'), 140); }, 260);
  }

  function boot(text) { $('bootText').textContent = text; show('scrBoot'); }

  socket.on('connect', () => {
    everConnected = true;
    $('netDot').classList.remove('off'); $('netBanner').classList.add('hidden');
    socket.emit('resume', { token });
  });
  socket.on('disconnect', () => {
    $('netDot').classList.add('off');
    if (screen === 'scrBoot') return;
    const b = $('netBanner'); b.textContent = '⚠️ 連線中斷，正在重新連線…（席位會保留 60 秒）'; b.classList.remove('hidden');
    city.stop();
  });
  socket.io.on('reconnect_attempt', () => { if (!everConnected) boot('正在連線到色塊人城市…'); });
  socket.on('connect_error', () => { if (!everConnected) boot('暫時連不上伺服器，正在重試…'); });
  socket.on('resume:none', () => openCreator(false));
  socket.on('session', d => { myId = d.id; profile = d.profile; store.set('bm_profile', profile); city.myProfile = profile; });
  socket.on('hello:error', e => { $('creatorError').textContent = e.text; $('enterBtn').disabled = false; if (screen !== 'scrCreator') toast(e.text, true); });
  socket.on('notice', n => toast(n.text));
  socket.on('replaced', () => {
    const b = $('netBanner'); b.innerHTML = '';
    kids(b, '這個角色已在其他分頁開啟', el('button', null, '在這裡繼續', { on: { click: () => { b.classList.add('hidden'); socket.connect(); } } }));
    b.classList.remove('hidden'); city.stop();
  });
  socket.on('room:error', e => {
    if (zone === 'lobby') lobby.onError(e);
    else if (e.code === 'NO_CHAT') $('rChatHint').textContent = e.text;
    else toast(e.text, true);
  });

  // ---------- 區域切換 ----------
  const TITLES = { city: '🏙️ 色塊人城市', lobby: '🔍 誰是臥底', room: '🎲 進入房間' };
  socket.on('zone', z => {
    const first = !zone || screen === 'scrBoot' || screen === 'scrCreator';
    const from = zone;
    zone = z.zone;
    const go = () => {
      $('netBanner').classList.add('hidden');
      if (z.zone !== 'city') city.stop();
      if (z.zone === 'city') { show('scrCity'); app.where('色塊人城市 ‧ 中央街區'); $('cityLog').innerHTML = ''; startCity(); }
      else if (z.zone === 'lobby') { show('scrLobby'); app.where('誰是臥底 ‧ 遊戲大廳'); lobby.enter(); }
      else if (z.zone === 'room') { show('scrRoom'); room.enter(); }
    };
    if (first || from === z.zone) go(); else fade(TITLES[z.zone], go);
  });
  // 出生位置：城市畫面顯示後才開始（轉場中先記著）
  let pendingSpawn = null;
  function startCity() { if (!pendingSpawn) return; const d = pendingSpawn; pendingSpawn = null; city.myProfile = profile; city.start(myId, d, d.epoch); }
  socket.on('city:spawn', d => { pendingSpawn = d; if (screen === 'scrCity' && zone === 'city') startCity(); });
  socket.on('city:roster', list => city.setRoster(list));
  socket.on('city:state', st => city.setState(st));
  socket.on('city:chat', m => {
    city.chat(m.id, m.text);
    const who = (city.roster.get(m.id) || {}).name || '?';
    const d = el('div'); kids(d, el('b', null, who + '：'), m.text);
    const log = $('cityLog'); log.appendChild(d);
    while (log.children.length > 30) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  });
  $('cityForm').onsubmit = e => {
    e.preventDefault();
    const t = $('cityInput').value.trim();
    if (t) socket.emit('city:chat', t);
    $('cityInput').value = ''; $('cityInput').blur();
  };

  // ---------- 角色建立 ----------
  let draft = { ...A.DEFAULT, ...(profile || {}) }, editing = false, previewYaw = Math.PI / 4, previewWalk = false;
  function openCreator(edit) {
    editing = edit;
    draft = { ...A.DEFAULT, ...(profile || store.get('bm_profile', {}) || {}) };
    $('creatorTitle').textContent = edit ? '修改你的色塊人' : profile || store.get('bm_profile', null) ? '歡迎回來！確認你的色塊人' : '建立你的色塊人';
    $('enterBtn').textContent = edit ? '儲存 ✓' : '進入城市 ▶';
    $('cancelEditBtn').classList.toggle('hidden', !edit);
    $('nameInput').value = draft.name || '';
    $('creatorError').textContent = ''; $('enterBtn').disabled = false;
    buildPickers();
    if (edit) city.stop();
    show('scrCreator'); app.where(edit ? '修改角色' : '建立角色');
    requestAnimationFrame(sizePreview);
  }
  function swatchRow(id, list, key, custom) {
    const box = $(id); box.innerHTML = '';
    for (const c of list) {
      const b = el('button', 'sw' + (draft[key] === c ? ' on' : ''), null, { type: 'button', title: c, 'aria-label': c });
      b.style.background = c;
      b.onclick = () => { draft[key] = c; buildPickers(); };
      box.appendChild(b);
    }
    if (custom) {
      const inp = el('input', 'sw-custom', null, { type: 'color', value: draft[key], title: '自訂顏色' });
      inp.oninput = () => { draft[key] = inp.value; box.querySelectorAll('.sw').forEach(x => x.classList.remove('on')); };
      box.appendChild(inp);
    }
  }
  function chipRow(id, list, key) {
    const box = $(id); box.innerHTML = '';
    for (const [v, label] of list) box.appendChild(el('button', 'chip' + (draft[key] === v ? ' on' : ''), label, { type: 'button', on: { click: () => { draft[key] = v; buildPickers(); } } }));
  }
  function buildPickers() {
    swatchRow('swBody', A.OPT.bodies, 'body', true);
    swatchRow('swAccent', A.OPT.accents, 'accent', true);
    swatchRow('swSkin', A.OPT.skins, 'skin', false);
    swatchRow('swHair', A.OPT.hairs, 'hair', true);
    chipRow('chExpr', A.OPT.exprs, 'expr');
    chipRow('chHat', A.OPT.hats, 'hat');
    chipRow('chGlasses', A.OPT.glasses, 'glasses');
  }
  const pick = l => l[Math.floor(Math.random() * l.length)];
  $('randomBtn').onclick = () => {
    Object.assign(draft, { body: pick(A.OPT.bodies), accent: pick(A.OPT.accents), skin: pick(A.OPT.skins), hair: pick(A.OPT.hairs),
      expr: pick(A.OPT.exprs)[0], hat: pick(A.OPT.hats)[0], glasses: Math.random() < 0.6 ? 'none' : pick(A.OPT.glasses)[0] });
    buildPickers();
  };
  $('rotL').onclick = () => { previewYaw -= Math.PI / 4; };
  $('rotR').onclick = () => { previewYaw += Math.PI / 4; };
  $('walkToggle').onclick = () => { previewWalk = !previewWalk; $('walkToggle').classList.toggle('on', previewWalk); };
  $('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('enterBtn').click(); });
  $('cancelEditBtn').onclick = () => socket.emit('resume', { token });
  $('enterBtn').onclick = () => {
    const name = $('nameInput').value.trim();
    if (!name) { $('creatorError').textContent = '請輸入暱稱'; return; }
    if (Array.from(name).length > 10) { $('creatorError').textContent = '暱稱最多 10 個字'; return; }
    draft.name = name;
    $('enterBtn').disabled = true; $('creatorError').textContent = '';
    store.set('bm_profile', draft);
    if (editing) socket.emit('profile', draft); else socket.emit('hello', { token, profile: draft });
    if (editing) setTimeout(() => socket.emit('resume', { token }), 120);
    else boot('正在進入城市…');
  };
  $('editBtn').onclick = () => openCreator(true);

  let pv = null;
  function sizePreview() {
    const c = $('previewCanvas'), r = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(r.width * d); c.height = Math.round(r.height * d); pv = { c, g: c.getContext('2d'), d, w: r.width, h: r.height };
  }
  let walkPh = 0, shownYaw = Math.PI / 4;
  function drawPreview(t, dt) {
    if (!pv) return;
    const { g, d, w, h } = pv;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, pv.c.width, pv.c.height);
    const s = Math.min(w, h) / 120;
    g.setTransform(d * s, 0, 0, d * s, d * w / 2, d * (h * 0.78)); g.lineJoin = 'round';
    // 小地台
    BM.Iso.box(g, -26, -26, -8, 52, 52, 8, '#a5e08a');
    let diff = previewYaw - shownYaw; shownYaw += diff * Math.min(1, dt * 10);
    if (previewWalk) walkPh += dt * 10;
    A.draw(g, { ...draft, name: $('nameInput').value }, { yaw: shownYaw, walk: walkPh, amp: previewWalk ? 1 : 0, t });
  }

  // ---------- 鍵盤 ----------
  const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT'); };
  addEventListener('keydown', e => {
    if (screen !== 'scrCity') return;
    if (typing()) { if (e.key === 'Escape') document.activeElement.blur(); return; }   // 輸入聊天時暫停移動快捷鍵
    if (e.key === 'Enter') { e.preventDefault(); clearKeys(); $('cityInput').focus(); return; }
    if (KEYMAP[e.code]) { e.preventDefault(); city.keys[KEYMAP[e.code]] = 1; }
  });
  addEventListener('keyup', e => { if (KEYMAP[e.code]) city.keys[KEYMAP[e.code]] = 0; });
  const clearKeys = () => { city.keys = { up: 0, down: 0, left: 0, right: 0 }; city.stick = [0, 0]; };
  addEventListener('blur', clearKeys);
  $('cityInput').addEventListener('focus', clearKeys);

  // ---------- 虛擬搖桿 ----------
  (function joystick() {
    const j = $('joy'), k = $('joyKnob');
    let id = null, cx = 0, cy = 0;
    const R = 46;
    const set = (dx, dy) => {
      const m = Math.hypot(dx, dy), s = m > R ? R / m : 1;
      dx *= s; dy *= s;
      k.style.transform = `translate(${dx}px, ${dy}px)`;
      const mag = Math.min(1, m / R);
      city.stick = mag < 0.15 ? [0, 0] : [dx / R, dy / R];
    };
    j.addEventListener('pointerdown', e => { id = e.pointerId; j.setPointerCapture(id); const r = j.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; set(e.clientX - cx, e.clientY - cy); });
    j.addEventListener('pointermove', e => { if (e.pointerId === id) set(e.clientX - cx, e.clientY - cy); });
    const end = e => { if (e.pointerId !== id) return; id = null; k.style.transform = ''; city.stick = [0, 0]; };
    j.addEventListener('pointerup', end); j.addEventListener('pointercancel', end);
  })();

  // ---------- 主迴圈 ----------
  let last = 0, slowSince = 0, autoLowered = false;
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
    if (screen === 'scrCity') {
      city.frame(t);
      // 長時間掉幀：自動降一級畫質（只做一次）
      if (city.fps < 38 && qIdx > 0 && !autoLowered) { if (!slowSince) slowSince = t; else if (t - slowSince > 6000) { autoLowered = true; setQuality(qIdx - 1, true); toast(`偵測到畫面較卡，已自動切換為「${quality().name}」畫質`); } }
      else slowSince = 0;
    } else if (screen === 'scrRoom') room.frame(t);
    else if (screen === 'scrLobby') lobby.frame(t);
    else if (screen === 'scrCreator') drawPreview(t, dt);
  }
  requestAnimationFrame(loop);

  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (screen === 'scrCity') city.resize(); if (screen === 'scrLobby') lobby.resize(); if (screen === 'scrRoom') room.resize(); if (screen === 'scrCreator') sizePreview(); }, 120); });

  setQuality(qIdx, true);
  boot('正在連線到色塊人城市…');
  BM.debug = { city, room, lobby, socket, get zone() { return zone; }, get myId() { return myId; } };
})(this);

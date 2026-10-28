// 色塊人宇宙都市：連線與畫面切換（角色編輯器在 index.html）
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const socket = io();
  let myId = null, sprites = {}, lastState = null, epoch = 0, zone = null, worldCfg = null;
  let switching = false, pendingMap = null;   // 轉場中先收著地圖，等場景啟動後再套用
  const keys = { up: false, down: false, left: false, right: false };

  const SCREENS = ['editorScreen', 'gameScreen', 'dgLobby', 'dgRoom'];
  function show(id) { SCREENS.forEach(s => $(s).classList.toggle('hidden', s !== id)); }
  function fade(text, fn) {
    const f = $('fade'); f.textContent = text || ''; f.classList.add('show');
    setTimeout(() => { fn(); setTimeout(() => f.classList.remove('show'), 120); }, 280);
  }

  $('joinBtn').onclick = () => {
    const sprite = window.makeSprite();
    if (!sprite) return;
    const name = $('nameInput').value.trim() || '玩家' + Math.floor(Math.random() * 1000);
    try { localStorage.setItem('bm_name', name); } catch (e) {}
    socket.emit('join', { name, sprite });
  };
  socket.on('joined', d => { myId = d.id; });
  socket.on('errorMsg', m => alert(m));
  socket.on('sprites', map => { sprites = map; Game.setSprites(map); });

  // ---------- 區域切換 ----------
  socket.on('zone', z => {
    const first = zone === null;
    switching = true; pendingMap = null;
    const go = () => {
      switching = false;
      epoch = z.epoch;
      Object.keys(keys).forEach(k => keys[k] = false);
      if (z.kind === 'world') {
        zone = z.cfg.world; worldCfg = z.cfg;
        DG.hide(); show('gameScreen'); boardKey = '';
        $('chatLog').innerHTML = '';
        $('zoneTitle').innerHTML = '';
        $('zoneTitle').append(z.cfg.world === 'plaza' ? '🏙️ ' : '⭐ ', z.cfg.title);
        const small = document.createElement('small');
        small.textContent = z.cfg.world === 'plaza' ? '走進發光的入口就能進入遊戲' : `先搶到 ${z.cfg.WIN_SCORE} 顆星星獲勝`;
        $('zoneTitle').append(small);
        $('listTitle').textContent = z.cfg.world === 'plaza' ? '在線玩家' : '排行榜';
        $('plazaBtn').classList.toggle('hidden', z.cfg.world === 'plaza');
        $('status').textContent = z.cfg.title;
        Game.start(z.cfg, myId, {
          mask: () => (keys.up ? 1 : 0) | (keys.down ? 2 : 0) | (keys.left ? 4 : 0) | (keys.right ? 8 : 0),
          send: list => socket.emit('cmds', { e: epoch, c: list })
        });
        fitStage();
        if (pendingMap) { Game.setMap(pendingMap); pendingMap = null; }
      } else {
        zone = 'dg'; Game.stop();
        $('status').textContent = '你畫我猜';
        show('dgLobby');
      }
    };
    if (first) go();
    else fade(z.kind === 'world' ? (z.cfg.world === 'plaza' ? '🏙️ 回到宇宙廣場' : `⭐ ${z.cfg.title}`) : `🎨 ${z.title}`, go);
  });
  socket.on('map', m => { if (switching) pendingMap = m; else Game.setMap(m); });
  socket.on('state', s => { if (zone === 'dg' || switching) return; lastState = s; Game.setState(s); updateBoard(); });
  socket.on('chat', m => {
    const div = document.createElement('div');
    const b = document.createElement('b'); b.textContent = m.name + '：';
    div.append(b, document.createTextNode(m.text));
    $('chatLog').appendChild(div); $('chatLog').scrollTop = 1e9;
  });
  $('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.value.trim()) { socket.emit('chat', e.target.value); e.target.value = ''; }
  });
  $('backBtn').onclick = () => location.reload();
  $('plazaBtn').onclick = () => socket.emit('toPlaza');

  // 你畫我猜
  DG.init(socket, () => sprites, () => myId);
  // dg:room 出現時切換到房間畫面（DG 內部處理顯示）
  socket.on('dg:lobby', () => show('dgLobby'));
  socket.on('dg:room', () => { if ($('dgRoom').classList.contains('hidden')) show('dgRoom'); });

  // ---------- 鍵盤 / 觸控 ----------
  const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  addEventListener('keydown', e => {
    if (zone === 'dg' || zone === null) return;
    if (document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (KEYMAP[e.code]) { e.preventDefault(); keys[KEYMAP[e.code]] = true; }
  });
  addEventListener('keyup', e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
  addEventListener('blur', () => Object.keys(keys).forEach(k => keys[k] = false));
  document.querySelectorAll('#pad button').forEach(b => {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', e => { e.preventDefault(); keys[k] = true; });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => keys[k] = false));
  });

  // 排行榜：只在名單、分數或順序改變時才更新（以前每秒重建 30 次，連角色圖片都重新解碼，會造成卡頓）
  const rows = new Map();
  let boardKey = '';
  function updateBoard() {
    const list = [...lastState.players].sort((a, b) => b.score - a.score);
    const key = zone + '|' + list.map(p => p.id + ':' + p.score + ':' + (sprites[p.id] ? 1 : 0)).join(',');
    if (key === boardKey) return;
    boardKey = key;
    const ol = $('scoreList'), keep = new Set(list.map(p => p.id));
    for (const [id, li] of rows) if (!keep.has(id)) { li.remove(); rows.delete(id); }
    list.forEach((p, i) => {
      let li = rows.get(p.id);
      if (!li) {
        li = document.createElement('li');
        li.append(document.createElement('img'), document.createElement('span'));
        rows.set(p.id, li);
      }
      const im = li.firstChild, sp = sprites[p.id];
      if (sp && im._src !== sp.sprite) { im._src = sp.sprite; im.src = sp.sprite; }
      const nm = sp ? sp.name : '?';
      li.lastChild.textContent = `${nm}${p.id === myId ? '（你）' : ''}${zone === 'stars' ? ' — ' + p.score : ''}`;
      if (ol.children[i] !== li) ol.insertBefore(li, ol.children[i] || null);
    });
  }

  // 遊戲畫面依視窗大小放到最大（整張地圖都在視窗內）
  function fitStage() {
    if ($('gameScreen').classList.contains('hidden')) return;
    const wrap = $('stageWrap');
    wrap.style.width = '100%';
    const col = wrap.getBoundingClientRect().width;
    const top = wrap.getBoundingClientRect().top + scrollY;
    const availH = innerHeight - top - 12;
    const w = Math.max(320, Math.min(col, availH * Game.aspect()));
    wrap.style.width = Math.round(w) + 'px';
    Game.resize();
  }
  let fitTimer = 0;
  addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitStage, 120); });
})();

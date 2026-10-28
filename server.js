// 色塊人宇宙都市 - 伺服器
// 區域：宇宙廣場（plaza）→ 走進建築 → 你畫我猜（dg）／搶星星草原（stars）
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Move = require('./public/shared.js');
const World = require('./server/world');
const DrawGuess = require('./server/drawguess');
const { PLAZA_W, PLAZA_H, plazaMap, meadowMap } = require('./server/maps');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });
app.use(express.static(__dirname + '/public'));

const players = new Map();   // socket.id -> player

// ---------- 宇宙廣場 ----------
const plaza = new World(io, {
  id: 'plaza', title: '色塊人宇宙廣場', W: PLAZA_W, H: PLAZA_H, theme: 'plaza',
  init(w) { Object.assign(w, plazaMap()); },
  onPortal(p, portal) {
    if (portal.id === 'drawguess') enterDrawGuess(p);
    else if (portal.id === 'stars') enterWorld(p, stars);
  },
});
const exitOf = id => plaza.portals.find(p => p.id === id).exit;

// ---------- 搶星星草原 ----------
const STAR_COUNT = 4, PICK_R = 22, WIN_SCORE = 10;
const rid = () => Math.random().toString(36).slice(2, 9);
const spawnStar = w => { const s = w.freeSpot(14); return { id: rid(), x: Math.round(s.x), y: Math.round(s.y) }; };
function resetStars(w) {
  w.obstacles = meadowMap(w.W, w.H);
  w.stars = Array.from({ length: STAR_COUNT }, () => spawnStar(w));
  w.winner = null;
  for (const p of w.players.values()) Object.assign(p, w.freeSpot(), { vx: 0, vy: 0, score: 0, queue: [] });
  w.sendMap();
}
const stars = new World(io, {
  id: 'stars', title: '搶星星草原', W: 960, H: 600, theme: 'meadow', extraCfg: { WIN_SCORE },
  init: resetStars,
  onAdd(w, p) { p.score = 0; },
  afterStep(w, p, now) {
    for (let i = 0; i < w.stars.length; i++) {
      const s = w.stars[i];
      if (Math.hypot(s.x - p.x, s.y - p.y) < PICK_R) {
        p.score++;
        w.stars[i] = spawnStar(w);
        if (p.score >= WIN_SCORE && !w.winner) { w.winner = p.name; w.resetAt = now + 4000; }
      }
    }
  },
  tick(w, now) { if (w.winner && now > w.resetAt) resetStars(w); },
});

const worlds = { plaza, stars };

// ---------- 你畫我猜 ----------
const dg = new DrawGuess(io, {});

// ---------- 區域切換 ----------
function leaveZone(p) {
  if (worlds[p.zone]) worlds[p.zone].remove(p);
  else if (p.zone === 'dg') dg.leave(p, true);
  p.zone = null;
}
function enterWorld(p, w, spawn) {
  leaveZone(p);
  p.zone = w.id; p.epoch++;
  p.socket.emit('zone', { kind: 'world', cfg: w.cfg(), epoch: p.epoch });
  w.add(p, spawn);
  w.sendMap(p);
}
function enterDrawGuess(p) {
  leaveZone(p);
  p.zone = 'dg'; p.epoch++;
  p.socket.emit('zone', { kind: 'dg', title: '你畫我猜', epoch: p.epoch });
  dg.enterLobby(p);
}

const spriteMap = () => Object.fromEntries([...players.values()].map(p => [p.id, { sprite: p.sprite, name: p.name }]));

io.on('connection', socket => {
  const me = () => players.get(socket.id);

  socket.on('join', data => {
    if (players.has(socket.id)) return;
    const sprite = data && data.sprite;
    if (typeof sprite !== 'string' || !sprite.startsWith('data:image/png;base64,') || sprite.length > 60000) {
      socket.emit('errorMsg', '角色圖片格式錯誤');
      return;
    }
    const name = String((data && data.name) || '玩家').trim().slice(0, 12) || '玩家';
    const p = { id: socket.id, socket, name, sprite, zone: null, epoch: 0, score: 0, dgRoom: null };
    players.set(socket.id, p);
    socket.emit('joined', { id: socket.id });
    io.emit('sprites', spriteMap());
    enterWorld(p, plaza, { x: 480 + (Math.random() - 0.5) * 120, y: 520 + (Math.random() - 0.5) * 30, facing: 1 });
    io.to(plaza.room).emit('chat', { name: '系統', text: `${name} 來到了宇宙廣場` });
  });

  socket.on('cmds', msg => { const p = me(); if (p && worlds[p.zone]) worlds[p.zone].cmds(p, msg); });
  socket.on('toPlaza', () => {
    const p = me(); if (!p || p.zone === 'plaza') return;
    const from = p.zone;
    enterWorld(p, plaza, exitOf(from === 'dg' ? 'drawguess' : 'stars'));
  });

  socket.on('chat', text => {
    const p = me();
    if (!p || !worlds[p.zone] || typeof text !== 'string') return;
    const t = text.trim().slice(0, 80);
    if (t) io.to(worlds[p.zone].room).emit('chat', { name: p.name, text: t });
  });

  // 你畫我猜
  const onDg = (ev, fn) => socket.on(ev, arg => { const p = me(); if (p && p.zone === 'dg') fn(p, arg); });
  onDg('dg:create', (p, a) => dg.create(p, a && a.private));
  onDg('dg:random', p => dg.random(p));
  onDg('dg:join', (p, code) => dg.joinCode(p, code));
  onDg('dg:leave', p => dg.leave(p));
  onDg('dg:settings', (p, s) => dg.settings(p, s));
  onDg('dg:ready', (p, v) => dg.ready(p, v));
  onDg('dg:start', p => dg.start(p));
  onDg('dg:again', p => dg.again(p));
  onDg('dg:op', (p, o) => dg.op(p, o));
  onDg('dg:guess', (p, t) => dg.guess(p, t));

  socket.on('disconnect', () => {
    const p = me();
    if (!p) return;
    leaveZone(p);
    players.delete(socket.id);
    io.emit('sprites', spriteMap());
  });
});

// ---------- 主迴圈：120Hz 處理移動，每秒廣播 40 次 ----------
let last = Date.now(), lastSend = 0;
setInterval(() => {
  const now = Date.now();
  const steps = (now - last) / 1000 / Move.STEP; last = now;
  for (const w of Object.values(worlds)) w.tick(now, steps);
  if (now - lastSend >= 1000 / 40 - 2) {
    lastSend = now;
    for (const w of Object.values(worlds)) w.broadcast(now);
  }
}, 1000 / 120);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`色塊人宇宙都市啟動：http://localhost:${PORT}`));

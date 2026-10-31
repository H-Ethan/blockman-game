// 色塊人城市 - 伺服器
// 共用系統：角色、城市移動、建築入口、房間（server/core）
// 個別桌遊：誰是臥底（server/games/undercover）
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const Move = require('./public/js/shared/move.js');
const CITY = require('./public/js/shared/citymap.js');
const UC = require('./public/js/shared/uc-rules.js');
const City = require('./server/core/city');
const RoomManager = require('./server/core/rooms');
const { checkProfile } = require('./server/core/filter');
const Undercover = require('./server/games/undercover/game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 2e4, pingInterval: 8000, pingTimeout: 7000 });
app.use(express.static(__dirname + '/public'));
app.get('/healthz', (req, res) => res.send('ok'));

const HOLD_MS = UC.SEAT_HOLD_SEC * 1000 * (+process.env.UC_TIME_SCALE || 1);
const sessions = new Map();   // token → 玩家
const byId = new Map();       // 公開 id → 玩家（token 只存在伺服器與本人瀏覽器）

// ---------- 區域 ----------
const city = new City(io, { onPortal: (p, portal) => { if (portal.id === 'undercover') enterLobby(p); } });
const uc = new RoomManager(io, {
  Game: Undercover, kind: 'undercover',
  hooks: {
    enterRoom: p => { uc.watch(p, false); setZone(p, 'room'); },
  },
});
const portalExit = id => { const po = CITY.portals.find(x => x.id === id); return po ? po.exit : CITY.spawn; };

function setZone(p, zone, extra) {
  p.zone = zone;
  p.epoch++;
  p.zoneAt = Date.now();
  if (p.online) p.socket.emit('zone', { zone, epoch: p.epoch, ...(extra || {}) });
}
function leaveCurrent(p) {
  if (p.zone === 'city') city.remove(p);
  if (p.zone === 'lobby') uc.watch(p, false);
}
function enterCity(p, pos) {
  leaveCurrent(p);
  setZone(p, 'city');
  const s = city.add(p, pos);
  p.socket.emit('city:spawn', { x: s.x, y: s.y, epoch: p.epoch });
}
function enterLobby(p) {
  leaveCurrent(p);
  setZone(p, 'lobby', { building: 'undercover' });
  uc.watch(p, true);
  uc.sendList(p);
}

// ---------- 連線 ----------
const TOKEN_RE = /^[a-f0-9]{32}$/;
function bindSocket(p, socket) {
  if (p.socket && p.socket !== socket && p.socket.connected) {
    p.socket.emit('replaced');            // 同一個角色在別的分頁開啟
    p.socket.data.replaced = true;
    p.socket.disconnect(true);
  }
  p.socket = socket;
  socket.data.p = p;
  p.online = true;
  p.discAt = 0;
}

function resume(p) {
  p.socket.emit('session', { id: p.id, profile: p.profile });
  if (p.zone === 'room' && uc.onReconnect(p)) { setZone(p, 'room'); uc.flush(); return; }
  if (p.zone === 'lobby') return enterLobby(p);
  enterCity(p, p.zone === 'city' && p.c ? { x: p.c.x, y: p.c.y } : p.cityPos);
}

io.on('connection', socket => {
  const me = () => socket.data.p;

  socket.on('resume', d => {
    const token = d && d.token;
    const p = TOKEN_RE.test(token || '') && sessions.get(token);
    if (!p) return socket.emit('resume:none');
    bindSocket(p, socket);
    resume(p);
  });

  socket.on('hello', d => {
    const token = d && d.token;
    if (!TOKEN_RE.test(token || '')) return socket.emit('hello:error', { text: '連線資料錯誤，請重新整理頁面' });
    const chk = checkProfile(d.profile);
    if (chk.error) return socket.emit('hello:error', { text: chk.error });
    let p = sessions.get(token);
    if (!p) {
      p = { id: crypto.randomBytes(5).toString('hex'), token, profile: chk.profile, socket: null, online: false,
        zone: null, epoch: 0, cityPos: null, roomCode: null };
      sessions.set(token, p); byId.set(p.id, p);
    } else p.profile = chk.profile;
    bindSocket(p, socket);
    p.socket.emit('session', { id: p.id, profile: p.profile });
    if (p.zone === 'room' && uc.onReconnect(p)) { setZone(p, 'room'); return; }
    enterCity(p, p.cityPos || { x: CITY.spawn.x + (Math.random() - 0.5) * 120, y: CITY.spawn.y });
  });

  // 在城市裡修改角色
  socket.on('profile', raw => {
    const p = me(); if (!p) return;
    const chk = checkProfile(raw);
    if (chk.error) return socket.emit('hello:error', { text: chk.error });
    p.profile = chk.profile;
    socket.emit('session', { id: p.id, profile: p.profile });
    if (p.zone === 'city') city.rosterDirty = true;
  });

  // 城市
  socket.on('city:cmd', msg => { const p = me(); if (p && p.zone === 'city') city.cmds(p, msg); });
  socket.on('city:chat', t => { const p = me(); if (p && p.zone === 'city') city.chat(p, t); });

  // 大廳
  const inLobby = fn => (...a) => { const p = me(); if (p && p.zone === 'lobby') fn(p, ...a); };
  socket.on('lobby:exit', inLobby(p => enterCity(p, portalExit('undercover'))));
  socket.on('lobby:list', inLobby(p => uc.sendList(p)));
  socket.on('room:create', inLobby((p, d) => uc.create(p, d)));
  socket.on('room:join', inLobby((p, d) => uc.join(p, d && d.code, d && d.password)));
  socket.on('room:random', inLobby(p => uc.random(p)));

  // 房間
  const inRoom = fn => (...a) => { const p = me(); if (p && p.zone === 'room') fn(p, ...a); };
  socket.on('room:ready', inRoom((p, v) => uc.ready(p, v)));
  socket.on('room:settings', inRoom((p, d) => uc.settings(p, d)));
  socket.on('room:start', inRoom(p => uc.start(p)));
  socket.on('room:again', inRoom(p => uc.again(p)));
  socket.on('room:chat', inRoom((p, t) => uc.chat(p, t)));
  socket.on('room:leave', inRoom((p, d) => {
    uc.removeMember(p, 'leave');
    if (d && d.toCity) enterCity(p, portalExit('undercover')); else enterLobby(p);
  }));
  for (const type of ['confirm', 'describe', 'vote', 'guess', 'skip']) socket.on('uc:' + type, inRoom((p, d) => uc.action(p, type, d)));

  socket.on('disconnect', () => {
    const p = me();
    if (!p || socket.data.replaced || p.socket !== socket) return;
    p.online = false;
    p.discAt = Date.now();
    if (p.zone === 'city') city.remove(p);
    if (p.zone === 'lobby') uc.watch(p, false);
    if (p.zone === 'room') uc.onDisconnect(p);
  });
});

// ---------- 主迴圈：120Hz 處理移動，城市每秒同步 25 次，房間每秒檢查 10 次 ----------
let last = Date.now(), lastCity = 0, lastRoom = 0;
setInterval(() => {
  const now = Date.now();
  const steps = (now - last) / 1000 / Move.STEP; last = now;
  city.tick(now, steps);
  if (now - lastCity >= 40) { lastCity = now; city.broadcast(now); }
  if (now - lastRoom >= 100) {
    lastRoom = now;
    // 斷線超過保留時間 → 離開房間（遊戲中視為棄權淘汰）並清除角色
    for (const p of sessions.values()) {
      if (p.online || now - p.discAt < HOLD_MS) continue;
      if (p.roomCode) uc.removeMember(p, 'timeout');
      sessions.delete(p.token); byId.delete(p.id);
    }
    uc.tick(now);
  }
}, 1000 / 120);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`色塊人城市啟動：http://localhost:${PORT}`));

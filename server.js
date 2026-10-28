// 色塊人多人連線遊戲 - 伺服器（權威式：位置、碰撞與得分都由伺服器計算）
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Move = require('./public/shared.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });
app.use(express.static(__dirname + '/public'));

// ---- 遊戲參數 ----
const W = 960, H = 600;      // 地面大小（俯視座標，y 代表前後深度）
const PW = 24, PH = 48;      // 角色圖大小
const WIN_SCORE = 10;        // 獲勝分數
const STAR_COUNT = 4;
const PICK_R = 22;           // 撿星星距離
const SEND_MS = 1000 / 30;   // 每秒廣播 30 次
const MAX_QUEUE = 30;        // 每位玩家最多暫存的指令數
const MAX_CREDIT = 8;        // 允許短暫補送的步數（防加速外掛）

const players = {};          // socket.id -> player
let stars = [];
let obstacles = [];
let winner = null;
let resetAt = 0;

const rid = () => Math.random().toString(36).slice(2, 9);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- 碰撞 ----
const hitsObstacle = (x, y, pad = 0) => Move.hits(obstacles, x, y, pad);
function freeSpot(pad) {
  for (let i = 0; i < 500; i++) {
    const x = rand(30, W - 30), y = rand(30, H - 30);
    if (!hitsObstacle(x, y, pad)) return { x, y };
  }
  return { x: W / 2, y: H / 2 };
}

// ---- 隨機地圖：牆壁、石頭、樹 ----
function genMap() {
  const list = [];
  const GAP = 44; // 障礙物之間至少留這麼寬，保證角色走得過去
  const ok = r => r.x >= 24 && r.y >= 36 && r.x + r.w <= W - 24 && r.y + r.d <= H - 24 &&
    !list.some(o => r.x < o.x + o.w + GAP && r.x + r.w > o.x - GAP && r.y < o.y + o.d + GAP && r.y + r.d > o.y - GAP);
  const place = (n, make) => {
    for (let k = 0, tries = 0; k < n && tries < 400; tries++) {
      const r = make();
      if (ok(r)) { r.id = rid(); r.seed = Math.floor(Math.random() * 1e9); list.push(r); k++; }
    }
  };
  place(4, () => {
    const len = rand(110, 230);
    return Math.random() < 0.5
      ? { type: 'wall', x: rand(0, W), y: rand(0, H), w: len, d: 18 }
      : { type: 'wall', x: rand(0, W), y: rand(0, H), w: 18, d: len };
  });
  place(6, () => ({ type: 'rock', x: rand(0, W), y: rand(0, H), w: rand(28, 48), d: rand(16, 24) }));
  place(10, () => ({ type: 'tree', x: rand(0, W), y: rand(0, H), w: 18, d: 10 }));
  for (const o of list) for (const key of ['x', 'y', 'w', 'd']) o[key] = Math.round(o[key]);
  return list;
}

const spawnStar = () => { const s = freeSpot(14); return { id: rid(), x: Math.round(s.x), y: Math.round(s.y) }; };

function resetRound() {
  obstacles = genMap();
  stars = Array.from({ length: STAR_COUNT }, spawnStar);
  for (const p of Object.values(players)) {
    p.score = 0;
    Object.assign(p, freeSpot(6), { vx: 0, vy: 0, queue: [] });
  }
  winner = null;
  io.emit('map', obstacles);
}
resetRound();

const spriteMap = () => Object.fromEntries(
  Object.values(players).map(p => [p.id, { sprite: p.sprite, name: p.name }])
);

io.on('connection', socket => {
  socket.on('join', data => {
    const sprite = data && data.sprite;
    if (typeof sprite !== 'string' || !sprite.startsWith('data:image/png;base64,') || sprite.length > 60000) {
      socket.emit('errorMsg', '角色圖片格式錯誤');
      return;
    }
    const name = String((data && data.name) || '玩家').trim().slice(0, 12) || '玩家';
    players[socket.id] = { id: socket.id, name, sprite, ...freeSpot(6), vx: 0, vy: 0, score: 0, facing: 1,
      queue: [], seq: 0, credit: 0 };
    socket.emit('joined', { id: socket.id, W, H, PW, PH, WIN_SCORE });
    socket.emit('map', obstacles);
    io.emit('sprites', spriteMap());
    io.emit('chat', { name: '系統', text: `${name} 加入了遊戲` });
  });

  // 客戶端送來編號過的移動指令：[[seq, 按鍵位元], ...]，每筆代表一個 1/60 秒的步長
  socket.on('cmds', list => {
    const p = players[socket.id];
    if (!p || !Array.isArray(list)) return;
    for (const c of list.slice(0, 20)) {
      if (!Array.isArray(c)) continue;
      const seq = c[0], mask = c[1] & 15;
      if (!Number.isInteger(seq) || seq <= p.seq) continue;
      if (p.queue.length < MAX_QUEUE) p.queue.push([seq, mask]);
      p.seq = seq;
    }
  });

  socket.on('chat', text => {
    const p = players[socket.id];
    if (!p || typeof text !== 'string') return;
    const t = text.trim().slice(0, 80);
    if (t) io.emit('chat', { name: p.name, text: t });
  });

  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (!p) return;
    delete players[socket.id];
    io.emit('sprites', spriteMap());
    io.emit('chat', { name: '系統', text: `${p.name} 離開了` });
  });
});

function checkStars(p, now) {
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    if (Math.hypot(s.x - p.x, s.y - p.y) < PICK_R) {
      p.score++;
      stars[i] = spawnStar();
      if (p.score >= WIN_SCORE && !winner) {
        winner = p.name;
        resetAt = now + 4000;
      }
    }
  }
}

// 主迴圈：依實際經過時間發放步數額度，每位玩家依序執行自己的指令
let last = Date.now(), lastSend = 0;
setInterval(() => {
  const now = Date.now();
  const steps = (now - last) / 1000 / Move.STEP; last = now;
  if (winner && now > resetAt) resetRound();

  for (const p of Object.values(players)) {
    p.credit = Math.min(MAX_CREDIT, p.credit + steps);
    while (p.queue.length && p.credit >= 1) {
      const [seq, mask] = p.queue.shift();
      p.credit -= 1;
      p.ack = seq;
      if (winner) continue; // 結算畫面時不移動，但照樣確認指令
      Move.step(p, mask, obstacles, W, H);
      checkStars(p, now);
    }
  }

  if (now - lastSend >= SEND_MS - 2) {
    lastSend = now;
    io.emit('state', {
      t: now,
      players: Object.values(players).map(p => ({
        id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, score: p.score, facing: p.facing, ack: p.ack || 0
      })),
      stars, winner
    });
  }
}, 1000 / 120);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`色塊人遊戲啟動：http://localhost:${PORT}`));

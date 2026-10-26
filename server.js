// 色塊人多人連線遊戲 - 伺服器（權威式：位置、碰撞與得分都由伺服器計算）
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });
app.use(express.static(__dirname + '/public'));

// ---- 遊戲參數 ----
const W = 960, H = 600;      // 地面大小（俯視座標，y 代表前後深度）
const PW = 24, PH = 48;      // 角色圖大小
const FOOT_W = 10, FOOT_D = 6; // 角色腳下碰撞範圍（半寬、半深）
const SPEED = 4.2;           // 每 tick 移動像素
const WIN_SCORE = 10;        // 獲勝分數
const STAR_COUNT = 4;
const PICK_R = 22;           // 撿星星距離
const TICK = 1000 / 30;

const players = {};          // socket.id -> player
let stars = [];
let obstacles = [];
let winner = null;
let resetAt = 0;

const rid = () => Math.random().toString(36).slice(2, 9);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- 碰撞 ----
function hitsObstacle(x, y, pad = 0) {
  return obstacles.some(o =>
    x + FOOT_W + pad > o.x && x - FOOT_W - pad < o.x + o.w &&
    y + FOOT_D + pad > o.y && y - FOOT_D - pad < o.y + o.d);
}
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
    Object.assign(p, freeSpot(6));
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
    players[socket.id] = { id: socket.id, name, sprite, ...freeSpot(6), score: 0, input: {}, facing: 1, moving: false };
    socket.emit('joined', { id: socket.id, W, H, PW, PH, WIN_SCORE });
    socket.emit('map', obstacles);
    io.emit('sprites', spriteMap());
    io.emit('chat', { name: '系統', text: `${name} 加入了遊戲` });
  });

  socket.on('input', i => {
    const p = players[socket.id];
    if (p && i) p.input = { up: !!i.up, down: !!i.down, left: !!i.left, right: !!i.right };
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

// 單軸移動：被擋住就試著走小一點，可以貼著牆滑行
function stepAxis(p, axis, delta) {
  for (const f of [1, 0.5, 0.25]) {
    const nx = axis === 'x' ? clamp(p.x + delta * f, FOOT_W, W - FOOT_W) : p.x;
    const ny = axis === 'y' ? clamp(p.y + delta * f, FOOT_D + 2, H - FOOT_D) : p.y;
    if (!hitsObstacle(nx, ny)) { p.x = nx; p.y = ny; return; }
  }
}

setInterval(() => {
  const now = Date.now();
  if (winner && now > resetAt) resetRound();

  for (const p of Object.values(players)) {
    p.moving = false;
    if (winner) continue;
    let dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    let dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
    if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
    if (dx) p.facing = dx > 0 ? 1 : -1;
    const ox = p.x, oy = p.y;
    if (dx) stepAxis(p, 'x', dx * SPEED);
    if (dy) stepAxis(p, 'y', dy * SPEED);
    p.moving = p.x !== ox || p.y !== oy;

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

  io.emit('state', {
    players: Object.values(players).map(p => ({
      id: p.id, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10,
      score: p.score, facing: p.facing, moving: p.moving
    })),
    stars, winner
  });
}, TICK);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`色塊人遊戲啟動：http://localhost:${PORT}`));

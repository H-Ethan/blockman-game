// 色塊人多人連線遊戲 - 伺服器（權威式：位置與得分都由伺服器計算）
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });
app.use(express.static(__dirname + '/public'));

// ---- 遊戲參數 ----
const W = 800, H = 500;      // 場地大小
const PW = 24, PH = 48;      // 角色大小（與前端角色圖一致）
const SPEED = 4;             // 每 tick 移動像素
const WIN_SCORE = 10;        // 獲勝分數
const STAR_COUNT = 3;
const TICK = 1000 / 30;

const players = {};          // socket.id -> player
let stars = [];
let winner = null;
let resetAt = 0;

const rid = () => Math.random().toString(36).slice(2, 9);
const spawnStar = () => ({ id: rid(), x: 20 + Math.random() * (W - 40), y: 20 + Math.random() * (H - 40) });

function resetRound() {
  stars = Array.from({ length: STAR_COUNT }, spawnStar);
  for (const p of Object.values(players)) p.score = 0;
  winner = null;
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
    players[socket.id] = {
      id: socket.id, name, sprite,
      x: Math.random() * (W - PW), y: Math.random() * (H - PH),
      score: 0, input: {}, facing: 1
    };
    socket.emit('joined', { id: socket.id, W, H, PW, PH, WIN_SCORE });
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

setInterval(() => {
  const now = Date.now();
  if (winner && now > resetAt) resetRound();

  for (const p of Object.values(players)) {
    if (winner) continue;
    let dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    let dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
    if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
    if (dx) p.facing = dx > 0 ? 1 : -1;
    p.x = Math.max(0, Math.min(W - PW, p.x + dx * SPEED));
    p.y = Math.max(0, Math.min(H - PH, p.y + dy * SPEED));

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      if (s.x > p.x - 10 && s.x < p.x + PW + 10 && s.y > p.y - 10 && s.y < p.y + PH + 10) {
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
    players: Object.values(players).map(p => ({ id: p.id, x: p.x, y: p.y, score: p.score, facing: p.facing })),
    stars, winner
  });
}, TICK);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`色塊人遊戲啟動：http://localhost:${PORT}`));

// 通用「可走動場景」：廣場、搶星星草原都用它。負責玩家移動、碰撞、入口偵測與廣播
const Move = require('../public/shared.js');

const MAX_QUEUE = 30;   // 每位玩家最多暫存的指令數
const MAX_CREDIT = 8;   // 允許短暫補送的步數（防加速外掛）
const rand = (a, b) => a + Math.random() * (b - a);

class World {
  constructor(io, opts) {
    this.io = io;
    this.id = opts.id;
    this.title = opts.title;
    this.W = opts.W; this.H = opts.H;
    this.theme = opts.theme;
    this.room = 'w:' + opts.id;
    this.opts = opts;
    this.players = new Map();
    this.obstacles = [];   // 會擋路的
    this.decor = [];       // 只是裝飾（例如拱門橫梁）
    this.portals = [];
    this.stars = [];
    this.winner = null;
    if (opts.init) opts.init(this);
  }

  cfg() {
    return { world: this.id, title: this.title, W: this.W, H: this.H, PW: 24, PH: 48, ...(this.opts.extraCfg || {}) };
  }
  mapPayload() {
    return { world: this.id, theme: this.theme, obstacles: this.obstacles.concat(this.decor), portals: this.portals };
  }
  sendMap(p) { (p ? p.socket : this.io.to(this.room)).emit('map', this.mapPayload()); }

  hits(x, y, pad) { return Move.hits(this.obstacles, x, y, pad); }
  freeSpot(pad = 6) {
    for (let i = 0; i < 500; i++) {
      const x = rand(30, this.W - 30), y = rand(30, this.H - 30);
      if (!this.hits(x, y, pad) && !this.inPortal(x, y)) return { x, y };
    }
    return { x: this.W / 2, y: this.H / 2 };
  }
  inPortal(x, y) {
    return this.portals.find(o => x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.d);
  }

  add(p, spawn) {
    const pos = spawn && !this.hits(spawn.x, spawn.y) ? spawn : this.freeSpot();
    Object.assign(p, { x: pos.x, y: pos.y, vx: 0, vy: 0, facing: (spawn && spawn.facing) || 1,
      queue: [], credit: 0, seq: 0, ack: 0, portalLock: Date.now() + 600 });
    p.socket.join(this.room);
    this.players.set(p.id, p);
    if (this.opts.onAdd) this.opts.onAdd(this, p);
  }
  remove(p) {
    p.socket.leave(this.room);
    this.players.delete(p.id);
  }

  // 客戶端送來的移動指令（epoch 不符代表是上一個場景的舊封包，直接丟掉）
  cmds(p, msg) {
    if (!msg || msg.e !== p.epoch || !Array.isArray(msg.c)) return;
    for (const c of msg.c.slice(0, 20)) {
      if (!Array.isArray(c)) continue;
      const seq = c[0], mask = c[1] & 15;
      if (!Number.isInteger(seq) || seq <= p.seq) continue;
      if (p.queue.length < MAX_QUEUE) p.queue.push([seq, mask]);
      p.seq = seq;
    }
  }

  tick(now, steps) {
    if (this.opts.tick) this.opts.tick(this, now);
    for (const p of Array.from(this.players.values())) {
      p.credit = Math.min(MAX_CREDIT, p.credit + steps);
      let left = false;
      while (p.queue.length && p.credit >= 1) {
        const [seq, mask] = p.queue.shift();
        p.credit -= 1;
        p.ack = seq;
        if (this.winner) continue;
        Move.step(p, mask, this.obstacles, this.W, this.H);
        if (this.opts.afterStep) this.opts.afterStep(this, p, now);
        const portal = now > p.portalLock && this.inPortal(p.x, p.y);
        if (portal && this.opts.onPortal) { this.opts.onPortal(p, portal); left = true; break; }
      }
      if (left) continue;
    }
  }

  broadcast(now) {
    if (!this.players.size) return;
    this.io.to(this.room).emit('state', {
      t: now,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy, facing: p.facing, ack: p.ack, score: p.score || 0
      })),
      stars: this.stars, winner: this.winner
    });
  }
}

module.exports = World;

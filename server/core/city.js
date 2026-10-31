// 城市：玩家移動（伺服器權威）、碰撞、建築入口感應（含緩衝）、城市聊天
const Move = require('../../public/js/shared/move.js');
const CITY = require('../../public/js/shared/citymap.js');
const { Bucket } = require('./ratelimit');
const { clean, mask } = require('./filter');

const MAX_QUEUE = 40;
const MAX_CREDIT = 8;        // 允許短暫補送的步數（防加速外掛）
const PORTAL_LOCK_MS = 900;  // 進出建築後的冷卻
const ARM_MARGIN = 14;       // 離開感應區這麼遠才「重新上膛」

const inRect = (r, x, y, m = 0) => x > r.x - m && x < r.x + r.w + m && y > r.y - m && y < r.y + r.d + m;

class City {
  constructor(io, hooks) {
    this.io = io;
    this.hooks = hooks;          // { onPortal(p, portal) }
    this.room = 'city';
    this.players = new Map();
    this.rosterDirty = false;
  }

  safeSpot(pos) {
    const ok = (x, y) => !Move.hits(CITY.solids, x, y, 2) && !CITY.portals.some(po => inRect(po, x, y, 4));
    if (pos && ok(pos.x, pos.y)) return { x: pos.x, y: pos.y };
    const base = pos || CITY.spawn;
    for (let r = 8; r < 400; r += 8) {
      for (let a = 0; a < 16; a++) {
        const x = base.x + Math.cos(a / 16 * Math.PI * 2) * r, y = base.y + Math.sin(a / 16 * Math.PI * 2) * r;
        if (x > 20 && y > 20 && x < CITY.W - 20 && y < CITY.H - 20 && ok(x, y)) return { x, y };
      }
    }
    return { x: CITY.spawn.x, y: CITY.spawn.y };
  }

  add(p, pos) {
    const s = this.safeSpot(pos);
    p.c = { x: s.x, y: s.y, vx: 0, vy: 0, queue: [], credit: 0, seq: 0, ack: 0,
      armed: !CITY.portals.some(po => inRect(po, s.x, s.y, ARM_MARGIN)), lockUntil: Date.now() + PORTAL_LOCK_MS };
    p.chatBucket = p.chatBucket || new Bucket(5, 0.8);
    p.socket.join(this.room);
    this.players.set(p.id, p);
    this.rosterDirty = true;
    return s;
  }
  remove(p) {
    if (!this.players.has(p.id)) return;
    if (p.socket) p.socket.leave(this.room);
    p.cityPos = { x: p.c.x, y: p.c.y };
    this.players.delete(p.id);
    this.rosterDirty = true;
  }

  // 移動指令：{ e: epoch, c: [[seq, qx, qy], ...] }
  cmds(p, msg) {
    if (!p.c || !msg || msg.e !== p.epoch || !Array.isArray(msg.c)) return;
    for (const c of msg.c.slice(0, 30)) {
      if (!Array.isArray(c) || c.length !== 3) continue;
      const [seq, qx, qy] = c;
      if (!Number.isInteger(seq) || seq <= p.c.seq || !Number.isFinite(qx) || !Number.isFinite(qy)) continue;
      if (p.c.queue.length < MAX_QUEUE) p.c.queue.push([seq, Math.max(-100, Math.min(100, qx)) / 100, Math.max(-100, Math.min(100, qy)) / 100]);
      p.c.seq = seq;
    }
  }

  chat(p, text) {
    if (!this.players.has(p.id)) return;
    const t = mask(clean(text, 60));
    if (!t) return;
    if (!p.chatBucket.take()) { p.socket.emit('notice', { text: '說話太快了，休息一下再說吧' }); return; }
    this.io.to(this.room).emit('city:chat', { id: p.id, text: t });
  }

  tick(now, steps) {
    for (const p of Array.from(this.players.values())) {
      const c = p.c;
      c.credit = Math.min(MAX_CREDIT, c.credit + steps);
      while (c.queue.length && c.credit >= 1) {
        const [seq, ix, iy] = c.queue.shift();
        c.credit -= 1;
        c.ack = seq;
        Move.step(c, ix, iy, CITY.solids, CITY.W, CITY.H);
        // 入口感應：要先離開感應區一段距離才會再次觸發，避免停在門口反覆切換
        let entered = null;
        for (const po of CITY.portals) {
          if (inRect(po, c.x, c.y)) { if (c.armed && now >= c.lockUntil) entered = po; }
          else if (!inRect(po, c.x, c.y, ARM_MARGIN)) c.armed = true;
        }
        if (entered) { c.armed = false; c.queue.length = 0; this.hooks.onPortal(p, entered); break; }
      }
    }
  }

  roster() {
    return [...this.players.values()].map(p => ({ id: p.id, profile: p.profile }));
  }
  broadcast(now) {
    if (this.rosterDirty) { this.rosterDirty = false; this.io.to(this.room).emit('city:roster', this.roster()); }
    if (!this.players.size) return;
    const r1 = v => Math.round(v * 10) / 10;
    this.io.to(this.room).emit('city:state', {
      t: now,
      p: [...this.players.values()].map(p => [p.id, r1(p.c.x), r1(p.c.y), r1(p.c.vx), r1(p.c.vy), p.c.ack]),
    });
  }
}

module.exports = City;

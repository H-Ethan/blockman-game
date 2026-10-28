// 你畫我猜：大廳、房間、出題、筆畫同步、猜題與計分
const { WORDS, isCorrect, isClose } = require('./words');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const SIZES = [3, 6, 12, 24];
const TIME_OPTS = [40, 60, 80, 100, 120];
const ROUND_OPTS = [1, 2, 3, 4, 5];
const MAX_SEATS = 8;
const INTRO_MS = 3000;     // 回合開始前顯示「輪到誰畫」
const REVEAL_MS = 6000;    // 公布答案停留時間
const BOARD_W = 800, BOARD_H = 600;

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

class DrawGuess {
  constructor(io, hooks) {
    this.io = io;
    this.hooks = hooks;       // { toPlaza(p) }
    this.rooms = new Map();
    setInterval(() => this.tick(), 200);
  }

  // ---------- 大廳 ----------
  enterLobby(p) {
    p.dgRoom = null;
    p.socket.emit('dg:lobby', { open: this.openPublic().length });
  }
  openPublic() {
    return [...this.rooms.values()].filter(r => !r.isPrivate && r.state === 'waiting' && r.members.length < r.settings.max);
  }
  newCode() {
    let c;
    do { c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); }
    while (this.rooms.has(c));
    return c;
  }
  roomOf(p) { return p.dgRoom ? this.rooms.get(p.dgRoom) : null; }
  err(p, text) { p.socket.emit('dg:error', text); }

  create(p, isPrivate) {
    if (p.zone !== 'dg' || p.dgRoom) return;
    const room = {
      code: this.newCode(), isPrivate: !!isPrivate, hostId: p.id,
      settings: { max: 6, time: 80, rounds: 3 },
      members: [], state: 'waiting', strokes: [], pointCount: 0,
      round: 0, turnIdx: 0, order: [], used: new Set(),
      drawerId: null, word: null, guessed: new Map(), gains: {}, endsAt: 0, startedAt: 0,
      hintCat: false, hintIdx: -1, ranking: null,
    };
    this.rooms.set(room.code, room);
    this.join(p, room);
  }

  random(p) {
    if (p.zone !== 'dg' || p.dgRoom) return;
    const list = this.openPublic().sort((a, b) => b.members.length - a.members.length);
    if (!list.length) { p.socket.emit('dg:none'); return; }
    this.join(p, list[0]);
  }

  joinCode(p, code) {
    if (p.zone !== 'dg' || p.dgRoom) return;
    const room = this.rooms.get(String(code || '').trim().toUpperCase());
    if (!room) return this.err(p, '找不到這個房間代碼，請再確認一次');
    if (room.state !== 'waiting') return this.err(p, '這個房間的遊戲已經開始了，請稍後再試');
    if (room.members.length >= room.settings.max) return this.err(p, '房間已經滿了');
    this.join(p, room);
  }

  join(p, room) {
    const taken = new Set(room.members.map(m => m.seat));
    let seat = 0; while (taken.has(seat)) seat++;
    room.members.push({ id: p.id, p, name: p.name, ready: false, score: 0, seat });
    p.dgRoom = room.code;
    p.socket.join('dg:' + room.code);
    p.socket.emit('dg:strokes', room.strokes);
    this.sys(room, `${p.name} 走進了畫室`);
    this.send(room);
  }

  leave(p, silent) {
    const room = this.roomOf(p);
    p.dgRoom = null;
    if (!room) return;
    p.socket.leave('dg:' + room.code);
    const idx = room.members.findIndex(m => m.id === p.id);
    if (idx < 0) return;
    room.members.splice(idx, 1);
    if (!room.members.length) { this.rooms.delete(room.code); return; }

    this.sys(room, `${p.name} 離開了畫室`);
    if (room.hostId === p.id) {
      room.hostId = room.members[0].id;
      room.members[0].ready = false;
      this.sys(room, `${room.members[0].name} 成為新的房主`);
    }
    // 遊戲進行中有人離開
    const oi = room.order.indexOf(p.id);
    if (oi >= 0 && room.state !== 'waiting' && room.state !== 'ended') {
      room.order.splice(oi, 1);
      if (oi < room.turnIdx) room.turnIdx--;
      if (room.members.length < 2) {
        this.sys(room, '人數不足，這局遊戲結束');
        this.backToWaiting(room);
      } else if (room.drawerId === p.id && (room.state === 'intro' || room.state === 'drawing')) {
        room.turnIdx--; // 畫圖者已從順序移除，抵銷 advance 的 +1
        this.endTurn(room, '畫圖的玩家離開了');
      } else if (room.state === 'drawing') {
        this.checkAllGuessed(room);
      }
    }
    if (room.settings.max < room.members.length) room.settings.max = room.members.length;
    this.send(room);
    if (!silent) this.enterLobby(p);
  }

  // ---------- 房間設定與準備 ----------
  settings(p, s) {
    const room = this.roomOf(p);
    if (!room || room.hostId !== p.id || room.state !== 'waiting' || !s) return;
    const max = Math.round(+s.max);
    if (max >= Math.max(2, room.members.length) && max <= MAX_SEATS) room.settings.max = max;
    if (TIME_OPTS.includes(+s.time)) room.settings.time = +s.time;
    if (ROUND_OPTS.includes(+s.rounds)) room.settings.rounds = +s.rounds;
    this.send(room);
  }
  ready(p, v) {
    const room = this.roomOf(p);
    if (!room || room.state !== 'waiting' || room.hostId === p.id) return;
    const m = room.members.find(m => m.id === p.id);
    if (m) { m.ready = !!v; this.send(room); }
  }
  start(p) {
    const room = this.roomOf(p);
    if (!room || room.hostId !== p.id || room.state !== 'waiting') return;
    if (room.members.length < 2) return this.err(p, '至少需要 2 位玩家才能開始');
    if (room.members.some(m => m.id !== room.hostId && !m.ready)) return this.err(p, '還有玩家沒有準備');
    room.order = shuffle(room.members.map(m => m.id));
    room.round = 1; room.turnIdx = 0; room.used = new Set(); room.ranking = null;
    for (const m of room.members) m.score = 0;
    this.sys(room, `遊戲開始！共 ${room.settings.rounds} 輪，每人每輪畫一次`);
    this.beginTurn(room);
  }
  again(p) {
    const room = this.roomOf(p);
    if (!room || room.state !== 'ended') return;
    this.backToWaiting(room);
    this.send(room);
  }
  backToWaiting(room) {
    Object.assign(room, { state: 'waiting', drawerId: null, word: null, endsAt: 0, order: [], gains: {}, guessed: new Map() });
    for (const m of room.members) { m.ready = false; m.score = 0; }
    this.clearBoard(room);
  }

  // ---------- 回合流程 ----------
  pickWord(room) {
    let pool = WORDS.filter(w => !room.used.has(w.word));
    if (!pool.length) { room.used.clear(); pool = WORDS; }
    const w = pool[Math.floor(Math.random() * pool.length)];
    room.used.add(w.word);
    return w;
  }
  clearBoard(room) {
    room.strokes = []; room.pointCount = 0;
    this.io.to('dg:' + room.code).emit('dg:strokes', []);
  }
  beginTurn(room) {
    room.drawerId = room.order[room.turnIdx];
    room.word = this.pickWord(room);
    room.guessed = new Map(); room.gains = {};
    room.hintCat = false; room.hintIdx = -1;
    room.state = 'intro';
    room.endsAt = Date.now() + INTRO_MS;
    this.clearBoard(room);
    const drawer = room.members.find(m => m.id === room.drawerId);
    this.sys(room, `第 ${room.round} 輪：輪到 ${drawer ? drawer.name : '?'} 畫圖`);
    this.send(room);
  }
  startDrawing(room) {
    room.state = 'drawing';
    room.startedAt = Date.now();
    room.endsAt = room.startedAt + room.settings.time * 1000;
    this.send(room);
  }
  endTurn(room, reason) {
    if (room.state !== 'drawing' && room.state !== 'intro') return;
    const n = room.guessed.size, guessers = room.members.filter(m => m.id !== room.drawerId).length;
    const drawer = room.members.find(m => m.id === room.drawerId);
    if (drawer && n > 0) {
      const g = n * 25 + (n === guessers ? 20 : 0);   // 畫得像：每有一人答對 +25，全員答對再 +20
      drawer.score += g; room.gains[drawer.id] = g;
    }
    room.state = 'reveal';
    room.endsAt = Date.now() + REVEAL_MS;
    this.sys(room, `${reason} 答案是「${room.word.word}」`);
    this.send(room);
  }
  advance(room) {
    room.turnIdx++;
    if (room.turnIdx >= room.order.length) { room.turnIdx = 0; room.round++; }
    if (room.round > room.settings.rounds) return this.endGame(room);
    this.beginTurn(room);
  }
  endGame(room) {
    room.state = 'ended';
    room.drawerId = null; room.endsAt = 0; room.guessed = new Map(); room.gains = {};
    room.ranking = room.members.slice().sort((a, b) => b.score - a.score).map(m => ({ id: m.id, name: m.name, score: m.score }));
    const top = room.ranking[0];
    this.sys(room, `遊戲結束！冠軍是 ${top.name}（${top.score} 分）`);
    this.send(room);
  }
  checkAllGuessed(room) {
    const guessers = room.members.filter(m => m.id !== room.drawerId);
    if (guessers.length && guessers.every(m => room.guessed.has(m.id))) this.endTurn(room, '全員答對！');
  }

  tick() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.state === 'intro' && now >= room.endsAt) this.startDrawing(room);
      else if (room.state === 'drawing') {
        const f = (now - room.startedAt) / (room.settings.time * 1000);
        if (f >= 0.4 && !room.hintCat) { room.hintCat = true; this.sys(room, `提示：這是「${room.word.category}」`); this.send(room); }
        if (f >= 0.7 && room.hintIdx < 0 && room.word.word.length >= 3) {
          room.hintIdx = Math.floor(Math.random() * room.word.word.length);
          this.sys(room, '提示：揭曉一個字！'); this.send(room);
        }
        if (now >= room.endsAt) this.endTurn(room, '時間到！');
      } else if (room.state === 'reveal' && now >= room.endsAt) this.advance(room);
    }
  }

  // ---------- 畫圖 ----------
  op(p, o) {
    const room = this.roomOf(p);
    if (!room || room.state !== 'drawing' || room.drawerId !== p.id || !o) return;
    let out = null;
    if (o.t === 'b') {
      if (!COLOR_RE.test(o.c) || !SIZES.includes(o.s) || room.strokes.length >= 1500) return;
      const st = { c: o.c, s: o.s, e: !!o.e, p: [] };
      room.strokes.push(st);
      out = { t: 'b', c: st.c, s: st.s, e: st.e };
    } else if (o.t === 'p') {
      const last = room.strokes[room.strokes.length - 1];
      if (!last || !Array.isArray(o.p) || o.p.length % 2 || o.p.length > 400 || room.pointCount > 150000) return;
      const pts = [];
      for (let i = 0; i < o.p.length; i += 2) {
        const x = Math.round(+o.p[i]), y = Math.round(+o.p[i + 1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        pts.push(Math.max(0, Math.min(BOARD_W, x)), Math.max(0, Math.min(BOARD_H, y)));
      }
      last.p.push(...pts); room.pointCount += pts.length / 2;
      out = { t: 'p', p: pts };
    } else if (o.t === 'u') {
      const st = room.strokes.pop(); if (st) room.pointCount -= st.p.length / 2;
      out = { t: 'u' };
    } else if (o.t === 'c') {
      room.strokes = []; room.pointCount = 0;
      out = { t: 'c' };
    }
    if (out) p.socket.to('dg:' + room.code).emit('dg:op', out);
  }

  // ---------- 猜題 / 聊天 ----------
  guess(p, text) {
    const room = this.roomOf(p);
    if (!room || typeof text !== 'string') return;
    const t = text.trim().slice(0, 40);
    if (!t) return;
    const m = room.members.find(m => m.id === p.id);
    if (!m) return;
    const to = 'dg:' + room.code;
    const active = room.state === 'drawing' || room.state === 'intro';

    if (active && p.id === room.drawerId) return this.err(p, '畫圖的人不能洩漏答案喔！');
    if (active && room.guessed.has(p.id)) {
      // 已答對的人說話只給畫圖者和其他已答對的人看，避免洩題
      for (const mm of room.members) {
        if (mm.id === room.drawerId || room.guessed.has(mm.id)) mm.p.socket.emit('dg:chat', { kind: 'private', name: p.name, text: t });
      }
      return;
    }
    if (room.state === 'drawing') {
      if (isCorrect(t, room.word)) {
        const total = room.settings.time * 1000, remain = Math.max(0, room.endsAt - Date.now());
        const bonus = [20, 10, 5][room.guessed.size] || 0;
        const pts = Math.round(50 + 50 * remain / total) + bonus;
        room.guessed.set(p.id, pts); room.gains[p.id] = pts; m.score += pts;
        this.io.to(to).emit('dg:chat', { kind: 'correct', name: p.name, text: `${p.name} 答對了！ +${pts}` });
        this.send(room);
        this.checkAllGuessed(room);
        return;
      }
      if (isClose(t, room.word)) p.socket.emit('dg:chat', { kind: 'close', name: '', text: `「${t}」很接近了！` });
    }
    this.io.to(to).emit('dg:chat', { kind: 'guess', name: p.name, text: t });
  }
  sys(room, text) { this.io.to('dg:' + room.code).emit('dg:chat', { kind: 'system', name: '', text }); }

  // ---------- 狀態同步（每個人看到的內容不同：題目只給畫圖者） ----------
  view(room, viewerId) {
    const now = Date.now(), w = room.word;
    const knows = viewerId === room.drawerId || room.guessed.has(viewerId) || room.state === 'reveal';
    const total = room.state === 'drawing' ? room.settings.time * 1000 : room.state === 'intro' ? INTRO_MS : room.state === 'reveal' ? REVEAL_MS : 0;
    return {
      code: room.code, isPrivate: room.isPrivate, hostId: room.hostId, settings: room.settings, state: room.state,
      round: room.round, rounds: room.settings.rounds, turn: room.turnIdx + 1, turns: room.order.length,
      drawerId: room.drawerId, remain: room.endsAt ? Math.max(0, room.endsAt - now) : 0, total,
      word: w && knows ? w.word : null,
      hint: w ? [...w.word].map((ch, i) => (i === room.hintIdx ? ch : '＿')).join(' ') : '',
      len: w ? w.word.length : 0,
      category: w && (room.hintCat || knows) ? w.category : null,
      members: room.members.map(m => ({ id: m.id, name: m.name, ready: m.ready, score: m.score, seat: m.seat,
        guessed: room.guessed.has(m.id), gain: room.gains[m.id] || 0 })),
      ranking: room.ranking,
      opts: { time: TIME_OPTS, rounds: ROUND_OPTS, maxSeats: MAX_SEATS },
    };
  }
  send(room) {
    for (const m of room.members) m.p.socket.emit('dg:room', this.view(room, m.id));
  }
}

module.exports = DrawGuess;

// 通用房間系統：建立／列表／隨機配對／代碼＋密碼加入、座位、準備、房主移交、斷線保留、聊天紀錄
// 個別桌遊（Game 類別）只負責自己的規則；之後的你畫我猜等建築可以沿用這一套
const crypto = require('crypto');
const { Bucket } = require('./ratelimit');
const { clean, mask, hasBad } = require('./filter');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_LOGS = 400;

const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32);

class RoomManager {
  constructor(io, opts) {
    this.io = io;
    this.Game = opts.Game;
    this.kind = opts.kind;            // 'undercover'
    this.hooks = opts.hooks;          // { enterRoom(p), leaveRoom(p) }
    this.rooms = new Map();
    this.lobbyWatchers = new Set();   // 在大廳看列表的玩家
    this.listDirty = false;
  }

  // ---------- 大廳 ----------
  watch(p, on) { if (on) this.lobbyWatchers.add(p); else this.lobbyWatchers.delete(p); }
  publicList() {
    return [...this.rooms.values()].filter(r => !r.isPrivate).map(r => this.summary(r))
      .sort((a, b) => (a.state === 'waiting' ? 0 : 1) - (b.state === 'waiting' ? 0 : 1) || b.count - a.count);
  }
  summary(r) {
    const host = r.members.find(m => m.id === r.hostId);
    return { code: r.code, name: r.name, count: r.members.length, max: r.settings.max,
      host: host ? host.p.profile.name : '', state: r.state === 'waiting' ? 'waiting' : 'playing' };
  }
  sendList(p) { p.socket.emit('lobby:list', this.publicList()); }

  newCode() {
    let c;
    do { c = Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(''); } while (this.rooms.has(c));
    return c;
  }
  err(p, code, text) { p.socket.emit('room:error', { code, text }); return false; }

  create(p, raw) {
    if (p.roomCode) return this.err(p, 'IN_ROOM', '你已經在房間裡了');
    raw = raw || {};
    let name = clean(raw.name, 16) || `${p.profile.name}的房間`;
    if (hasBad(name)) return this.err(p, 'BAD_NAME', '房間名稱含有不適當的內容');
    const isPrivate = raw.privacy === 'password';
    let salt = null, pw = null;
    if (isPrivate) {
      const pass = String(raw.password || '');
      if (!/^[A-Za-z0-9]{4,12}$/.test(pass)) return this.err(p, 'BAD_PASSWORD', '密碼請用 4～12 個英文字母或數字');
      salt = crypto.randomBytes(16); pw = hashPw(pass, salt);
    }
    const room = {
      code: this.newCode(), name, isPrivate, salt, pw,
      settings: this.Game.validateSettings(raw.settings, null),
      hostId: p.id, members: [], state: 'waiting', game: null,
      logs: [], logSeq: 0, memory: {}, createdAt: Date.now(), viewsDirty: false,
    };
    this.rooms.set(room.code, room);
    this.addMember(room, p);
    return true;
  }

  join(p, rawCode, password) {
    if (p.roomCode) return this.err(p, 'IN_ROOM', '你已經在房間裡了');
    const code = String(rawCode || '').trim().toUpperCase();
    const r = this.rooms.get(code);
    if (!r) return this.err(p, 'NOT_FOUND', '找不到這個房間代碼，請再確認一次');
    if (r.state !== 'waiting') return this.err(p, 'STARTED', '這個房間的遊戲已經開始，第一版不開放中途加入');
    if (r.members.length >= r.settings.max) return this.err(p, 'FULL', '房間已滿');
    if (r.isPrivate) {
      if (password == null || password === '') { p.socket.emit('room:needPassword', { code: r.code, name: r.name }); return false; }
      p.pwBucket = p.pwBucket || new Bucket(5, 1 / 12);
      if (!p.pwBucket.take()) return this.err(p, 'TOO_MANY', '密碼嘗試太多次，請稍後再試');
      const got = hashPw(String(password).slice(0, 32), r.salt);
      if (!crypto.timingSafeEqual(got, r.pw)) return this.err(p, 'WRONG_PASSWORD', '密碼錯誤');
    }
    this.addMember(r, p);
    return true;
  }

  random(p) {
    if (p.roomCode) return this.err(p, 'IN_ROOM', '你已經在房間裡了');
    const list = [...this.rooms.values()]
      .filter(r => !r.isPrivate && r.state === 'waiting' && r.members.length < r.settings.max)
      .sort((a, b) => b.members.length - a.members.length || a.createdAt - b.createdAt);
    if (!list.length) return this.err(p, 'NO_ROOM', '目前沒有可加入的公開房間，建立一間吧！');
    this.addMember(list[0], p);
    return true;
  }

  // ---------- 成員 ----------
  addMember(r, p) {
    const taken = new Set(r.members.map(m => m.seat));
    let seat = 0; while (taken.has(seat)) seat++;
    r.members.push({ id: p.id, p, seat, ready: false, online: !!p.online });
    p.roomCode = r.code;
    p.socket.join('room:' + r.code);
    this.hooks.enterRoom(p);
    this.sys(r, `${p.profile.name} 加入了房間`);
    this.sendHistory(r, p);
    this.dirty(r);
  }

  // reason: 'leave'（自己離開）、'timeout'（斷線超過保留時間）
  removeMember(p, reason) {
    const r = this.rooms.get(p.roomCode);
    p.roomCode = null;
    if (!r) return;
    if (p.socket) p.socket.leave('room:' + r.code);
    const idx = r.members.findIndex(m => m.id === p.id);
    if (idx < 0) return;
    r.members.splice(idx, 1);
    this.sys(r, reason === 'timeout' ? `${p.profile.name} 斷線超過 60 秒，已離開房間` : `${p.profile.name} 離開了房間`);
    if (r.game && r.state === 'playing') r.game.onGone(p.id);
    if (!r.members.length) { this.rooms.delete(r.code); this.listDirty = true; return; }
    if (r.hostId === p.id) this.transferHost(r);
    this.dirty(r);
  }

  transferHost(r) {
    const next = r.members.find(m => m.online) || r.members[0];
    if (!next || next.id === r.hostId) return;
    r.hostId = next.id;
    next.ready = false;
    this.sys(r, `${next.p.profile.name} 成為新的房主`);
  }

  onDisconnect(p) {
    const r = this.rooms.get(p.roomCode); if (!r) return;
    const m = r.members.find(m => m.id === p.id); if (!m) return;
    m.online = false;
    this.sys(r, `${p.profile.name} 連線中斷（保留席位 60 秒）`);
    if (r.hostId === p.id && r.members.some(x => x.online)) this.transferHost(r);
    this.dirty(r);
  }
  onReconnect(p) {
    const r = this.rooms.get(p.roomCode); if (!r) return false;
    const m = r.members.find(m => m.id === p.id); if (!m) return false;
    m.online = true; m.p = p;
    p.socket.join('room:' + r.code);
    this.sys(r, `${p.profile.name} 重新連線`);
    this.sendHistory(r, p);
    this.dirty(r);
    return true;
  }

  // ---------- 準備與設定 ----------
  roomOf(p) { return p.roomCode ? this.rooms.get(p.roomCode) : null; }
  memberOf(r, p) { return r && r.members.find(m => m.id === p.id); }

  ready(p, v) {
    const r = this.roomOf(p), m = this.memberOf(r, p);
    if (!m || r.state !== 'waiting' || r.hostId === p.id) return;
    if (m.ready !== !!v) { m.ready = !!v; this.dirty(r); }
  }
  settings(p, raw) {
    const r = this.roomOf(p);
    if (!r || r.hostId !== p.id || r.state !== 'waiting' || !raw) return;
    const s = this.Game.validateSettings(raw.settings, r.settings);
    if (s.max < r.members.length) return this.err(p, 'MAX_TOO_SMALL', `目前已有 ${r.members.length} 人，人數上限不能低於人數`);
    if (raw.name != null) {
      const name = clean(raw.name, 16);
      if (name && !hasBad(name)) r.name = name;
    }
    r.settings = s;
    // 座位號碼超過新上限時往前補
    const taken = new Set();
    for (const m of r.members.slice().sort((a, b) => a.seat - b.seat)) {
      if (m.seat >= s.max || taken.has(m.seat)) { let k = 0; while (taken.has(k)) k++; m.seat = k; }
      taken.add(m.seat);
    }
    this.sys(r, '房主更新了房間設定');
    this.dirty(r);
  }
  start(p) {
    const r = this.roomOf(p);
    if (!r || r.state !== 'waiting') return;                       // 重複按「開始」不會重複處理
    if (r.hostId !== p.id) return this.err(p, 'NOT_HOST', '只有房主可以開始遊戲');
    if (r.members.length < this.Game.MIN_PLAYERS) return this.err(p, 'NOT_ENOUGH', `至少需要 ${this.Game.MIN_PLAYERS} 位玩家`);
    if (r.members.some(m => m.id !== r.hostId && !m.ready)) return this.err(p, 'NOT_READY', '還有玩家沒有準備');
    r.state = 'playing';
    r.logs = [];
    this.io.to('room:' + r.code).emit('room:logReset');
    const players = r.members.slice().sort((a, b) => a.seat - b.seat)
      .map(m => ({ id: m.id, name: m.p.profile.name, profile: m.p.profile, seat: m.seat }));
    r.game = new this.Game(this.api(r), players, r.settings, r.memory);
    r.game.start();
    this.dirty(r);
  }
  again(p) {
    const r = this.roomOf(p);
    if (!r || r.state !== 'ended' || !this.memberOf(r, p)) return;
    r.state = 'waiting';
    r.game = null;
    for (const m of r.members) m.ready = false;
    this.sys(r, `${p.profile.name} 開啟了新的一局，請重新準備`);
    this.dirty(r);
  }

  // ---------- 聊天與遊戲操作 ----------
  chat(p, text) {
    const r = this.roomOf(p); if (!r || !this.memberOf(r, p)) return;
    const t = mask(clean(text, 60));
    if (!t) return;
    p.roomChat = p.roomChat || new Bucket(5, 0.8);
    let channel = 'all';
    if (r.state === 'playing' && r.game) {
      const ch = r.game.chatChannel(p.id);
      if (ch.error) return this.err(p, 'NO_CHAT', ch.error);
      channel = ch.channel;
      const bad = r.game.chatCheck && r.game.chatCheck(p.id, t);
      if (bad) return this.err(p, 'NO_CHAT', bad);
    }
    if (!p.roomChat.take()) return this.err(p, 'RATE', '說話太快了，休息一下再說吧');
    this.log(r, { kind: channel === 'ghost' ? 'ghost' : 'chat', channel, pid: p.id, name: p.profile.name, text: t });
  }
  action(p, type, data) {
    const r = this.roomOf(p);
    if (!r || r.state !== 'playing' || !r.game) return;
    const res = r.game.action(p.id, type, data);
    if (res && res.error) this.err(p, 'GAME', res.error);
  }

  // ---------- 紀錄 ----------
  canSee(r, id, e) {
    if (e.channel === 'all') return true;
    if (e.channel === 'ghost') return !!(r.game && r.game.isGhost(id));
    if (e.channel === 'self:' + id) return true;
    return false;
  }
  log(r, e) {
    e.seq = ++r.logSeq; e.t = Date.now();
    r.logs.push(e);
    if (r.logs.length > MAX_LOGS) r.logs.shift();
    for (const m of r.members) if (m.online && this.canSee(r, m.id, e)) m.p.socket.emit('room:log', e);
  }
  sys(r, text, extra) { this.log(r, { kind: 'sys', channel: 'all', text, ...(extra || {}) }); }
  sendHistory(r, p) { p.socket.emit('room:logs', r.logs.filter(e => this.canSee(r, p.id, e))); }

  // 提供給個別遊戲的介面
  api(r) {
    const self = this;
    return {
      log: e => self.log(r, e),
      sys: (text, extra) => self.sys(r, text, extra),
      update: () => self.dirty(r),
      isOnline: id => { const m = r.members.find(m => m.id === id); return !!(m && m.online); },
      end: () => { r.state = 'ended'; self.dirty(r); },
    };
  }

  // ---------- 狀態同步 ----------
  dirty(r) { r.viewsDirty = true; this.listDirty = true; }
  publicView(r) {
    return {
      code: r.code, name: r.name, isPrivate: r.isPrivate, hostId: r.hostId, state: r.state, settings: r.settings,
      members: r.members.map(m => ({ id: m.id, name: m.p.profile.name, profile: m.p.profile, seat: m.seat, ready: m.ready, online: m.online })),
    };
  }
  flush() {
    const now = Date.now();
    for (const r of this.rooms.values()) {
      if (!r.viewsDirty) continue;
      r.viewsDirty = false;
      const pub = this.publicView(r);
      for (const m of r.members) {
        if (!m.online) continue;
        m.p.socket.emit('room:view', { room: pub, game: r.game ? r.game.viewFor(m.id) : null, now });
      }
    }
    if (this.listDirty) {
      this.listDirty = false;
      const list = this.publicList();
      for (const p of this.lobbyWatchers) if (p.online) p.socket.emit('lobby:list', list);
    }
  }
  tick(now) {
    for (const r of this.rooms.values()) if (r.state === 'playing' && r.game) r.game.tick(now);
    this.flush();
  }
}

module.exports = RoomManager;

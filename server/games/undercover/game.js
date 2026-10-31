// 誰是臥底：身分、階段、計時、投票、PK、淘汰、白板猜詞、勝負（全部由伺服器判定）
const R = require('../../../public/js/shared/uc-rules.js');
const { PAIRS } = require('./words');
const { clean, mask, norm } = require('../../core/filter');

const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// 測試用：UC_TIME_SCALE=0.05 會把所有計時縮短成 5%（正式環境不要設定）
const SCALE = +process.env.UC_TIME_SCALE || 1;
const VOTE_PHASES = ['vote', 'pk_vote'];
const DESC_PHASES = ['describe', 'pk_desc'];

class Undercover {
  static validateSettings(raw, cur) {
    const s = { ...(cur || R.DEFAULTS) };
    if (!raw || typeof raw !== 'object') return s;
    const n = Math.round(+raw.max);
    if (n >= R.MIN_PLAYERS && n <= R.MAX_PLAYERS) s.max = n;
    if ('blank' in raw) s.blank = !!raw.blank;
    if (R.TIMES.desc.includes(+raw.descTime)) s.descTime = +raw.descTime;
    if (R.TIMES.discuss.includes(+raw.discussTime)) s.discussTime = +raw.discussTime;
    if (R.TIMES.vote.includes(+raw.voteTime)) s.voteTime = +raw.voteTime;
    if (R.CATEGORIES.includes(raw.category)) s.category = raw.category;
    if (R.DIFFICULTIES.includes(raw.difficulty)) s.difficulty = raw.difficulty;
    return s;
  }
  static poolSize(s) { return Undercover.pool(s).length; }
  static pool(s) {
    return PAIRS.filter(p => (s.category === '全部' || p.category === s.category) && (s.difficulty === '全部' || p.difficulty === s.difficulty));
  }

  constructor(api, players, settings, memory) {
    this.api = api;
    this.s = { ...settings };
    this.memory = memory;
    memory.used = memory.used || new Set();
    this.players = players.map(p => ({ ...p, role: null, word: null, alive: true, gone: false, confirmed: false, elim: null }));
    this.byId = new Map(this.players.map(p => [p.id, p]));
    this.phase = null; this.round = 0; this.deadline = 0; this.total = 0;
    this.order = []; this.turn = -1; this.turnDone = false; this.lastStartSeat = -1;
    this.votes = new Map(); this.candidates = []; this.pk = null;
    this.reveal = null; this.guesser = null; this.guessDone = false;
    this.history = []; this.elimOrder = []; this.result = null;
  }

  // ---------- 小工具 ----------
  name(id) { const p = this.byId.get(id); return p ? p.name : '?'; }
  alive() { return this.players.filter(p => p.alive); }
  bySeat(ids) { return ids.slice().sort((a, b) => this.byId.get(a).seat - this.byId.get(b).seat); }
  cur() { return this.history[this.history.length - 1]; }
  setTimer(sec) { this.total = sec * 1000 * SCALE; this.deadline = Date.now() + this.total; }
  roleName(r) { return R.ROLE_NAMES[r]; }

  pickPair() {
    let pool = Undercover.pool(this.s);
    if (!pool.length) pool = PAIRS;
    let fresh = pool.filter(p => !this.memory.used.has(p.id));
    if (!fresh.length) { pool.forEach(p => this.memory.used.delete(p.id)); fresh = pool; }   // 題庫用完才重複
    const pair = fresh[Math.floor(Math.random() * fresh.length)];
    this.memory.used.add(pair.id);
    return pair;
  }

  // ---------- 開始 ----------
  start() {
    const n = this.players.length;
    const roles = R.roles(n, this.s.blank);
    if (this.s.blank && !roles.blank) this.api.sys('4 人局不開放白板，本局不加入白板');
    this.counts = roles;
    this.pair = this.pickPair();
    const bag = shuffle([...Array(roles.civ).fill('civ'), ...Array(roles.spy).fill('spy'), ...Array(roles.blank).fill('blank')]);
    this.players.forEach((p, i) => {
      p.role = bag[i];
      p.word = p.role === 'civ' ? this.pair.civ : p.role === 'spy' ? this.pair.spy : null;
    });
    this.api.sys(`遊戲開始！共 ${n} 人：平民 ${roles.civ}、臥底 ${roles.spy}${roles.blank ? `、白板 ${roles.blank}` : ''}（誰是誰不公開）`);
    this.api.sys('請查看自己的詞語，記住後按「我記住了」');
    this.phase = 'word';
    this.setTimer(R.WORD_CONFIRM_SEC);
    this.api.update();
  }

  // ---------- 一輪 ----------
  beginRound(r) {
    this.round = r;
    const alive = this.alive().sort((a, b) => a.seat - b.seat);
    let idx;
    if (r === 1) {
      const cands = alive.filter(p => p.role !== 'blank');          // 白板首輪不安排第一位發言
      idx = alive.indexOf(cands[Math.floor(Math.random() * cands.length)]);
    } else {
      idx = alive.findIndex(p => p.seat > this.lastStartSeat);       // 起始座位往後輪替，跳過淘汰者
      if (idx < 0) idx = 0;
    }
    this.lastStartSeat = alive[idx].seat;
    this.order = [...alive.slice(idx), ...alive.slice(0, idx)].map(p => p.id);
    this.history.push({ round: r, descs: [], votes: null, pk: null, elim: null, note: null });
    this.api.sys(`第 ${r} 輪開始，由 ${this.name(this.order[0])} 先描述`, { round: r });
    this.phase = 'describe';
    this.turn = -1;
    this.nextTurn();
  }

  nextTurn() {
    this.turn++;
    while (this.turn < this.order.length && !this.byId.get(this.order[this.turn]).alive) this.turn++;
    if (this.turn >= this.order.length) {
      if (this.phase === 'pk_desc') return this.startVote(true);
      return this.startDiscuss();
    }
    this.turnDone = false;
    this.setTimer(this.s.descTime);
    this.api.update();
  }

  speaker() { return DESC_PHASES.includes(this.phase) ? this.order[this.turn] : null; }

  recordDesc(id, text) {
    const pk = this.phase === 'pk_desc', h = this.cur();
    (pk ? h.pk.descs : h.descs).push({ pid: id, text });
    if (text) this.api.log({ kind: 'desc', channel: 'all', pid: id, name: this.name(id), text, round: this.round, pk });
    else this.api.log({ kind: 'sys', channel: 'all', pid: id, text: `${this.name(id)} 本輪未描述`, round: this.round, missed: true });
  }

  describe(id, raw) {
    if (!DESC_PHASES.includes(this.phase)) return { error: '現在不是描述時間' };
    if (this.speaker() !== id || this.turnDone) return { error: '還沒輪到你描述' };
    const text = mask(clean(raw, 40));
    if (!text) return { error: '請輸入描述' };
    const p = this.byId.get(id);
    if (p.word && norm(text).includes(norm(p.word))) return { error: '描述不能直接包含你的詞語，請換個說法' };
    this.turnDone = true;
    this.recordDesc(id, text);
    this.nextTurn();
    return null;
  }

  startDiscuss() {
    this.phase = 'discuss';
    this.skips = new Set();
    this.setTimer(this.s.discussTime);
    this.api.sys(`所有人描述完畢，自由討論 ${this.s.discussTime} 秒`);
    this.api.update();
  }

  startVote(pk) {
    this.phase = pk ? 'pk_vote' : 'vote';
    this.votes = new Map();
    this.candidates = pk ? this.pk.candidates.filter(id => this.byId.get(id).alive) : this.alive().map(p => p.id);
    this.setTimer(this.s.voteTime);
    this.api.sys(pk ? `PK 投票開始：只能投給 ${this.candidates.map(id => this.name(id)).join('、')}` : `投票開始，${this.s.voteTime} 秒內選出你懷疑的人`);
    this.api.update();
  }

  vote(id, target) {
    if (!VOTE_PHASES.includes(this.phase)) return { error: '現在不是投票時間' };
    const p = this.byId.get(id);
    if (!p || !p.alive) return { error: '只有存活玩家可以投票' };
    if (target === null || target === undefined) this.votes.set(id, null);           // 棄權
    else {
      if (target === id) return { error: '不能投給自己' };
      const t = this.byId.get(target);
      if (!t || !t.alive || !this.candidates.includes(target)) return { error: this.phase === 'pk_vote' ? '只能投給平票的玩家' : '只能投給存活的玩家' };
      this.votes.set(id, target);                                                   // 截止前可改票，以最後一次為準
    }
    this.api.update();
    if (this.alive().every(x => this.votes.has(x.id))) this.resolveVote();          // 全員投完提前結算
    return null;
  }

  resolveVote() {
    const pk = this.phase === 'pk_vote', h = this.cur();
    const tally = new Map(this.candidates.map(c => [c, 0]));
    const detail = [];
    for (const p of this.alive().sort((a, b) => a.seat - b.seat)) {
      const t = this.votes.has(p.id) ? this.votes.get(p.id) : null;
      detail.push([p.id, t]);
      if (t && tally.has(t)) tally.set(t, tally.get(t) + 1);
    }
    const rec = { detail, tally: [...tally].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]) };
    if (pk) h.pk.votes = rec; else h.votes = rec;
    const abstain = detail.filter(([, t]) => t === null).length;
    this.api.log({
      kind: 'vote', channel: 'all', round: this.round, pk,
      text: `${pk ? 'PK ' : ''}投票結果：${rec.tally.map(([id, n]) => `${this.name(id)} ${n} 票`).join('、') || '無人得票'}${abstain ? `，棄權 ${abstain} 人` : ''}`,
      detail: detail.map(([v, t]) => [this.name(v), t ? this.name(t) : null]),
    });
    this.votes = new Map();
    const max = rec.tally.length ? rec.tally[0][1] : 0;
    if (max === 0) return this.noElimination(pk ? 'PK 全員棄權，本輪無人淘汰' : '全員棄權，本輪無人淘汰');
    const top = rec.tally.filter(([, n]) => n === max).map(([id]) => id);
    if (top.length === 1) return this.eliminate(top[0], 'vote');
    if (pk) return this.noElimination('PK 再次平票，本輪無人淘汰');               // 不會無限 PK
    this.pk = { candidates: this.bySeat(top), descs: [], votes: null };
    h.pk = this.pk;
    this.api.sys(`平票！${this.pk.candidates.map(id => this.name(id)).join('、')} 進入 PK，各補充一句描述`);
    this.phase = 'pk_desc';
    this.order = this.pk.candidates.slice();
    this.turn = -1;
    this.nextTurn();
  }

  noElimination(note) {
    this.cur().note = note;
    this.api.sys(note);
    this.reveal = { none: true, text: note };
    this.phase = 'reveal';
    this.pk = null;
    this.setTimer(R.REVEAL_SEC);
    this.api.update();
  }

  eliminate(id, how) {
    const p = this.byId.get(id);
    p.alive = false;
    p.elim = { round: this.round, how };
    this.elimOrder.push({ id, round: this.round, how });
    this.cur().elim = id;
    this.api.sys(`${p.name} 被投票淘汰，身分是【${this.roleName(p.role)}】`, { elim: id });
    this.reveal = { id, role: p.role, how };
    this.phase = 'reveal';
    this.pk = null;
    this.setTimer(R.REVEAL_SEC);
    this.api.update();
  }

  afterReveal() {
    const r = this.reveal;
    this.reveal = null;
    if (r && !r.none && r.role === 'blank' && r.how === 'vote' && !this.byId.get(r.id).gone) {
      this.phase = 'blank_guess';
      this.guesser = r.id; this.guessDone = false;
      this.setTimer(R.BLANK_GUESS_SEC);
      this.api.sys(`白板 ${this.name(r.id)} 有 ${R.BLANK_GUESS_SEC} 秒可以猜一次平民詞`);
      this.api.update();
      return;
    }
    this.afterElimination();
  }

  guess(id, raw) {
    if (this.phase !== 'blank_guess' || this.guesser !== id) return { error: '現在不能猜詞' };
    if (this.guessDone) return { error: '你已經猜過了' };
    const text = clean(raw, 20);
    if (!text) return { error: '請輸入你猜的平民詞' };
    this.guessDone = true;
    this.api.log({ kind: 'guess', channel: 'self:' + id, pid: id, name: this.name(id), text: `你猜的平民詞：${text}` });
    if (norm(text) === norm(this.pair.civ)) {
      this.api.sys(`白板 ${this.name(id)} 猜中了平民詞！`);
      return this.end({ winner: 'blank', winners: [id] });
    }
    this.api.sys(`白板 ${this.name(id)} 猜錯了，正式淘汰`);
    this.afterElimination();
    return null;
  }

  afterElimination() {
    this.guesser = null;
    const w = this.checkWin();
    if (w) return this.end(w);
    this.beginRound(this.round + 1);
  }

  // ① 白板猜中（在 guess 處理）② 臥底與白板全滅 → 平民勝 ③ 臥底＋白板 ≥ 平民 → 非平民陣營勝 ④ 繼續
  checkWin() {
    const a = this.alive();
    const civ = a.filter(p => p.role === 'civ').length, bad = a.filter(p => p.role !== 'civ').length;
    if (bad === 0) return { winner: 'civ', winners: this.players.filter(p => p.role === 'civ').map(p => p.id) };
    if (bad >= civ) return { winner: 'spy', winners: a.filter(p => p.role !== 'civ').map(p => p.id) };
    return null;
  }

  end(w) {
    this.phase = 'ended';
    this.deadline = 0; this.total = 0;
    this.guesser = null; this.reveal = null; this.pk = null; this.votes = new Map();
    this.result = w;
    const names = w.winners.map(id => this.name(id)).join('、');
    this.api.sys(w.winner === 'civ' ? '平民獲勝！' : w.winner === 'blank' ? `白板 ${names} 單獨獲勝！` : `非平民陣營獲勝！勝方：${names}`, { final: true });
    this.api.sys(`平民詞：${this.pair.civ}／臥底詞：${this.pair.spy}`, { final: true });
    this.api.end();
  }

  // ---------- 玩家操作 ----------
  action(id, type, data) {
    if (!this.byId.has(id)) return { error: '你不在這局遊戲中' };
    if (type === 'confirm') {
      if (this.phase !== 'word') return null;
      const p = this.byId.get(id);
      if (!p.confirmed) { p.confirmed = true; this.api.update(); }
      if (this.alive().every(x => x.confirmed)) this.beginRound(1);
      return null;
    }
    if (type === 'describe') return this.describe(id, data);
    if (type === 'skip') {
      if (this.phase !== 'discuss') return null;
      const p = this.byId.get(id);
      if (!p.alive) return { error: '只有存活玩家可以提前結束討論' };
      if (data === false) this.skips.delete(id); else this.skips.add(id);
      this.api.update();
      if (this.alive().every(x => this.skips.has(x.id))) { this.api.sys('所有存活玩家同意提前結束討論'); this.startVote(false); }
      return null;
    }
    if (type === 'vote') return this.vote(id, data === null ? null : String(data || '') || null);
    if (type === 'guess') return this.guess(id, data);
    return { error: '未知的操作' };
  }

  // 斷線超過保留時間或自己離開：遊戲中視為棄權淘汰（不觸發白板猜詞）
  onGone(id) {
    const p = this.byId.get(id);
    if (!p || p.gone || this.phase === 'ended') return;
    p.gone = true;
    if (this.phase === 'blank_guess' && this.guesser === id) { this.api.sys(`白板 ${p.name} 離席，未猜詞`); return this.afterElimination(); }
    if (!p.alive) { this.api.update(); return; }
    p.alive = false;
    p.elim = { round: this.round, how: 'leave' };
    this.elimOrder.push({ id, round: this.round, how: 'leave' });
    this.api.sys(`${p.name} 離席，視為棄權淘汰（身分是【${this.roleName(p.role)}】）`, { elim: id });
    this.votes.delete(id);
    for (const [v, t] of this.votes) if (t === id) this.votes.delete(v);   // 投給離席者的票作廢，可以重新投
    this.candidates = this.candidates.filter(x => x !== id);
    // 白板正在猜詞（或剛被投出、即將猜詞）：先讓白板猜完，再判定勝負（規則①優先）
    const blankPending = this.phase === 'blank_guess' ||
      (this.phase === 'reveal' && this.reveal && !this.reveal.none && this.reveal.role === 'blank' && this.reveal.how === 'vote');
    if (blankPending) { this.api.update(); return; }
    const w = this.checkWin();
    if (w) return this.end(w);
    switch (this.phase) {
      case 'word':
        if (this.alive().every(x => x.confirmed)) this.beginRound(1);
        break;
      case 'describe':
        if (this.speaker() === id && !this.turnDone) this.nextTurn();
        break;
      case 'pk_desc':
        if (this.pk.candidates.filter(c => this.byId.get(c).alive).length < 2) this.noElimination('PK 候選人離席，本輪無人淘汰');
        else if (this.speaker() === id && !this.turnDone) this.nextTurn();
        break;
      case 'pk_vote':
        if (this.candidates.length < 2) { this.votes = new Map(); this.noElimination('PK 候選人離席，本輪無人淘汰'); }
        else if (this.alive().every(x => this.votes.has(x.id))) this.resolveVote();
        break;
      case 'vote':
        if (this.alive().every(x => this.votes.has(x.id))) this.resolveVote();
        break;
      case 'discuss':
        if (this.alive().every(x => this.skips.has(x.id))) this.startVote(false);
        break;
    }
    this.api.update();
  }

  tick(now) {
    if (!this.deadline || now < this.deadline) return;
    this.deadline = 0;
    switch (this.phase) {
      case 'word': this.api.sys('查看時間結束'); this.beginRound(1); break;
      case 'describe': case 'pk_desc':
        if (!this.turnDone) { this.turnDone = true; this.recordDesc(this.speaker(), null); }
        this.nextTurn(); break;
      case 'discuss': this.startVote(false); break;
      case 'vote': case 'pk_vote': this.resolveVote(); break;
      case 'reveal': this.afterReveal(); break;
      case 'blank_guess':
        if (!this.guessDone) this.api.sys(`白板 ${this.name(this.guesser)} 未在時間內猜詞，正式淘汰`);
        this.afterElimination(); break;
    }
  }

  // ---------- 頻道 ----------
  chatChannel(id) {
    const p = this.byId.get(id);
    if (!p) return { error: '你不在這局遊戲中' };
    if (this.phase === 'ended') return { channel: 'all' };
    if (!p.alive) return { channel: 'ghost' };
    if (['discuss', 'vote', 'pk_vote', 'reveal'].includes(this.phase)) return { channel: 'all' };
    if (this.phase === 'word') return { error: '查看詞語中，描述開始後輪到你再發言' };
    if (this.phase === 'blank_guess') return { error: '白板猜詞中，請稍候' };
    return { error: '描述階段只能在輪到你時送出描述，自由討論時才能聊天' };
  }
  // 存活玩家聊天不能直接說出自己的詞語
  chatCheck(id, text) {
    const p = this.byId.get(id);
    if (p && p.alive && p.word && this.phase !== 'ended' && norm(text).includes(norm(p.word))) return '不能直接說出你的詞語，請換個說法';
    return null;
  }
  isGhost(id) { const p = this.byId.get(id); return !!(p && !p.alive); }

  // ---------- 給每位玩家的畫面資料（只包含該玩家可以知道的內容） ----------
  viewFor(id) {
    const me = this.byId.get(id), ended = this.phase === 'ended';
    const inVote = VOTE_PHASES.includes(this.phase);
    const v = {
      phase: this.phase, round: this.round, deadline: this.deadline, total: this.total,
      speaker: this.speaker(), order: DESC_PHASES.includes(this.phase) ? this.order : [],
      counts: this.counts,
      players: this.players.map(p => ({
        id: p.id, name: p.name, seat: p.seat, profile: p.profile, alive: p.alive, gone: p.gone, elim: p.elim,
        role: (ended || !p.alive) ? p.role : null,
        word: ended ? p.word : null,
        confirmed: this.phase === 'word' ? p.confirmed : undefined,
      })),
      candidates: inVote ? this.candidates : [],
      votedCount: inVote ? this.votes.size : 0,
      skipCount: this.phase === 'discuss' ? this.skips.size : 0,
      voterTotal: this.alive().length,
      pk: this.pk && ['pk_desc', 'pk_vote'].includes(this.phase) ? this.pk.candidates : null,
      reveal: this.phase === 'reveal' ? this.reveal : null,
      guesser: this.phase === 'blank_guess' ? this.guesser : null,
      me: me ? {
        word: me.role === 'blank' ? null : me.word,
        blank: me.role === 'blank',
        alive: me.alive,
        confirmed: me.confirmed,
        hasVoted: this.votes.has(id),
        skipped: this.phase === 'discuss' && this.skips.has(id),
        vote: this.votes.has(id) ? this.votes.get(id) : null,
        myTurn: this.speaker() === id && !this.turnDone,
        guessing: this.phase === 'blank_guess' && this.guesser === id && !this.guessDone,
      } : null,
      result: null,
    };
    if (ended && this.result) {
      v.result = {
        winner: this.result.winner, winners: this.result.winners,
        civWord: this.pair.civ, spyWord: this.pair.spy, category: this.pair.category, difficulty: this.pair.difficulty,
        elimOrder: this.elimOrder,
        history: this.history,
      };
    }
    return v;
  }
}

Undercover.MIN_PLAYERS = R.MIN_PLAYERS;
module.exports = Undercover;

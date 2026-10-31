// 伺服器端整合測試：每位測試玩家都是獨立的 Socket.io 連線（各自的 token）
// 執行：UC_TIME_SCALE=0.05 PORT=3900 node server.js & node test/server-test.js 3900
const { io } = require('socket.io-client');
const crypto = require('crypto');

const PORT = process.argv[2] || 3900;
const URL = 'http://localhost:' + PORT;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, passes = 0;
const check = (ok, msg) => { if (ok) passes++; else fails++; console.log((ok ? '  ✅ ' : '  ❌ ') + msg); };

async function until(fn, ms = 6000, step = 20) {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(step); }
  return null;
}

class Bot {
  constructor(name, token) {
    this.name = name;
    this.token = token || crypto.randomBytes(16).toString('hex');
    this.reset();
    this.connect();
  }
  reset() {
    this.zone = null; this.epoch = 0; this.pos = null; this.view = null; this.logs = []; this.errors = [];
    this.list = null; this.needPw = null; this.raw = []; this.ended = false; this.session = null; this.resumeNone = false;
  }
  connect() {
    const s = this.s = io(URL, { forceNew: true, transports: ['websocket'] });
    const rec = (ev, d) => { if (!this.ended) this.raw.push(ev + ' ' + JSON.stringify(d)); };
    s.on('session', d => { this.session = d; this.id = d.id; });
    s.on('resume:none', () => { this.resumeNone = true; });
    s.on('zone', z => { this.zone = z.zone; this.epoch = z.epoch; });
    s.on('city:spawn', d => { this.pos = { x: d.x, y: d.y }; });
    s.on('city:state', st => { const m = st.p.find(q => q[0] === this.id); if (m) this.pos = { x: m[1], y: m[2] }; });
    s.on('lobby:list', l => { this.list = l; });
    s.on('room:view', v => { rec('view', v); this.view = v; if (v.game && v.game.phase === 'ended') this.ended = true; });
    s.on('room:log', e => { if (e.final) this.ended = true; rec('log', e); this.logs.push(e); });
    s.on('room:logs', l => { rec('logs', l); this.logs = l.slice(); });
    s.on('room:logReset', () => { this.logs = []; });
    s.on('room:error', e => { this.errors.push(e.code); });
    s.on('room:needPassword', d => { this.needPw = d; });
    s.on('hello:error', e => { this.errors.push('HELLO:' + e.text); });
  }
  hello(name) { this.s.emit('hello', { token: this.token, profile: { name: name || this.name, body: '#ff6b6b', expr: 'happy', hat: 'cap' } }); }
  get g() { return this.view && this.view.game; }
  get room() { return this.view && this.view.room; }
  emit(...a) { this.s.emit(...a); }

  // 從廣場走到「誰是臥底」門口
  async walkIn() {
    await until(() => this.pos && this.zone === 'city');
    const pts = [[180, this.pos.y], [180, 440], [240, 440], [240, 320]];
    let seq = 1000;
    for (const [tx, ty] of pts) {
      for (let i = 0; i < 900 && this.zone === 'city'; i++) {
        const dx = tx - this.pos.x, dy = ty - this.pos.y, d = Math.hypot(dx, dy);
        if (d < 6) break;
        const k = Math.min(1, d / 30);
        this.s.emit('city:cmd', { e: this.epoch, c: [[++seq, Math.round(dx / d * 100 * k), Math.round(dy / d * 100 * k)]] });
        await sleep(16);
      }
    }
    return until(() => this.zone === 'lobby', 3000);
  }
}

const bots = [];
const mk = async (names) => {
  const list = names.map(n => new Bot(n));
  bots.push(...list);
  list.forEach(b => b.hello());
  await until(() => list.every(b => b.zone === 'city' && b.pos));
  return list;
};
const enterAll = list => Promise.all(list.map(b => b.walkIn()));
const phase = b => b.g && b.g.phase;
const waitPhase = (b, ph, ms = 8000) => until(() => (Array.isArray(ph) ? ph.includes(phase(b)) : phase(b) === ph), ms);

// 用測試玩家各自看到的詞推算身分（伺服器不提供這個資訊）
function roles(list) {
  const words = list.map(b => b.g.me.word);
  const cnt = {};
  words.forEach(w => { if (w) cnt[w] = (cnt[w] || 0) + 1; });
  const civWord = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
  const out = {};
  list.forEach(b => { out[b.id] = b.g.me.blank ? 'blank' : b.g.me.word === civWord ? 'civ' : 'spy'; });
  return { out, civWord };
}

async function setupRoom(list, settings, opts = {}) {
  const [host, ...rest] = list;
  host.emit('room:create', { name: opts.name || '測試房', privacy: opts.password ? 'password' : 'public', password: opts.password, settings });
  await until(() => host.room);
  for (const b of rest) {
    b.emit('room:join', { code: host.room.code, password: opts.password });
    await until(() => b.room);
  }
  await until(() => host.room.members.length === list.length);
  return host.room.code;
}
async function startGame(list) {
  const [host, ...rest] = list;
  rest.forEach(b => b.emit('room:ready', true));
  await until(() => host.room.members.every(m => m.id === host.room.hostId || m.ready));
  host.emit('room:start');
  await until(() => list.every(b => phase(b) === 'word'));
  list.forEach(b => b.emit('uc:confirm'));
  await until(() => list.every(b => phase(b) === 'describe'));
}
// 依序描述（skip 中的人不描述，讓他超時）
async function describeAll(list, skip = new Set(), text = i => '這是一個很常見的東西') {
  const byId = Object.fromEntries(list.map(b => [b.id, b]));
  for (let i = 0; i < 30; i++) {
    const host = list.find(b => b.g);
    if (!['describe', 'pk_desc'].includes(phase(host))) return;
    const sp = host.g.speaker, bot = byId[sp];
    if (bot && !skip.has(bot.id)) {
      await until(() => bot.g && bot.g.me && bot.g.me.myTurn, 3000);
      bot.emit('uc:describe', text(i));
    }
    await until(() => host.g.speaker !== sp || !['describe', 'pk_desc'].includes(phase(host)), 5000);
  }
}

(async () => {
  console.log('▶ 城市與入口');
  const [A, B, C, D, E] = await mk(['阿明', '小花', '大雄', '靜香', '胖虎']);
  check(bots.every(b => b.zone === 'city'), '5 個獨立連線都進入城市');
  const bad = new Bot('壞名字'); bad.hello('幹你娘'); await sleep(300);
  check(bad.errors.some(e => e.startsWith('HELLO:')), '不當暱稱會被拒絕');
  bad.s.close();
  await enterAll([A, B, C, D, E]);
  check([A, B, C, D, E].every(b => b.zone === 'lobby'), '走進門口感應區 → 自動進入誰是臥底大廳');
  A.emit('lobby:exit'); await until(() => A.zone === 'city');
  await sleep(1200);
  check(A.zone === 'city' && A.pos && A.pos.y > 380, '離開建築後出現在門外安全位置，不會反覆切換（y=' + Math.round(A.pos.y) + '）');
  await A.walkIn();
  check(A.zone === 'lobby', '再走進門口可以再次進入');

  console.log('▶ 房間：公開／密碼／隨機／代碼');
  C.emit('room:random'); await sleep(200);
  check(C.errors.includes('NO_ROOM'), '沒有公開房間時隨機加入會提示建立房間');
  D.emit('room:create', { name: '祕密基地', privacy: 'password', password: 'abc123', settings: { max: 4 } });
  await until(() => D.room);
  check(D.room && D.room.isPrivate && !JSON.stringify(D.view).includes('abc123'), '建立密碼房間，密碼不會傳到前端');
  C.errors = []; C.emit('room:random'); await sleep(200);
  check(C.errors.includes('NO_ROOM') && !C.room, '密碼房不會出現在隨機配對');
  check(!(A.list || []).some(r => r.code === D.room.code), '密碼房不會出現在公開列表');
  E.emit('room:join', { code: D.room.code }); await sleep(200);
  check(E.needPw && E.needPw.code === D.room.code, '用代碼找到密碼房 → 要求輸入密碼');
  E.emit('room:join', { code: D.room.code, password: 'wrong1' }); await sleep(200);
  check(E.errors.includes('WRONG_PASSWORD') && !E.room, '密碼錯誤無法加入');
  E.emit('room:join', { code: D.room.code.toLowerCase(), password: 'abc123' }); await until(() => E.room);
  check(E.room && E.room.code === D.room.code, '代碼（不分大小寫）＋正確密碼可以加入');
  E.emit('room:leave', {}); D.emit('room:leave', {});
  await until(() => E.zone === 'lobby' && D.zone === 'lobby');
  E.view = null; D.view = null;
  A.emit('room:create', { name: '阿明的房間', privacy: 'public', settings: { max: 5, descTime: 30, discussTime: 30, voteTime: 15 } });
  await until(() => A.room);
  await until(() => (B.list || []).some(r => r.code === A.room.code));
  const item = B.list.find(r => r.code === A.room.code);
  check(item && item.name === '阿明的房間' && item.count === 1 && item.max === 5 && item.host === '阿明' && item.state === 'waiting', '公開列表顯示名稱、人數、上限、房主與狀態');
  B.emit('room:random'); C.errors = []; C.emit('room:random');
  await until(() => B.room && C.room);
  check(B.room.code === A.room.code && C.room.code === A.room.code, '隨機加入配對到有空位的公開房間');
  D.view = null; D.emit('room:join', { code: A.room.code }); await until(() => D.room);
  check(D.room && D.room.code === A.room.code, '公開房間也可以用代碼加入');
  A.emit('room:start'); await sleep(200);
  check(A.errors.includes('NOT_READY'), '有人沒準備時房主不能開始');
  B.emit('room:start'); await sleep(150);
  check(B.errors.includes('NOT_HOST') && A.room.state === 'waiting', '非房主不能開始');

  console.log('▶ 4 人基本局');
  const four = [A, B, C, D];
  [B, C, D].forEach(b => b.emit('room:ready', true));
  await until(() => A.room.members.every(m => m.id === A.room.hostId || m.ready));
  A.emit('room:start'); A.emit('room:start'); A.emit('room:start');
  await until(() => four.every(b => phase(b) === 'word'));
  await sleep(200);
  check(A.logs.filter(e => e.text && e.text.startsWith('遊戲開始')).length === 1, '重複按開始只會開始一次');
  E.emit('room:join', { code: A.room.code }); await sleep(200);
  check(E.errors.includes('STARTED'), '遊戲開始後不能中途加入');
  check(four.every(b => b.g.me.word && !b.g.me.blank), '每人都拿到自己的詞（4 人局沒有白板）');
  check(four.every(b => b.g.players.every(p => p.role === null && p.word === null)), '遊戲中看不到任何人的身分與詞語');
  const r4 = roles(four);
  const spyBot = four.find(b => r4.out[b.id] === 'spy');
  check(Object.values(r4.out).filter(x => x === 'spy').length === 1, '身分配置 4 人：平民 3／臥底 1');
  check(four.every(b => b.logs.every(e => !String(e.text || '').includes(b.g.me.word))), '詞語不會出現在公開紀錄');
  four.forEach(b => b.emit('uc:confirm'));
  await until(() => four.every(b => phase(b) === 'describe'));
  // 描述：直接包含自己的詞要被擋下
  const sp1 = four.find(b => b.id === A.g.speaker);
  const notSp = four.find(b => b.id !== A.g.speaker);
  notSp.errors = []; notSp.emit('uc:describe', '偷跑'); await sleep(100);
  check(notSp.errors.includes('GAME'), '不是自己的回合不能送出正式描述');
  sp1.errors = []; sp1.emit('uc:describe', '我的是' + sp1.g.me.word + '喔'); await sleep(100);
  check(sp1.errors.includes('GAME') && A.g.speaker === sp1.id, '描述直接包含自己的詞語會被擋下');
  sp1.emit('uc:describe', '很好吃'); sp1.emit('uc:describe', '很好吃');
  await until(() => A.g.speaker !== sp1.id);
  await sleep(100);
  check(A.logs.filter(e => e.kind === 'desc' && e.pid === sp1.id).length === 1, '重複送出描述只算一次');
  B.errors = []; B.emit('room:chat', '聊天看看'); await sleep(100);
  check(B.errors.includes('NO_CHAT'), '描述階段不能自由聊天');
  await describeAll(four);
  await waitPhase(A, 'discuss');
  check(phase(A) === 'discuss', '所有人描述完 → 自由討論');
  B.emit('room:chat', '我覺得有人怪怪的'); await sleep(150);
  check(four.every(b => b.logs.some(e => e.kind === 'chat' && e.text === '我覺得有人怪怪的')), '討論時存活玩家聊天同步給所有人');
  const civ0 = four.find(b => b !== spyBot);
  civ0.errors = []; civ0.emit('room:chat', '答案是' + civ0.g.me.word); await sleep(120);
  check(civ0.errors.includes('NO_CHAT') && !B.logs.some(e => e.text === '答案是' + civ0.g.me.word), '討論時直接說出自己的詞語會被擋下');
  four.forEach(b => b.emit('uc:skip', true));
  await waitPhase(A, 'vote', 1500);
  check(phase(A) === 'vote', '所有存活玩家同意 → 提前結束討論進入投票');
  const civs = four.filter(b => b !== spyBot);
  civs[0].emit('uc:vote', civs[0].id); await sleep(100);
  check(civs[0].errors.includes('GAME'), '不能投給自己');
  civs[0].emit('uc:vote', civs[1].id); await sleep(80);
  civs[0].emit('uc:vote', spyBot.id); await sleep(80);
  check(civs[0].g.me.vote === spyBot.id && civs[1].g.votedCount === 1, '可以改票，以最後一次為準');
  check(!JSON.stringify(civs[1].g).includes('"vote":"' + spyBot.id), '投票結束前看不到別人投給誰');
  civs.slice(1).forEach(b => b.emit('uc:vote', spyBot.id));
  spyBot.emit('uc:vote', civs[0].id);
  await until(() => phase(A) === 'ended', 5000);
  check(phase(A) === 'ended' && A.g.result.winner === 'civ', '臥底被投出 → 平民獲勝（全員投完提前結算）');
  check(A.g.result.civWord && A.g.result.spyWord && A.g.players.every(p => p.role && p.word), '結算公開所有身分、平民詞與臥底詞');
  check(A.g.result.history.length === 1 && A.g.result.history[0].descs.length === 4 && A.g.result.history[0].votes, '結算包含各輪描述與投票結果');
  // 詞語外洩檢查：遊戲結束前，每個人收到的資料都不含別人的詞
  const leak = four.filter(b => { const other = b.g.me.word === A.g.result.civWord ? A.g.result.spyWord : A.g.result.civWord; const hit = b.raw.find(x => x.includes(other)); if (hit) console.log('     外洩來源：', b.name, hit.slice(0, 160)); return !!hit; });
  check(leak.length === 0, '遊戲結束前，前端收到的所有資料都不含其他人的詞語');

  console.log('▶ 再玩一局、房主移交');
  C.emit('room:again');
  await until(() => A.room.state === 'waiting');
  check(A.room.state === 'waiting' && A.room.members.every(m => !m.ready) && A.room.settings.max === 5, '再玩一局：回到等待、保留設定、重新準備');
  A.emit('room:leave', {});
  await until(() => B.room && B.room.hostId !== A.id);
  check(B.room.hostId && B.room.hostId !== A.id && B.room.members.length === 3, '房主離開 → 自動移交給仍在線的玩家');
  for (const b of [B, C, D]) b.emit('room:leave', {});
  await until(() => [B, C, D].every(b => b.zone === 'lobby'));

  console.log('▶ 5 人含白板：白板猜中');
  const five = [A, B, C, D, E];
  five.forEach(b => { b.view = null; b.raw = []; b.ended = false; b.errors = []; });
  await setupRoom(five, { max: 5, blank: true, descTime: 30, discussTime: 30, voteTime: 15 });
  await startGame(five);
  let rr = roles(five);
  const blankBot = five.find(b => rr.out[b.id] === 'blank');
  check(!!blankBot && blankBot.g.me.blank && blankBot.g.me.word === null, '白板知道自己是白板，沒有詞語');
  check(Object.values(rr.out).filter(x => x === 'civ').length === 3 && Object.values(rr.out).filter(x => x === 'spy').length === 1, '身分配置 5 人含白板：平民 3／臥底 1／白板 1');
  check(A.g.order[0] !== blankBot.id, '白板首輪不會第一個發言');
  await describeAll(five);
  await waitPhase(A, 'vote', 6000);
  five.filter(b => b !== blankBot).forEach(b => b.emit('uc:vote', blankBot.id));
  blankBot.emit('uc:vote', five.find(b => b !== blankBot).id);
  await waitPhase(blankBot, 'blank_guess', 3000);
  check(blankBot.g.me.guessing, '白板被投出 → 進入 15 秒猜詞');
  blankBot.emit('uc:guess', rr.civWord);
  await until(() => phase(A) === 'ended');
  check(A.g.result.winner === 'blank' && A.g.result.winners[0] === blankBot.id, '白板猜中平民詞 → 白板單獨獲勝');
  check(blankBot.logs.some(e => e.kind === 'guess') && five.filter(b => b !== blankBot).every(b => !b.logs.some(e => e.kind === 'guess')), '白板的猜測內容只有白板自己看得到');

  console.log('▶ 5 人含白板：白板猜錯 → 繼續');
  B.emit('room:again'); await until(() => A.room.state === 'waiting');
  five.forEach(b => { b.raw = []; b.ended = false; });
  await startGame([A, B, C, D, E].sort((x, y) => (x.id === A.room.hostId ? -1 : y.id === A.room.hostId ? 1 : 0)));
  rr = roles(five);
  const blank2 = five.find(b => rr.out[b.id] === 'blank');
  await describeAll(five);
  await waitPhase(A, 'vote', 6000);
  five.filter(b => b !== blank2).forEach(b => b.emit('uc:vote', blank2.id));
  blank2.emit('uc:vote', five.find(b => b !== blank2).id);
  await waitPhase(blank2, 'blank_guess', 3000);
  blank2.emit('uc:guess', '一定猜不中的詞');
  await waitPhase(A, 'describe', 3000);
  check(phase(A) === 'describe' && A.g.round === 2, '白板猜錯 → 正式淘汰，存活 平民3／臥底1，進入第 2 輪');
  const ghostMsg = '我是觀戰的白板';
  blank2.emit('room:chat', ghostMsg); await sleep(150);
  const aliveOther = five.find(b => b !== blank2);
  check(blank2.logs.some(e => e.kind === 'ghost' && e.text === ghostMsg) && !aliveOther.logs.some(e => e.text === ghostMsg), '淘汰者的觀戰頻道，存活玩家看不到');
  blank2.errors = []; blank2.emit('uc:describe', '偷講'); await sleep(100);
  check(blank2.errors.includes('GAME'), '淘汰者不能再描述');
  for (const b of five) b.emit('room:leave', {});
  await until(() => five.every(b => b.zone === 'lobby'));

  console.log('▶ 超時、平票 PK、全員棄權');
  four.forEach(b => { b.view = null; b.errors = []; });
  await setupRoom(four, { max: 4, descTime: 15, discussTime: 30, voteTime: 15 });
  await startGame(four);
  await describeAll(four, new Set(four.map(b => b.id)));     // 全員不描述 → 超時
  await waitPhase(A, 'discuss', 6000);
  check(A.logs.filter(e => e.missed).length === 4, '超時未提交 → 記錄「本輪未描述」並自動換下一人');
  await waitPhase(A, 'vote', 6000);
  const [p1, p2, p3, p4] = four.slice().sort((x, y) => A.g.players.find(p => p.id === x.id).seat - A.g.players.find(p => p.id === y.id).seat);
  p1.emit('uc:vote', p2.id); p2.emit('uc:vote', p1.id); p3.emit('uc:vote', p1.id); p4.emit('uc:vote', p2.id);
  await waitPhase(A, 'pk_desc', 3000);
  check(phase(A) === 'pk_desc' && A.g.pk.length === 2, '最高票平手 → 平票玩家進入 PK 補充描述');
  await describeAll(four);
  await waitPhase(A, 'pk_vote', 4000);
  check(A.g.candidates.length === 2 && A.g.candidates.includes(p1.id) && A.g.candidates.includes(p2.id), 'PK 投票只能選平票候選人');
  p3.errors = []; p3.emit('uc:vote', p4.id); await sleep(100);
  check(p3.errors.includes('GAME'), 'PK 投給非候選人會被拒絕');
  p1.emit('uc:vote', p2.id); p2.emit('uc:vote', p1.id); p3.emit('uc:vote', p1.id); p4.emit('uc:vote', p2.id);
  await until(() => A.logs.some(e => e.text === 'PK 再次平票，本輪無人淘汰'), 3000);
  check(A.logs.some(e => e.text === 'PK 再次平票，本輪無人淘汰'), 'PK 再次平票 → 本輪無人淘汰（不會無限 PK）');
  await until(() => A.g.round === 2 && phase(A) === 'describe', 4000);
  const r1start = A.g.players.find(p => p.id === A.logs.find(e => e.round === 1 && e.text.startsWith('第 1 輪')).text.split(' ')[3]);
  check(A.g.round === 2, '進入第 2 輪');
  await describeAll(four);
  await waitPhase(A, 'vote', 6000);
  four.forEach(b => b.emit('uc:vote', null));
  await until(() => A.logs.some(e => e.text === '全員棄權，本輪無人淘汰'), 3000);
  check(A.logs.some(e => e.text === '全員棄權，本輪無人淘汰'), '全員棄權 → 本輪無人淘汰');
  await until(() => A.g.round === 3, 4000);
  check(A.g.round === 3 && A.g.players.every(p => p.alive), '進入第 3 輪，沒有人被淘汰');
  const starts = A.logs.filter(e => /^第 \d 輪開始/.test(e.text)).map(e => e.text);
  check(new Set(starts.map(s => s.split('由 ')[1])).size === 3, '每輪輪替起始座位：' + starts.map(s => s.split('由 ')[1]).join(' → '));

  console.log('▶ 斷線恢復與離席');
  const rec = four.find(b => b !== A);
  const myWord = rec.g.me.word, mySeat = A.g.players.find(p => p.id === rec.id).seat;
  rec.s.close(); await sleep(300);
  check(A.room.members.find(m => m.id === rec.id).online === false, '斷線 → 其他人看到連線狀態改變（席位保留）');
  rec.reset(); rec.connect(); rec.emit('resume', { token: rec.token });
  await until(() => rec.g);
  check(rec.zone === 'room' && rec.g.me.word === myWord && rec.g.players.find(p => p.id === rec.id).seat === mySeat && rec.logs.length > 5,
    '重新整理後恢復原角色、座位、本人詞語與紀錄');
  const r3 = roles(four);
  const goner = four.find(b => b !== A && b !== rec && r3.out[b.id] === 'civ') || four.find(b => b !== A && b !== rec);
  const gonerRole = r3.out[goner.id];
  goner.s.close();
  await until(() => A.logs.some(e => e.text && e.text.startsWith(goner.name + ' 離席')), 9000);
  check(A.logs.some(e => e.text && e.text.startsWith(goner.name + ' 離席，視為棄權淘汰')), '斷線超過保留時間 → 視為棄權淘汰並公開身分');
  const after = phase(A);
  check(gonerRole === 'spy' ? after === 'ended' : after !== 'ended', '離席後立即重新檢查勝負（離席者是' + (gonerRole === 'spy' ? '臥底 → 平民勝' : '平民 → 遊戲繼續') + '）');
  // 讓遊戲跑完，確認不會卡住
  const alive = () => four.filter(b => A.g.players.find(p => p.id === b.id && p.alive) && b !== goner);
  for (let i = 0; i < 6 && phase(A) !== 'ended'; i++) {
    await describeAll(alive());
    await waitPhase(A, ['vote', 'ended'], 8000);
    if (phase(A) === 'ended') break;
    const al = alive(), target = al.find(b => r3.out[b.id] !== 'civ') || al[0];
    al.forEach(b => b.emit('uc:vote', b === target ? al.find(x => x !== b).id : target.id));
    await waitPhase(A, ['describe', 'ended'], 8000);
  }
  check(phase(A) === 'ended', '整局可以順利結束，沒有卡住（' + (A.g.result ? A.g.result.winner : '-') + ' 勝）');

  console.log(`\n結果：${passes} 項通過，${fails} 項失敗`);
  bots.forEach(b => b.s.close());
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

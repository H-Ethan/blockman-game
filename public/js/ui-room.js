// 誰是臥底房間：上方資訊、圍桌場景、操作面板（依階段切換）、右側紀錄、結算
(function (root) {
  'use strict';
  const BM = root.BM = root.BM || {};
  const R = BM.UC;
  const { $, el, kids, toast, modal, closeModal, showRules, settingsForm, summaryChips, hhmmss } = BM.UI;

  const KIND_LABEL = { desc: '描述', chat: '聊天', sys: '系統', vote: '投票', ghost: '觀戰', guess: '猜詞' };
  const ROLE_CLS = { civ: 'civ', spy: 'spy', blank: 'blank' };

  class RoomUI {
    constructor(socket, ctx) {
      this.s = socket; this.ctx = ctx;           // ctx：{ quality(), myId() }
      this.v = null; this.off = 0; this.logs = []; this.filter = 'all';
      this.actionKey = ''; this.wordShown = false; this.holding = false; this.lastBannerKey = ''; this.resultClosed = false;
      this.scene = new BM.RoomScene($('roomCanvas'), 'room', { quality: ctx.quality, onClick: id => this.clickSeat(id) });
      document.querySelectorAll('#logTabs button').forEach(b => b.onclick = () => {
        this.filter = b.dataset.f; document.querySelectorAll('#logTabs button').forEach(x => x.classList.toggle('on', x === b)); this.renderLog(true);
      });
      $('rCode').onclick = () => { const c = this.v && this.v.room.code; if (!c) return; try { navigator.clipboard.writeText(c); toast('已複製房間代碼 ' + c); } catch (e) { toast('房間代碼：' + c); } };
      $('rRules').onclick = showRules;
      $('rSettingsBtn').onclick = () => this.openSettings();
      $('rChatForm').onsubmit = e => { e.preventDefault(); this.sendChat(); };
      const log = $('rLog');
      log.addEventListener('scroll', () => { if (this.atBottom()) $('rNewPill').classList.add('hidden'); });
      $('rNewPill').onclick = () => { log.scrollTop = log.scrollHeight; $('rNewPill').classList.add('hidden'); };
      $('rSideToggle').onclick = () => { $('rSide').classList.add('open'); $('rSideDot').classList.add('hidden'); setTimeout(() => { log.scrollTop = log.scrollHeight; }, 260); };
      $('rSideClose').onclick = () => $('rSide').classList.remove('open');

      socket.on('room:view', v => this.onView(v));
      socket.on('room:log', e => this.onLog(e));
      socket.on('room:logs', l => { this.logs = l.slice(); this.renderLog(true); });
      socket.on('room:logReset', () => { this.logs = []; this.renderLog(true); this.scene.bubbles.clear(); });
    }

    get me() { return this.ctx.myId(); }
    get g() { return this.v && this.v.game; }
    enter() { this.actionKey = ''; this.resultClosed = false; requestAnimationFrame(() => this.scene.resize()); }
    resize() { this.scene.resize(); }
    serverNow() { return Date.now() + this.off; }

    // ---------- 狀態 ----------
    onView(v) {
      const prev = this.v;
      this.v = v; this.off = v.now - Date.now();
      const room = v.room, g = v.game;
      if (prev && prev.room.state !== 'waiting' && room.state === 'waiting') { this.resultClosed = false; this.wordShown = false; }
      // 上方
      $('rName').textContent = room.name;
      $('rCode').textContent = room.code;
      $('rLock').classList.toggle('hidden', !room.isPrivate);
      const playing = g && g.phase !== 'ended';
      $('rPhase').textContent = room.state === 'waiting' ? '準備中' : g ? R.PHASE_NAMES[g.phase] || '' : '';
      $('rRound').textContent = g && g.round ? `第 ${g.round} 輪` : room.state === 'waiting' ? `${room.members.length}／${room.settings.max} 人` : '';
      $('rTimer').classList.toggle('hidden', !(playing && g.deadline));
      $('rSettingsBtn').classList.toggle('hidden', !(room.state === 'waiting' && room.hostId === this.me));
      BM.App.where(`誰是臥底 ‧ ${room.name}`);
      this.updateScene();
      this.renderAction();
      this.renderChatState();
      this.banner(prev);
      this.renderResult();
    }

    updateScene() {
      const v = this.v, room = v.room, g = v.game;
      const gp = g ? new Map(g.players.map(p => [p.id, p])) : null;
      const hl = {};
      if (g) {
        if (g.speaker) hl[g.speaker] = 'speaker';
        if (['vote', 'pk_vote'].includes(g.phase)) {
          const canVote = g.me && g.me.alive;
          for (const c of g.candidates) if (c !== this.me && canVote) hl[c] = 'cand';
          if (g.me && g.me.vote) hl[g.me.vote] = 'myvote';
        }
        if (g.pk && g.phase === 'pk_desc') for (const c of g.pk) if (!hl[c]) hl[c] = 'pk';
      }
      // 遊戲中已離開房間的人也要留在座位上（灰階），直到結算
      const members = room.members.map(m => ({ ...m }));
      if (g) for (const p of g.players) if (!members.find(m => m.id === p.id)) members.push({ id: p.id, name: p.name, profile: p.profile, seat: p.seat, online: false, gone: true });
      for (const m of members) {
        const gpl = gp && gp.get(m.id);
        m.me = m.id === this.me;
        m.dead = !!(gpl && !gpl.alive);
        let badge = null, badgeBg = null;
        if (room.state === 'waiting') {
          if (m.id === room.hostId) { badge = '房主'; badgeBg = '#ffcf5a'; }
          else if (m.ready) { badge = '✓ 準備'; badgeBg = '#bbf7d0'; }
        } else if (gpl) {
          if (!gpl.alive) { badge = gpl.role ? `淘汰‧${R.ROLE_NAMES[gpl.role]}` : '淘汰'; badgeBg = '#e2e8f0'; }
          else if (g.speaker === m.id) { badge = '發言中'; badgeBg = '#ffcf5a'; }
          else if (g.phase === 'word' && gpl.confirmed) { badge = '✓'; badgeBg = '#bbf7d0'; }
          if (g.phase === 'ended' && g.result && g.result.winners.includes(m.id)) { badge = '🏆 勝利'; badgeBg = '#fde68a'; }
        }
        if (!m.online) { badge = m.gone ? '已離席' : '離線'; badgeBg = '#cbd5e1'; }
        m.badge = badge; m.badgeBg = badgeBg;
      }
      this.scene.set({ members, max: room.settings.max, highlight: hl });
      $('roomCanvas').classList.toggle('pick', Object.values(hl).includes('cand'));
    }

    clickSeat(id) {
      const g = this.g;
      if (!g || !['vote', 'pk_vote'].includes(g.phase) || !g.me || !g.me.alive) return;
      if (id === this.me) return toast('不能投給自己', true);
      if (!g.candidates.includes(id)) return toast(g.phase === 'pk_vote' ? '只能投給平票的玩家' : '只能投給存活的玩家', true);
      this.s.emit('uc:vote', id);
    }

    // ---------- 階段公告 ----------
    banner(prev) {
      const g = this.g, pg = prev && prev.game;
      if (!g) return;
      const name = id => { const p = g.players.find(x => x.id === id); return p ? p.name : '?'; };
      let key = g.phase + '|' + g.round, text = null, sub = null;
      if (g.phase === 'word') { text = '遊戲開始！請查看你的詞語'; sub = '記住後按「我記住了」'; }
      else if (g.phase === 'describe' && (!pg || pg.phase !== 'describe' || pg.round !== g.round)) { text = `第 ${g.round} 輪：輪流描述`; sub = `由 ${name(g.order[0])} 先描述`; }
      else if (g.phase === 'discuss') { text = '自由討論'; sub = '存活玩家可以自由聊天'; }
      else if (g.phase === 'vote') { text = '投票'; sub = '選出你懷疑的人（不能投自己）'; }
      else if (g.phase === 'pk_desc') { text = '平票 PK！'; sub = `${(g.pk || []).map(name).join('、')} 各補充一句描述`; }
      else if (g.phase === 'pk_vote') { text = 'PK 重新投票'; sub = '只能投給平票的玩家'; }
      else if (g.phase === 'reveal' && g.reveal) {
        key += '|' + (g.reveal.id || 'none');
        if (g.reveal.none) { text = g.reveal.text; }
        else { text = `${name(g.reveal.id)} 被淘汰`; sub = `身分是【${R.ROLE_NAMES[g.reveal.role]}】`; }
      } else if (g.phase === 'blank_guess') { text = `白板 ${name(g.guesser)} 猜詞中…`; sub = '猜中平民詞就能單獨獲勝'; }
      else if (g.phase === 'ended') { text = null; }
      if (key === this.lastBannerKey || !text) return;
      this.lastBannerKey = key;
      const b = $('rBanner'); b.innerHTML = '';
      kids(b, text, sub ? el('small', null, sub) : null);
      b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
      clearTimeout(this.bannerT); this.bannerT = setTimeout(() => b.classList.add('hidden'), 3200);
    }

    // ---------- 操作面板 ----------
    renderAction() {
      const v = this.v, room = v.room, g = v.game, me = g && g.me;
      const meMember = room.members.find(m => m.id === this.me);
      const key = JSON.stringify([room.state, room.hostId, room.settings, room.members.map(m => [m.id, m.ready, m.online]),
        g && [g.phase, g.round, g.speaker, g.candidates, g.pk, me && [me.alive, me.confirmed, me.vote, me.hasVoted, me.myTurn, me.guessing, me.skipped], g.reveal && g.reveal.id, g.guesser]]);
      this.updateCounts();
      if (key === this.actionKey) return;
      this.actionKey = key;
      const box = $('rAction'); box.innerHTML = '';
      const leaveBtn = el('button', 'btn small danger', '🚪 離開房間', { on: { click: () => this.leave() } });

      if (room.state === 'waiting') {
        const host = room.hostId === this.me;
        const others = room.members.filter(m => m.id !== room.hostId);
        const readyN = others.filter(m => m.ready).length;
        const enough = room.members.length >= R.MIN_PLAYERS, allReady = others.every(m => m.ready);
        const info = kids(el('div', 'grow'), kids(el('div', 'msg'), `等待玩家準備（${readyN}／${others.length} 人已準備）`,
          el('small', null, host ? (!enough ? `至少需要 ${R.MIN_PLAYERS} 人才能開始（目前 ${room.members.length} 人）` : allReady ? '大家都準備好了，可以開始！' : '等待所有玩家按下「準備」') : '準備好後等房主開始遊戲')),
          summaryChips(room.settings));
        box.appendChild(info);
        if (host) {
          const st = el('button', 'btn primary big', '▶ 開始遊戲'); st.disabled = !(enough && allReady);
          st.onclick = () => { st.disabled = true; this.s.emit('room:start'); };
          kids(box, kids(el('div', 'row'), el('button', 'btn small', '⚙️ 房間設定', { on: { click: () => this.openSettings() } }), st, leaveBtn));
        } else {
          const ready = meMember && meMember.ready;
          kids(box, kids(el('div', 'row'), el('button', 'btn big ' + (ready ? '' : 'gold'), ready ? '取消準備' : '✓ 準備', { on: { click: () => this.s.emit('room:ready', !ready) } }), leaveBtn));
        }
        return;
      }
      if (!g) return;
      if (g.phase === 'ended') {
        kids(box, kids(el('div', 'grow msg'), '這局遊戲結束了', el('small', null, '可以查看結算、再玩一局或返回城市')),
          kids(el('div', 'row'), el('button', 'btn', '📊 查看結算', { on: { click: () => { this.resultClosed = false; this.renderResult(); } } }),
            el('button', 'btn primary', '🔁 再玩一局', { on: { click: () => this.s.emit('room:again') } }),
            el('button', 'btn', '🏙️ 返回城市', { on: { click: () => this.s.emit('room:leave', { toCity: true }) } })));
        return;
      }
      if (!me) { kids(box, el('div', 'grow msg', '觀戰中')); return; }
      box.appendChild(this.wordCard(me));
      const area = el('div', 'grow');
      box.appendChild(area);
      const name = id => { const p = g.players.find(x => x.id === id); return p ? p.name : '?'; };
      if (!me.alive && !(g.phase === 'blank_guess' && me.guessing)) {
        kids(area, kids(el('div', 'msg'), '👻 你已經被淘汰了', el('small', null, '可以繼續觀看，並在右側「觀戰頻道」和其他淘汰者聊天（存活玩家看不到）')));
      } else if (g.phase === 'word') {
        const b = el('button', 'btn primary big', me.confirmed ? '✓ 已確認' : '我記住了'); b.disabled = me.confirmed;
        b.onclick = () => { b.disabled = true; this.s.emit('uc:confirm'); };
        kids(area, kids(el('div', 'row'), kids(el('div', 'msg'), me.blank ? '你是白板！' : '這是你的詞語',
          el('small', null, me.blank ? '你沒有詞語，請仔細聽大家的描述來推理' : '一般玩家不知道自己是平民還是臥底，請小心描述')), b, el('span', 'hint', '', { id: 'rCount' })));
      } else if (g.phase === 'describe' || g.phase === 'pk_desc') {
        if (me.myTurn) {
          const inp = el('input', null, null, { type: 'text', maxLength: 40, placeholder: g.phase === 'pk_desc' ? '補充一句描述（PK）' : '用一句話描述你的詞語', id: 'descInput' });
          const btn = el('button', 'btn primary', '送出描述');
          const go = () => { const t = inp.value.trim(); if (!t) return; this.s.emit('uc:describe', t); };
          btn.onclick = go; inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
          kids(area, kids(el('div', 'msg'), '輪到你描述了！'), kids(el('div', 'row'), inp, btn),
            el('div', 'reminder', '不能直接說出詞語，也不要拆字、用拼音或諧音報答案'));
          setTimeout(() => inp.focus(), 30);
        } else {
          kids(area, kids(el('div', 'msg'), `輪到 ${name(g.speaker)} 描述中…`, el('small', null, '描述會顯示在角色頭上與右側紀錄')));
        }
        const ord = el('div', 'order');
        const idx = g.order.indexOf(g.speaker);
        g.order.forEach((id, i) => ord.appendChild(el('span', i < idx ? 'done' : i === idx ? 'cur' : '', name(id))));
        area.appendChild(ord);
      } else if (g.phase === 'discuss') {
        const b = el('button', 'btn small ' + (me.skipped ? 'gold' : ''), me.skipped ? '✓ 已同意提前投票' : '⏩ 提前結束討論');
        b.onclick = () => this.s.emit('uc:skip', !me.skipped);
        kids(area, kids(el('div', 'msg'), '自由討論中', el('small', null, '在右側聊天，找出誰的描述怪怪的')), kids(el('div', 'row'), b, el('span', 'hint', '', { id: 'rCount' })));
      } else if (g.phase === 'vote' || g.phase === 'pk_vote') {
        const list = el('div', 'vote-list');
        for (const id of g.candidates) {
          if (id === this.me) continue;
          const p = g.players.find(x => x.id === id);
          const b = el('button', 'vote-btn' + (me.vote === id ? ' on' : ''));
          kids(b, el('img', null, null, { src: BM.Avatar.thumb(p.profile, 30), alt: '' }), p.name);
          b.onclick = () => this.s.emit('uc:vote', id);
          list.appendChild(b);
        }
        const abst = el('button', 'btn small' + (me.hasVoted && !me.vote ? ' gold' : ''), me.hasVoted && !me.vote ? '✓ 棄權' : '棄權');
        abst.onclick = () => this.s.emit('uc:vote', null);
        kids(area, kids(el('div', 'msg'), g.phase === 'pk_vote' ? 'PK 投票：只能投給平票的玩家' : '投票：選出你懷疑的人',
          el('small', null, me.hasVoted ? `你投給：${me.vote ? name(me.vote) : '棄權'}（截止前可以改票）` : '點名字或場景中的角色投票；票數在結算前不公開')),
          list, kids(el('div', 'row'), abst, el('span', 'hint', '', { id: 'rCount' })));
      } else if (g.phase === 'reveal') {
        kids(area, el('div', 'msg', g.reveal && !g.reveal.none ? `${name(g.reveal.id)} 被淘汰，身分是【${R.ROLE_NAMES[g.reveal.role]}】` : (g.reveal && g.reveal.text) || '公布結果'));
      } else if (g.phase === 'blank_guess') {
        if (me.guessing) {
          const inp = el('input', null, null, { type: 'text', maxLength: 20, placeholder: '你猜平民詞是…' });
          const btn = el('button', 'btn primary', '送出猜測');
          const go = () => { const t = inp.value.trim(); if (!t) return; btn.disabled = true; this.s.emit('uc:guess', t); };
          btn.onclick = go; inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
          kids(area, kids(el('div', 'msg'), '你被投出了！最後機會：猜平民詞', el('small', null, '只能猜一次，猜中就單獨獲勝（猜測內容其他人看不到）')), kids(el('div', 'row'), inp, btn));
          setTimeout(() => inp.focus(), 30);
        } else kids(area, el('div', 'msg', `白板 ${name(g.guesser)} 正在猜平民詞…`));
      }
      box.appendChild(kids(el('div', 'row'), leaveBtn));
    }

    updateCounts() {
      const g = this.g, c = $('rCount');
      if (!g || !c) return;
      if (g.phase === 'word') c.textContent = `${g.players.filter(p => p.alive && p.confirmed).length}／${g.players.filter(p => p.alive).length} 人已確認`;
      else if (g.phase === 'discuss') c.textContent = `${g.skipCount}／${g.voterTotal} 人同意提前投票`;
      else if (['vote', 'pk_vote'].includes(g.phase)) c.textContent = `${g.votedCount}／${g.voterTotal} 人已投票`;
    }

    wordCard(me) {
      const blank = me.blank;
      const card = el('div', 'word-card' + (blank ? ' blank' : ''));
      const w = el('div', 'w');
      const paint = () => {
        const show = this.wordShown || this.holding;
        w.textContent = blank ? '白板' : show ? me.word : '＊＊＊';
        w.classList.toggle('masked', !blank && !show);
        tog.textContent = this.wordShown ? '🙈 隱藏' : '👁 顯示';
      };
      const hold = el('button', null, '按住查看', { type: 'button' });
      const tog = el('button', null, '', { type: 'button' });
      hold.addEventListener('pointerdown', e => { e.preventDefault(); this.holding = true; paint(); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) hold.addEventListener(ev, () => { this.holding = false; paint(); });
      tog.onclick = () => { this.wordShown = !this.wordShown; paint(); };
      kids(card, el('div', 'lbl', blank ? '你的身分' : '你的詞語（只有你看得到）'), w);
      if (!blank) kids(card, kids(el('div', 'tools'), hold, tog));
      paint();
      return card;
    }

    // ---------- 聊天 ----------
    chatState() {
      const v = this.v; if (!v) return { ok: false };
      const g = v.game;
      if (v.room.state !== 'playing' || !g || g.phase === 'ended') return { ok: true, label: '聊天', cls: '' };
      const p = g.players.find(x => x.id === this.me);
      if (!p) return { ok: false, label: '觀戰', cls: 'off', hint: '' };
      if (!p.alive) return { ok: true, label: '觀戰頻道', cls: 'ghost', hint: '只有淘汰玩家看得到觀戰頻道' };
      if (['discuss', 'vote', 'pk_vote', 'reveal'].includes(g.phase)) return { ok: true, label: '討論', cls: '', hint: '不要直接說出自己的詞語' };
      return { ok: false, label: '暫停', cls: 'off', hint: g.phase === 'word' ? '查看詞語中，稍後才能聊天' : g.phase === 'blank_guess' ? '白板猜詞中，請稍候' : '描述階段請等輪到你時在左側送出描述，自由討論時才能聊天' };
    }
    renderChatState() {
      const s = this.chatState();
      const c = $('rChan'); c.textContent = s.label || '聊天'; c.className = 'chan ' + (s.cls || '');
      $('rChatInput').disabled = !s.ok;
      $('rChatInput').placeholder = s.ok ? (s.cls === 'ghost' ? '在觀戰頻道說話' : '輸入訊息，按 Enter 送出') : '目前不能聊天';
      $('rChatHint').textContent = s.hint || '';
    }
    sendChat() {
      const inp = $('rChatInput'), t = inp.value.trim();
      if (!t || inp.disabled) return;
      this.s.emit('room:chat', t); inp.value = '';
    }

    // ---------- 紀錄 ----------
    atBottom() { const l = $('rLog'); return l.scrollHeight - l.scrollTop - l.clientHeight < 40; }
    match(e) {
      if (this.filter === 'all') return true;
      if (this.filter === 'desc') return e.kind === 'desc';
      return e.kind === 'sys' || e.kind === 'vote';
    }
    entry(e) {
      const d = el('div', 'ent ' + e.kind + (e.missed ? ' missed' : '') + (e.final ? ' final' : ''));
      const meta = kids(el('div', 'meta'), el('span', 'kind', (e.pk && e.kind === 'desc') ? 'PK 描述' : KIND_LABEL[e.kind] || ''), el('span', null, hhmmss(e.t)), e.round ? el('span', null, `第 ${e.round} 輪`) : null);
      d.appendChild(meta);
      if (e.name && e.kind !== 'sys' && e.kind !== 'vote' && e.kind !== 'guess') kids(d, el('span', 'who', e.name + '：'), e.text);
      else d.appendChild(document.createTextNode(e.text));
      if (e.kind === 'vote' && e.detail) {
        const vd = el('div', 'vote-detail');
        for (const [a, b] of e.detail) vd.appendChild(el('span', null, `${a} → ${b || '棄權'}`));
        d.appendChild(vd);
      }
      return d;
    }
    renderLog(scroll) {
      const log = $('rLog'); log.innerHTML = '';
      const frag = document.createDocumentFragment();
      for (const e of this.logs) if (this.match(e)) frag.appendChild(this.entry(e));
      log.appendChild(frag);
      if (scroll) { log.scrollTop = log.scrollHeight; $('rNewPill').classList.add('hidden'); }
    }
    onLog(e) {
      this.logs.push(e);
      if (this.logs.length > 400) this.logs.shift();
      if (this.match(e)) {
        const stick = this.atBottom();
        const log = $('rLog'); log.appendChild(this.entry(e));
        while (log.children.length > 400) log.firstChild.remove();
        if (stick) log.scrollTop = log.scrollHeight; else $('rNewPill').classList.remove('hidden');
      }
      if (!$('rSide').classList.contains('open') && getComputedStyle($('rSideToggle')).display !== 'none') $('rSideDot').classList.remove('hidden');
      if (e.pid && (e.kind === 'desc' || e.kind === 'chat' || e.kind === 'ghost')) this.scene.say(e.pid, e.text, e.kind);
    }

    // ---------- 其他 ----------
    leave() {
      const g = this.g;
      if (g && g.phase !== 'ended' && g.me && g.me.alive) {
        modal(b => kids(b, el('h3', null, '確定要離開嗎？'), el('p', null, '遊戲進行中離開，會被視為棄權淘汰（公開身分，不會觸發白板猜詞）。'),
          kids(el('div', 'result-btns'), el('button', 'btn', '繼續遊戲', { on: { click: closeModal } }),
            el('button', 'btn danger', '離開房間', { on: { click: () => { closeModal(); this.s.emit('room:leave', {}); } } }))));
        return;
      }
      this.s.emit('room:leave', {});
    }
    openSettings() {
      const room = this.v.room;
      modal(b => {
        kids(b, el('h3', null, '⚙️ 房間設定'));
        const get = settingsForm(b, room.settings, { name: room.name, minMax: room.members.length });
        kids(b, kids(el('div', 'result-btns'), el('button', 'btn', '取消', { on: { click: closeModal } }),
          el('button', 'btn primary', '儲存設定', { on: { click: () => { const v = get(); this.s.emit('room:settings', { name: v.name, settings: v.settings }); closeModal(); } } })));
      });
    }

    renderResult() {
      const box = $('rResult'), g = this.g;
      if (!g || g.phase !== 'ended' || !g.result || this.resultClosed) { box.classList.add('hidden'); return; }
      const key = 'res' + g.round + g.result.winner + this.v.room.code;
      if (this.resultKey === key && !box.classList.contains('hidden')) return;
      this.resultKey = key;
      const r = g.result, byId = new Map(g.players.map(p => [p.id, p]));
      const name = id => (byId.get(id) || {}).name || '?';
      const winText = r.winner === 'civ' ? '🎉 平民獲勝！' : r.winner === 'blank' ? `🎯 白板 ${r.winners.map(name).join('、')} 猜中平民詞，單獨獲勝！` : `🕵️ 非平民陣營獲勝！`;
      const card = el('div', 'result-card');
      kids(card, kids(el('div', 'result-head'), el('div', 'win ' + r.winner, winText),
        r.winner === 'spy' ? el('div', 'hint', `勝方：${r.winners.map(name).join('、')}（存活的臥底與白板）`) : null),
        kids(el('div', 'words'), kids(el('div'), el('small', null, '平民詞'), el('b', null, r.civWord)), kids(el('div'), el('small', null, '臥底詞'), el('b', null, r.spyWord)),
          kids(el('div'), el('small', null, '題庫'), el('b', null, `${r.category}‧${r.difficulty}`))));
      const t = el('table', 'res-table');
      kids(t, kids(el('tr'), el('th'), el('th', null, '玩家'), el('th', null, '身分'), el('th', null, '詞語'), el('th', null, '結果')));
      const elimRound = new Map(r.elimOrder.map((e, i) => [e.id, e]));
      for (const p of g.players.slice().sort((a, b) => a.seat - b.seat)) {
        const e = elimRound.get(p.id);
        kids(t, kids(el('tr'), kids(el('td'), el('img', null, null, { src: BM.Avatar.thumb(p.profile, 28, !p.alive), alt: '' })),
          kids(el('td'), el('b', null, p.name + (p.id === this.me ? '（你）' : '')), r.winners.includes(p.id) ? el('span', 'winner-mark', ' 🏆') : null),
          kids(el('td'), el('span', 'role ' + ROLE_CLS[p.role], R.ROLE_NAMES[p.role])), el('td', null, p.word || '（無）'),
          el('td', null, e ? `第 ${e.round} 輪${e.how === 'leave' ? '離席' : '被投出'}` : '存活')));
      }
      card.appendChild(t);
      if (r.elimOrder.length) card.appendChild(el('p', 'hint', '淘汰順序：' + r.elimOrder.map((e, i) => `${i + 1}. ${name(e.id)}（${R.ROLE_NAMES[byId.get(e.id).role]}）`).join('　')));
      for (const h of r.history) {
        const d = el('details', 'rounds');
        d.appendChild(el('summary', null, `第 ${h.round} 輪` + (h.elim ? `：${name(h.elim)} 被淘汰` : h.note ? `：${h.note}` : '')));
        const ul = el('ul');
        for (const x of h.descs) ul.appendChild(el('li', null, `${name(x.pid)}：${x.text || '（本輪未描述）'}`));
        if (h.votes) ul.appendChild(el('li', null, '投票：' + h.votes.detail.map(([a, b]) => `${name(a)}→${b ? name(b) : '棄權'}`).join('、')));
        if (h.pk) {
          for (const x of h.pk.descs) ul.appendChild(el('li', null, `PK ${name(x.pid)}：${x.text || '（未描述）'}`));
          if (h.pk.votes) ul.appendChild(el('li', null, 'PK 投票：' + h.pk.votes.detail.map(([a, b]) => `${name(a)}→${b ? name(b) : '棄權'}`).join('、')));
        }
        d.appendChild(ul); card.appendChild(d);
      }
      kids(card, kids(el('div', 'result-btns'),
        el('button', 'btn primary big', '🔁 再玩一局', { on: { click: () => this.s.emit('room:again') } }),
        el('button', 'btn big', '🏙️ 返回城市', { on: { click: () => this.s.emit('room:leave', { toCity: true }) } }),
        el('button', 'btn', '留在房間看紀錄', { on: { click: () => { this.resultClosed = true; box.classList.add('hidden'); } } })));
      box.innerHTML = ''; box.appendChild(card); box.classList.remove('hidden');
    }

    frame(t) {
      this.scene.frame(t);
      const g = this.g;
      if (g && g.deadline && g.phase !== 'ended') {
        const remain = Math.max(0, g.deadline - this.serverNow()), sec = Math.ceil(remain / 1000);
        const tm = $('rTimer');
        if (tm._v !== sec) { tm._v = sec; tm.firstChild.textContent = sec; }
        tm.style.setProperty('--p', (g.total ? remain / g.total * 360 : 0).toFixed(1) + 'deg');
        tm.classList.toggle('urgent', sec <= 5 && remain > 0);
      }
    }
  }

  BM.RoomUI = RoomUI;
})(this);

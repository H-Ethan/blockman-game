// 誰是臥底大廳：建立房間、瀏覽公開房間、隨機加入、輸入房間代碼（＋密碼）
(function (root) {
  'use strict';
  const BM = root.BM = root.BM || {};
  const { $, el, kids, toast, showRules, settingsForm } = BM.UI;

  const ERR = {
    NOT_FOUND: '找不到這個房間代碼，請再確認一次', FULL: '這個房間已經滿了', STARTED: '這個房間的遊戲已經開始，第一版不開放中途加入',
    WRONG_PASSWORD: '密碼錯誤，請再試一次', TOO_MANY: '密碼嘗試太多次，請稍後再試', NO_ROOM: '目前沒有可加入的房間',
  };

  class LobbyUI {
    constructor(socket, ctx) {
      this.s = socket; this.ctx = ctx;          // ctx：{ quality(), profile() }
      this.list = []; this.tab = 'list'; this.pending = false; this.pwFor = null;
      this.scene = new BM.RoomScene($('lobbyCanvas'), 'lobby', { quality: ctx.quality });
      document.querySelectorAll('.lobby-tabs .tab').forEach(b => b.onclick = () => this.show(b.dataset.tab));
      $('lobbyRules').onclick = showRules;
      $('lobbyExit').onclick = () => this.s.emit('lobby:exit');
      socket.on('lobby:list', l => { this.list = l; if (this.tab === 'list') this.render(); });
      socket.on('room:needPassword', d => { this.pending = false; this.pwFor = d; this.show('code', true); });
    }
    enter() {
      this.pending = false; this.pwFor = null;
      this.scene.set({ me: this.ctx.profile() });
      requestAnimationFrame(() => this.scene.resize());
      this.show(this.list.length ? 'list' : 'create');
      this.s.emit('lobby:list');
    }
    frame(t) { this.scene.frame(t); }
    resize() { this.scene.resize(); }

    onError(e) {
      this.pending = false;
      const box = $('lobbyErr');
      const text = ERR[e.code] || e.text || '發生錯誤';
      if (e.code === 'NO_ROOM') { this.renderRandom(true); return; }
      if (box) box.textContent = text; else toast(text, true);
      document.querySelectorAll('#lobbyBody button').forEach(b => b.disabled = false);
    }

    show(tab, keepPw) {
      this.tab = tab;
      if (!keepPw && tab !== 'code') this.pwFor = null;
      document.querySelectorAll('.lobby-tabs .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
      this.render();
    }
    busy(btn) { this.pending = true; btn.disabled = true; const e = $('lobbyErr'); if (e) e.textContent = ''; }

    render() {
      const body = $('lobbyBody'); body.innerHTML = '';
      if (this.tab === 'create') {
        const p = this.ctx.profile();
        const get = settingsForm(body, null, { withPrivacy: true, name: `${p.name}的房間` });
        const err = el('p', 'err', '', { id: 'lobbyErr' });
        const btn = el('button', 'btn primary big', '🏠 建立房間');
        btn.onclick = () => {
          const v = get();
          if (v.privacy === 'password' && !/^[A-Za-z0-9]{4,12}$/.test(v.password || '')) { err.textContent = '密碼請用 4～12 個英文字母或數字'; return; }
          this.busy(btn); this.s.emit('room:create', v);
        };
        kids(body, err, kids(el('div', 'row-right'), btn));
      } else if (this.tab === 'list') {
        const head = kids(el('div', 'row-between'), el('span', 'hint', '只列出公開房間；密碼房請用「輸入房間代碼」加入'), el('button', 'link-btn', '🔄 重新整理', { on: { click: () => this.s.emit('lobby:list') } }));
        body.appendChild(head);
        if (!this.list.length) {
          kids(body, kids(el('div', 'empty'), el('div', 'big-ico', '🕵️'), el('p', null, '目前沒有公開房間'),
            el('button', 'btn primary', '🏠 建立一間房間', { on: { click: () => this.show('create') } })));
          return;
        }
        const t = el('table', 'rooms');
        kids(t, kids(el('tr'), el('th', null, '房間名稱'), el('th', null, '人數'), el('th', 'host', '房主'), el('th', null, '狀態'), el('th')));
        for (const r of this.list) {
          const can = r.state === 'waiting' && r.count < r.max;
          const b = el('button', 'btn small ' + (can ? 'primary' : ''), can ? '加入' : (r.state !== 'waiting' ? '遊戲中' : '已滿'));
          b.disabled = !can;
          b.onclick = () => { this.busy(b); this.s.emit('room:join', { code: r.code }); };
          kids(t, kids(el('tr'), el('td', null, r.name), el('td', null, `${r.count}／${r.max}`), el('td', 'host', r.host),
            kids(el('td'), el('span', 'st ' + r.state, r.state === 'waiting' ? '等待中' : '遊戲中')), kids(el('td'), b)));
        }
        kids(body, t, el('p', 'err', '', { id: 'lobbyErr' }));
      } else if (this.tab === 'random') {
        this.renderRandom(false);
      } else if (this.tab === 'code') {
        const err = el('p', 'err', '', { id: 'lobbyErr' });
        if (this.pwFor) {
          const pw = el('input', null, null, { type: 'password', maxLength: 32, placeholder: '輸入房間密碼', autocomplete: 'off' });
          const btn = el('button', 'btn primary big', '🔓 進入房間');
          const go = () => { if (!pw.value.trim()) { err.textContent = '請輸入密碼'; return; } this.busy(btn); this.s.emit('room:join', { code: this.pwFor.code, password: pw.value.trim() }); };
          btn.onclick = go; pw.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
          kids(body, el('p', null, `「${this.pwFor.name}」（代碼 ${this.pwFor.code}）是密碼房間`), kids(el('label', 'fld'), '房間密碼', pw), err,
            kids(el('div', 'row-right'), el('button', 'btn', '換一個代碼', { on: { click: () => { this.pwFor = null; this.render(); } } }), btn));
          setTimeout(() => pw.focus(), 30);
          return;
        }
        const code = el('input', 'code-input', null, { type: 'text', maxLength: 5, placeholder: 'ABCDE', autocomplete: 'off' });
        code.addEventListener('input', () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
        const btn = el('button', 'btn primary big', '加入房間');
        const go = () => { if (code.value.length < 5) { err.textContent = '房間代碼是 5 個英文或數字'; return; } this.busy(btn); this.s.emit('room:join', { code: code.value }); };
        btn.onclick = go; code.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        kids(body, kids(el('label', 'fld'), '房間代碼（房間代碼與密碼是不同的資訊）', code), err, kids(el('div', 'row-right'), btn));
        setTimeout(() => code.focus(), 30);
      }
    }

    renderRandom(none) {
      this.tab = 'random';
      document.querySelectorAll('.lobby-tabs .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === 'random'));
      const body = $('lobbyBody'); body.innerHTML = '';
      const btn = el('button', 'btn primary big', '🎲 幫我找一間房間');
      btn.onclick = () => { this.busy(btn); this.s.emit('room:random'); };
      kids(body, kids(el('div', 'empty'), el('div', 'big-ico', none ? '😢' : '🎲'),
        el('p', null, none ? '目前沒有可加入的房間（需要是公開、還沒開始、還有空位的房間）' : '自動加入一間還沒開始、還有空位的公開房間'),
        none ? kids(el('div', 'row-center'), btn, el('button', 'btn gold big', '🏠 建立房間', { on: { click: () => this.show('create') } })) : btn,
        el('p', 'err', '', { id: 'lobbyErr' })));
    }
  }

  BM.LobbyUI = LobbyUI;
})(this);

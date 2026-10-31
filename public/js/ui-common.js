// 介面共用：元素建立（一律用 textContent，避免 HTML 注入）、提示、對話框、規則說明、房間設定表單
(function (root) {
  'use strict';
  const BM = root.BM = root.BM || {};
  const R = BM.UC;
  const $ = id => document.getElementById(id);

  function el(tag, cls, text, attrs) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
      else if (k in e && typeof v !== 'string') e[k] = v;
      else e.setAttribute(k, v);
    }
    return e;
  }
  function kids(parent, ...list) { for (const c of list.flat()) if (c) parent.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); return parent; }

  let toastTimer = 0;
  function toast(text, isErr) {
    const t = $('toast'); t.textContent = text; t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 2800);
  }
  function modal(build) {
    const body = $('modalBody'); body.innerHTML = '';
    build(body);
    $('modal').classList.remove('hidden');
  }
  function closeModal() { $('modal').classList.add('hidden'); }
  $('modalX').onclick = closeModal;
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  function showRules() {
    modal(b => {
      kids(b, el('h3', null, '📖 誰是臥底：規則說明'));
      const dl = el('dl', 'rules');
      for (const [k, v] of R.RULES) kids(dl, el('dt', null, k), el('dd', null, v));
      kids(dl, el('dt', null, '人數配置'));
      const t = el('table', 'role-table');
      kids(t, kids(el('tr'), el('th', null, '人數'), el('th', null, '不含白板（平民／臥底）'), el('th', null, '含白板（平民／臥底／白板）')));
      for (let n = R.MIN_PLAYERS; n <= R.MAX_PLAYERS; n++) {
        const row = R.TABLE[n];
        kids(t, kids(el('tr'), el('td', null, n + ' 人'), el('td', null, row.normal.join('／')), el('td', null, row.blank ? row.blank.join('／') : '不開放')));
      }
      kids(dl, kids(el('dd'), t));
      kids(b, dl);
    });
  }

  // 房間設定表單；values：目前設定，opts：{ withPrivacy, name, minMax }
  function settingsForm(container, values, opts) {
    opts = opts || {};
    const s = { ...R.DEFAULTS, ...(values || {}) };
    let privacy = opts.privacy || 'public';
    const grid = el('div', 'form-grid');
    const nameIn = el('input', null, null, { type: 'text', maxLength: 16, placeholder: '例如：週五推理之夜', value: opts.name || '' });
    kids(grid, kids(el('label', 'fld full'), '房間名稱', nameIn));
    let pwIn = null, pwBox = null;
    if (opts.withPrivacy) {
      const seg = el('div', 'seg');
      const bPub = el('button', privacy === 'public' ? 'on' : '', '🏠 公開房間', { type: 'button' });
      const bPw = el('button', privacy === 'password' ? 'on' : '', '🔒 密碼房間', { type: 'button' });
      pwIn = el('input', null, null, { type: 'text', maxLength: 12, placeholder: '4～12 個英文字母或數字', autocomplete: 'off' });
      pwBox = kids(el('label', 'fld' + (privacy === 'password' ? '' : ' hidden')), '房間密碼', pwIn, el('span', 'note', '密碼房不會出現在公開列表與隨機配對，朋友需要「房間代碼＋密碼」才能加入'));
      const set = p => { privacy = p; bPub.classList.toggle('on', p === 'public'); bPw.classList.toggle('on', p === 'password'); pwBox.classList.toggle('hidden', p !== 'password'); };
      bPub.onclick = () => set('public'); bPw.onclick = () => set('password');
      kids(grid, kids(el('div', 'fld'), '房間類型', kids(seg, bPub, bPw)), pwBox);
    }
    const sel = (label, key, list, fmt, note) => {
      const se = el('select');
      for (const v of list) { const o = el('option', null, fmt(v)); o.value = v; if (String(v) === String(s[key])) o.selected = true; se.appendChild(o); }
      const box = kids(el('label', 'fld'), label, se);
      if (note) kids(box, el('span', 'note', note));
      grid.appendChild(box);
      return se;
    };
    const maxList = []; for (let n = Math.max(R.MIN_PLAYERS, opts.minMax || 0); n <= R.MAX_PLAYERS; n++) maxList.push(n);
    const fMax = sel('人數上限', 'max', maxList, v => v + ' 人', '至少 4 人才能開始');
    const fBlank = sel('白板', 'blank', ['false', 'true'], v => (v === 'true' ? '加入白板' : '不加入白板'), '白板沒有詞語，靠別人的描述推理（5 人以上才會加入）');
    fBlank.value = String(!!s.blank);
    const fDesc = sel('每人描述時間', 'descTime', R.TIMES.desc, v => v + ' 秒');
    const fDisc = sel('自由討論時間', 'discussTime', R.TIMES.discuss, v => v + ' 秒');
    const fVote = sel('投票時間', 'voteTime', R.TIMES.vote, v => v + ' 秒');
    const fCat = sel('題庫分類', 'category', R.CATEGORIES, v => v);
    const fDiff = sel('難度', 'difficulty', R.DIFFICULTIES, v => v);
    container.appendChild(grid);
    return () => ({
      name: nameIn.value.trim(), privacy, password: pwIn ? pwIn.value.trim() : undefined,
      settings: { max: +fMax.value, blank: fBlank.value === 'true', descTime: +fDesc.value, discussTime: +fDisc.value, voteTime: +fVote.value, category: fCat.value, difficulty: fDiff.value },
    });
  }

  function summaryChips(s) {
    const box = el('div', 'summary');
    kids(box, el('span', 'tag', `上限 ${s.max} 人`), el('span', 'tag', s.blank ? '含白板' : '不含白板'),
      el('span', 'tag', `描述 ${s.descTime} 秒`), el('span', 'tag', `討論 ${s.discussTime} 秒`), el('span', 'tag', `投票 ${s.voteTime} 秒`),
      el('span', 'tag', `題庫：${s.category}／${s.difficulty}`));
    return box;
  }
  const hhmmss = t => { const d = new Date(t); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':'); };

  BM.UI = { $, el, kids, toast, modal, closeModal, showRules, settingsForm, summaryChips, hhmmss };
})(this);

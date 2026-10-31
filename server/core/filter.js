// 文字安全：暱稱檢查、聊天清理、不當字詞遮蔽、角色外觀驗證
const BLOCK = [
  '幹你', '幹妳', '操你', '靠北', '靠杯', '三小', '白痴', '白癡', '智障', '腦殘', '去死', '傻逼', '煞筆', '垃圾人',
  '雞巴', '機巴', '屌', '婊', '賤人', '王八', '畜生', '殺人', '強姦', '色情', '做愛', '性交', '肏', '屄',
  'fuck', 'shit', 'bitch', 'dick', 'asshole', 'cunt', 'nigger', 'nigga', 'nazi', 'porn', 'penis', 'pussy', 'whore', 'slut',
];
const RESERVED = ['系統', '管理員', '官方', 'admin', 'system', 'gm', 'moderator'];

const CTRL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]', 'g');
const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}_]/gu, '');
const clean = (s, max) => {
  const t = String(s == null ? '' : s).replace(CTRL, '').replace(/\s+/g, ' ').trim();
  return Array.from(t).slice(0, max).join('');
};
const hasBad = s => { const n = norm(s); return BLOCK.some(w => n.includes(w)); };
function mask(s) {
  let out = s;
  for (const w of BLOCK) {
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, m => '＊'.repeat(Array.from(m).length));
  }
  return out;
}

function checkName(raw) {
  const name = clean(raw, 10);
  if (!name) return { error: '請輸入暱稱' };
  if (Array.from(name).length < 1) return { error: '暱稱太短' };
  if (hasBad(name)) return { error: '暱稱含有不適當的內容，請換一個' };
  if (RESERVED.some(w => norm(name) === norm(w) || norm(name).startsWith(norm(w)))) return { error: '這個暱稱不能使用，請換一個' };
  return { name };
}

// 角色外觀（選項需和前端 avatar.js 一致）
const HEX = /^#[0-9a-f]{6}$/i;
const EXPRS = ['smile', 'happy', 'cool', 'surprise', 'sleepy', 'angry'];
const HATS = ['none', 'cap', 'top', 'beanie', 'detective', 'crown', 'bow'];
const GLASSES = ['none', 'round', 'sun', 'mono'];
const SKINS = ['#ffd9b8', '#f5c49c', '#e0a476', '#b9784f', '#8a5536', '#ffe7d1'];

function checkProfile(raw) {
  if (!raw || typeof raw !== 'object') return { error: '角色資料錯誤' };
  const n = checkName(raw.name);
  if (n.error) return n;
  const pick = (v, list, def) => (list.includes(v) ? v : def);
  const color = (v, def) => (HEX.test(v) ? v.toLowerCase() : def);
  return {
    profile: {
      name: n.name,
      body: color(raw.body, '#ff6b6b'),
      accent: color(raw.accent, '#3b5bdb'),
      hair: color(raw.hair, '#3a2a1e'),
      skin: pick(raw.skin, SKINS, SKINS[0]),
      expr: pick(raw.expr, EXPRS, 'smile'),
      hat: pick(raw.hat, HATS, 'none'),
      glasses: pick(raw.glasses, GLASSES, 'none'),
    },
  };
}

module.exports = { clean, mask, hasBad, norm, checkName, checkProfile };

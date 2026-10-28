// 場景地圖：宇宙廣場（固定配置）與搶星星草原（每回合隨機）
const rid = () => Math.random().toString(36).slice(2, 9);
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------- 宇宙廣場 ----------------
// 座標是俯視地面：x 左右、y 前後（越大越靠近鏡頭）
const PLAZA_W = 960, PLAZA_H = 600;

function plazaMap() {
  const o = [];
  const add = (type, x, y, w, d, extra) => o.push({ id: type + o.length, type, x, y, w, d, seed: o.length * 7919 + 13, ...extra });

  // 主角：你畫我猜（巨大畫架造型的建築）
  add('building', 350, 100, 260, 100, { variant: 'drawguess', h: 132 });
  // 搶星星草原的拱門（兩根柱子，中間可以走進去）
  add('pillar', 112, 150, 22, 18, { variant: 'stars' });
  add('pillar', 206, 150, 22, 18, { variant: 'stars' });
  add('gate', 112, 150, 116, 18, { variant: 'stars', solid: false });
  // 施工中的空地（未來的建築）
  add('lot', 712, 96, 176, 96, { label: '新遊戲館 建設中' });
  // 中央噴水池
  add('fountain', 430, 330, 100, 56);
  // 長椅、路燈
  add('bench', 300, 330, 54, 14); add('bench', 606, 330, 54, 14);
  add('bench', 300, 440, 54, 14); add('bench', 606, 440, 54, 14);
  for (const [x, y] of [[330, 232], [620, 232], [250, 520], [700, 520], [90, 300], [860, 300]]) add('lamp', x, y, 8, 6);
  // 外圍樹木
  const trees = [[40, 60], [270, 40], [300, 110], [650, 40], [640, 120], [920, 40], [30, 200], [930, 210],
    [40, 420], [80, 540], [920, 420], [880, 545], [180, 560], [780, 570], [150, 300], [810, 300]];
  for (const [x, y] of trees) add('tree', x - 9, y, 18, 10);

  // 不擋路的裝飾（例如拱門上方的橫梁）從碰撞清單裡移除
  const obstacles = o.filter(x => x.solid !== false);
  const decor = o.filter(x => x.solid === false);

  const portals = [
    { id: 'drawguess', x: 448, y: 200, w: 64, d: 22, title: '你畫我猜', color: '#ffb347',
      exit: { x: 480, y: 258, facing: 1 } },
    { id: 'stars', x: 136, y: 150, w: 68, d: 20, title: '搶星星草原', color: '#ffe066',
      exit: { x: 170, y: 214, facing: 1 } },
  ];
  return { obstacles, decor, portals };
}

// ---------------- 搶星星草原 ----------------
function meadowMap(W, H) {
  const list = [];
  const GAP = 44;
  const ok = r => r.x >= 24 && r.y >= 36 && r.x + r.w <= W - 24 && r.y + r.d <= H - 24 &&
    !list.some(o => r.x < o.x + o.w + GAP && r.x + r.w > o.x - GAP && r.y < o.y + o.d + GAP && r.y + r.d > o.y - GAP);
  const place = (n, make) => {
    for (let k = 0, tries = 0; k < n && tries < 400; tries++) {
      const r = make();
      if (ok(r)) { r.id = rid(); r.seed = Math.floor(Math.random() * 1e9); list.push(r); k++; }
    }
  };
  place(4, () => {
    const len = rand(110, 230);
    return Math.random() < 0.5
      ? { type: 'wall', x: rand(0, W), y: rand(0, H), w: len, d: 18 }
      : { type: 'wall', x: rand(0, W), y: rand(0, H), w: 18, d: len };
  });
  place(6, () => ({ type: 'rock', x: rand(0, W), y: rand(0, H), w: rand(28, 48), d: rand(16, 24) }));
  place(10, () => ({ type: 'tree', x: rand(0, W), y: rand(0, H), w: 18, d: 10 }));
  for (const o of list) for (const key of ['x', 'y', 'w', 'd']) o[key] = Math.round(o[key]);
  return list;
}

module.exports = { PLAZA_W, PLAZA_H, plazaMap, meadowMap };

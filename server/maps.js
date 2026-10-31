// 場景地圖：宇宙廣場（重新規劃中，目前只有公共設施，沒有遊戲建築）

// ---------------- 宇宙廣場 ----------------
// 座標是俯視地面：x 左右、y 前後（越大越靠近鏡頭）
const PLAZA_W = 960, PLAZA_H = 600;

function plazaMap() {
  const o = [];
  const add = (type, x, y, w, d, extra) => o.push({ id: type + o.length, type, x, y, w, d, seed: o.length * 7919 + 13, ...extra });

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

  // 建築入口：目前沒有，之後新蓋的建築在這裡加上入口
  const portals = [];
  return { obstacles, decor, portals };
}

module.exports = { PLAZA_W, PLAZA_H, plazaMap };

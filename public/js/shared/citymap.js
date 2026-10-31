// 色塊人城市地圖（前後端共用）：地形、物件（含碰撞範圍）、建築入口
// 世界座標：x、y 為地面（單位：1 格 = 32），z 向上
// 等角投影：畫面 x = x − y，畫面 y = (x + y) / 2 − z
(function (root) {
  'use strict';
  const T = 32, COLS = 34, ROWS = 30, W = COLS * T, H = ROWS * T;

  // ---------- 地形 ----------
  // 道路 A：沿 x 方向（y 格 14～16）；道路 B：沿 y 方向（x 格 17～19）
  function terrain(tx, ty) {
    const roadA = ty >= 14 && ty <= 16, roadB = tx >= 17 && tx <= 19;
    if (roadA && roadB) return 'cross';
    if (roadA) return (tx === 7 || tx === 8) ? 'zebraA' : (ty === 15 ? 'roadMidA' : 'road');
    if (roadB) return (ty === 21 || ty === 22) ? 'zebraB' : (tx === 18 ? 'roadMidB' : 'road');
    if (ty === 13 || ty === 17 || tx === 16 || tx === 20) return 'walk';
    if (tx < 16 && ty < 13) {                       // 西北：誰是臥底
      if ((tx === 7 || tx === 8) && ty >= 10) return 'path';
      if (tx >= 2 && tx <= 12 && ty >= 2 && ty <= 10) return 'apron';
      return 'grass';
    }
    if (tx < 16 && ty > 17) {                       // 西南：中央廣場
      if ((tx === 7 || tx === 8) && ty === 18) return 'path';
      if (tx >= 2 && tx <= 14 && ty >= 19 && ty <= 27) return 'plaza';
      return 'grass';
    }
    if (tx > 20 && ty < 13) return (tx >= 23 && tx <= 31 && ty >= 2 && ty <= 11) ? 'dirt' : 'grass';   // 東北：施工中
    if (tx > 20 && ty > 17) return (tx >= 24 && tx <= 30 && ty >= 20 && ty <= 26) ? 'lot' : 'grass';  // 東南：預定地
    return 'grass';
  }

  // ---------- 物件 ----------
  const objects = [];
  const add = o => { o.id = 'o' + objects.length; if (o.solid === undefined) o.solid = true; objects.push(o); return o; };
  const at = (tx, ty, w, d) => ({ x: Math.round(tx * T - w / 2), y: Math.round(ty * T - d / 2), w, d });
  const tree = (tx, ty, kind) => add({ type: 'tree', kind: kind || 'round', ...at(tx, ty, 14, 14), seed: objects.length * 131 + 7 });
  const lamp = (tx, ty) => add({ type: 'lamp', ...at(tx, ty, 8, 8) });
  const bench = (tx, ty, along) => add({ type: 'bench', along, ...(along === 'x' ? at(tx, ty, 60, 16) : at(tx, ty, 16, 60)) });
  const barrierX = (tx0, tx1, ty) => { for (let t = tx0; t < tx1; t += 1) add({ type: 'barrier', along: 'x', ...at(t + 0.5, ty, 32, 6) }); };
  const barrierY = (tx, ty0, ty1) => { for (let t = ty0; t < ty1; t += 1) add({ type: 'barrier', along: 'y', ...at(tx, t + 0.5, 6, 32) }); };

  // 誰是臥底（第一棟可玩的建築）
  add({ type: 'undercover', x: 3 * T, y: 3 * T, w: 9 * T, d: 7 * T, h: 128 });
  add({ type: 'steps', x: 6.4 * T, y: 10 * T, w: 2.2 * T, d: 14, h: 4, solid: false });
  add({ type: 'planter', ...at(4.8, 10.6, 90, 18), flower: '#ff8fab' });
  add({ type: 'planter', ...at(10.2, 10.6, 90, 18), flower: '#ffd166' });
  add({ type: 'vending', ...at(12.7, 9.3, 22, 20) });
  lamp(5.6, 12.2); lamp(9.4, 12.2);
  bench(11.2, 12.1, 'x');
  tree(1.1, 1.2); tree(1.0, 5.4, 'pine'); tree(1.2, 9.5); tree(14.4, 1.4, 'pine'); tree(14.6, 5.8); tree(14.3, 10.2, 'pine'); tree(6.5, 1.0); tree(10.5, 1.0, 'pine');
  add({ type: 'hydrant', ...at(2.2, 12.3, 10, 10) });

  // 路口指示牌
  add({ type: 'signpost', ...at(15.5, 12.5, 8, 8), lines: ['↖ 誰是臥底', '↗ 施工中', '↙ 中央廣場', '↘ 建築預定地'] });

  // 道路兩側路燈
  for (const tx of [3, 11, 24, 31]) { lamp(tx, 13.3); lamp(tx, 17.7); }
  for (const ty of [4, 10, 21.5, 27]) { lamp(16.3, ty); lamp(20.7, ty); }

  // 中央廣場
  add({ type: 'fountain', ...at(8, 23, 84, 84), r: 46 });
  bench(8, 20.1, 'x'); bench(8, 25.9, 'x'); bench(4.1, 23, 'y'); bench(11.9, 23, 'y');
  for (const [tx, ty] of [[2.7, 19.7], [13.3, 19.7], [2.7, 26.4], [13.3, 26.4]]) add({ type: 'bush', ...at(tx, ty, 36, 36), seed: Math.round(tx * ty * 10) });
  lamp(5, 19.4); lamp(11, 19.4); lamp(5, 26.7); lamp(11, 26.7);
  add({ type: 'board', ...at(1.0, 23, 10, 56), title: '城市公告' });
  tree(0.9, 18.9); tree(1.0, 28.4, 'pine'); tree(6.0, 28.9); tree(10.6, 28.8, 'pine'); tree(15.0, 28.7); tree(15.2, 19.4, 'pine');

  // 東北：施工中（只有圍籬，沒有入口）
  barrierX(23, 32, 1.75); barrierX(23, 32, 11.3); barrierY(22.75, 2, 11); barrierY(31.3, 2, 11);
  add({ type: 'crane', ...at(29, 4.4, 28, 28) });
  add({ type: 'bricks', ...at(25.4, 4, 44, 30) });
  add({ type: 'bricks', ...at(26.6, 8.6, 40, 26) });
  add({ type: 'mixer', ...at(29.4, 8.8, 34, 26) });
  for (const [tx, ty] of [[22.2, 12.3], [24.5, 12.4], [30.5, 12.4]]) add({ type: 'cone', ...at(tx, ty, 10, 10) });
  add({ type: 'lotsign', ...at(27, 12.35, 70, 8), title: '施工中', sub: '新桌遊館 敬請期待' });
  tree(32.6, 1.0, 'pine'); tree(21.5, 1.0); tree(32.7, 6.5); tree(21.6, 6.5, 'pine'); tree(32.6, 12.0);

  // 東南：建築預定地
  for (const [tx, ty] of [[24, 20], [30, 20], [24, 26.6], [30, 26.6]]) add({ type: 'stake', ...at(tx, ty, 8, 8) });
  add({ type: 'lotsign', ...at(27, 27.7, 70, 8), title: '建築預定地', sub: '更多桌遊建築即將登場' });
  tree(22.0, 19.0, 'blossom'); tree(32.3, 19.2, 'blossom'); tree(22.0, 28.6); tree(32.5, 28.5, 'pine'); tree(32.4, 23.5, 'blossom');
  bench(22.2, 23.5, 'y');

  // 建築入口（感應區在門口正前方，角色碰到門牆時剛好站在感應區內）
  const portals = [{
    id: 'undercover', title: '誰是臥底', color: '#ffcf5a',
    x: 6.6 * T, y: 10 * T, w: 1.8 * T, d: 30,
    exit: { x: 7.5 * T, y: 12.6 * T },
  }];

  const CITY = {
    T, COLS, ROWS, W, H, terrain, objects, portals,
    solids: objects.filter(o => o.solid),
    spawn: { x: 8 * T, y: 27.2 * T },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CITY;
  else (root.BM = root.BM || {}).CITY = CITY;
})(this);

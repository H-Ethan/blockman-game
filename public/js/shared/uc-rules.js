// 誰是臥底：身分配置、設定選項與規則說明（前後端共用，畫面上的說明和伺服器判定用同一份）
(function (root) {
  'use strict';
  const R = {};
  R.MIN_PLAYERS = 4;
  R.MAX_PLAYERS = 12;

  // 人數 → 不含白板 [平民, 臥底]；含白板 [平民, 臥底, 白板]（4 人不開放白板）
  R.TABLE = {
    4: { normal: [3, 1], blank: null },
    5: { normal: [4, 1], blank: [3, 1, 1] },
    6: { normal: [5, 1], blank: [4, 1, 1] },
    7: { normal: [5, 2], blank: [4, 2, 1] },
    8: { normal: [6, 2], blank: [5, 2, 1] },
    9: { normal: [7, 2], blank: [6, 2, 1] },
    10: { normal: [7, 3], blank: [6, 3, 1] },
    11: { normal: [8, 3], blank: [7, 3, 1] },
    12: { normal: [9, 3], blank: [8, 3, 1] },
  };
  R.roles = function (n, wantBlank) {
    const row = R.TABLE[n];
    if (!row) return null;
    if (wantBlank && row.blank) return { civ: row.blank[0], spy: row.blank[1], blank: row.blank[2] };
    return { civ: row.normal[0], spy: row.normal[1], blank: 0 };
  };

  R.CATEGORIES = ['全部', '食物', '動物', '生活用品', '交通工具', '校園', '場所'];
  R.DIFFICULTIES = ['全部', '簡單', '普通', '困難'];
  R.TIMES = {
    desc: [15, 20, 30, 45, 60],
    discuss: [30, 45, 60, 90, 120, 180],
    vote: [15, 20, 30, 45],
  };
  R.DEFAULTS = { max: 8, blank: false, descTime: 30, discussTime: 60, voteTime: 20, category: '全部', difficulty: '全部' };

  R.WORD_CONFIRM_SEC = 20;   // 查看詞語
  R.REVEAL_SEC = 4;          // 公布淘汰結果
  R.BLANK_GUESS_SEC = 15;    // 白板猜詞
  R.SEAT_HOLD_SEC = 60;      // 斷線保留席位

  R.ROLE_NAMES = { civ: '平民', spy: '臥底', blank: '白板' };
  R.PHASE_NAMES = {
    word: '查看詞語', describe: '輪流描述', discuss: '自由討論', vote: '投票',
    pk_desc: '平票 PK：補充描述', pk_vote: '平票 PK：重新投票', reveal: '公布結果',
    blank_guess: '白板猜詞', ended: '遊戲結束',
  };

  // 規則說明（和伺服器判定一致）
  R.RULES = [
    ['身分', '平民拿到相同的平民詞；臥底拿到相似但不同的臥底詞；白板沒有詞語。一般玩家只知道自己的詞，不知道自己是平民還是臥底；白板會知道自己是白板。'],
    ['查看詞語', '每人按住或切換顯示自己的詞語，全員確認或 20 秒後開始描述。'],
    ['輪流描述', '依座位順序每人說一句描述。第一輪隨機決定起始玩家（白板不會第一個發言），之後每輪換下一個座位開始，跳過已淘汰的玩家。超時記為「本輪未描述」。描述不能直接包含自己的詞語；也請不要拆字、用拼音或諧音報答案（系統無法完全辨識，請大家自律）。'],
    ['自由討論', '所有存活玩家描述完後，進入限時自由討論。'],
    ['投票', '每位存活玩家投給另一位存活玩家，不能投自己；截止前可以改票，以最後一次為準。票數在投票結束前不公開，所有人都投完會提前結算。未投票視為棄權；全員棄權則本輪無人淘汰。'],
    ['平票 PK', '最高票平手時，平票玩家各補充一句描述，所有存活玩家只能在平票玩家中重新投票（仍不能投自己）。再次平票則本輪無人淘汰。'],
    ['淘汰', '被淘汰者公開身分，詞語保留到整局結束才公開。淘汰者可以觀戰，並在只有淘汰者看得到的觀戰頻道聊天。'],
    ['白板猜詞', '白板被投票淘汰後，有 15 秒可以猜一次平民詞：猜中則白板單獨獲勝；猜錯或超時則正式淘汰，繼續判定勝負。'],
    ['勝負判定', '① 白板被淘汰後猜中平民詞：白板單獨獲勝。② 所有臥底與白板都已淘汰：平民獲勝。③ 存活臥底與白板合計人數 ≥ 存活平民人數：非平民陣營獲勝（存活的臥底與白板為勝方）。④ 其餘情況進入下一輪。本作不採用「剩三人時臥底直接獲勝」。'],
    ['斷線', '斷線保留席位 60 秒，期間遊戲照常進行；超過 60 秒視為離席，遊戲中視為棄權淘汰（不觸發白板猜詞）。'],
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
  else (root.BM = root.BM || {}).UC = R;
})(this);

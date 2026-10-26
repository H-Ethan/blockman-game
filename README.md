# 色塊人大亂鬥 Blockman Brawl

自訂或手繪色塊人角色，和朋友多人即時連線搶星星！（Node.js + Socket.io）

## 玩法
1. 在角色編輯器選擇「色塊模式」設定頭、身體、腳的顏色，或用「手繪模式」畫出自己的角色
2. 輸入暱稱，按「開始遊戲」
3. 方向鍵 / WASD（手機用觸控方向鍵）移動，先搶到 10 顆星星的人獲勝

## 本機執行
```
npm install
npm start
```
開啟 http://localhost:3000

## 部署到 Render
New → Web Service → 選擇此儲存庫  
Build Command：`npm install`　Start Command：`npm start`　Instance Type：Free

# 色塊人大亂鬥 Blockman Brawl

自訂或手繪色塊人角色，和朋友多人即時連線搶星星！（Node.js + Socket.io）

## 玩法
1. 在角色編輯器選擇「色塊模式」設定頭、身體、腳的顏色，或用「手繪模式」畫出自己的角色
2. 輸入暱稱，按「開始遊戲」
3. 方向鍵 / WASD（手機用觸控方向鍵）移動，繞過樹木、牆壁和石頭，先搶到 10 顆星星的人獲勝

## 畫面
- 2.5D 俯視角：物件有頂面、正面與投影，依前後深度排序
- 每回合隨機生成地圖（磚牆、石頭、闊葉樹、松樹）
- 高解析度畫布，支援 Retina / 手機高 DPI
- 被樹擋住時樹冠會變透明，被牆擋住時仍看得到自己的身影

## 本機執行
```
npm install
npm start
```
開啟 http://localhost:3000

## 部署到 Render
New → Web Service → 選擇此儲存庫  
Build Command：`npm install`　Start Command：`npm start`　Instance Type：Free

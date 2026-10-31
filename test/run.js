// npm test：用縮短 20 倍的計時啟動一台測試伺服器，跑完整的多人整合測試
const { spawn } = require('child_process');
const PORT = 3900 + Math.floor(Math.random() * 90);
const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT, UC_TIME_SCALE: '0.05' }, stdio: 'ignore' });
setTimeout(() => {
  const t = spawn(process.execPath, ['test/server-test.js', String(PORT)], { stdio: 'inherit' });
  t.on('exit', code => { srv.kill(); process.exit(code); });
}, 800);

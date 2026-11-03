const { spawn } = require('child_process');
const PORT = 8125;
const srv = spawn(process.execPath, ['server/index.js'], {
  env: Object.assign({}, process.env, { PORT: String(PORT) }),
  stdio: ['ignore', 'pipe', 'pipe']
});
srv.stdout.on('data', (d) => process.stdout.write('[srv] ' + d));
srv.stderr.on('data', (d) => process.stderr.write('[srv-err] ' + d));

setTimeout(() => {
  const w = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?mode=small&room=' + (process.env.ROOM || 'E2E') + '&name=Bot');
  w.onopen = () => {
    console.log('[bot] 已连接');
    setInterval(() => {
      if (w.readyState === 1) w.send(JSON.stringify({ t: 'input', mx: -1, my: 0, aim: 3.14, shoot: false }));
    }, 33);
  };
  w.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'start') console.log('[bot] 开局');
  };
}, 400);

setTimeout(() => process.exit(0), 60000);

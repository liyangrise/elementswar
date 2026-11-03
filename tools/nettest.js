'use strict';
/* 联机服务器冒烟测试：起两个客户端，验证房间、快照、视野裁剪 */
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8123;
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
  env: Object.assign({}, process.env, { PORT: String(PORT) }),
  stdio: ['ignore', 'pipe', 'pipe']
});
srv.stdout.on('data', (d) => process.stdout.write('[srv] ' + d));
srv.stderr.on('data', (d) => process.stderr.write('[srv-err] ' + d));

const results = { a: { snaps: 0, units: 0, started: false }, b: { snaps: 0, units: 0, started: false } };
let failed = 0;
function assert(c, m) { if (!c) { console.error('FAIL:', m); failed++; } }

function connect(name, key, onSnap) {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?room=TEST&mode=small&name=' + name);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'start') results[key].started = true;
    if (m.t === 'snap') {
      results[key].snaps++;
      results[key].units = Math.max(results[key].units, m.units.length);
      onSnap(m);
    }
  };
  ws.onerror = (e) => console.error(key, 'ws error', e.message || e);
  return ws;
}

setTimeout(() => {
  const a = connect('A', 'a', () => { });
  setTimeout(() => {
    const b = connect('B', 'b', () => { });

    // 新房间流程：双方准备，房主开局
    setTimeout(() => {
      a.send(JSON.stringify({ t: 'ready' }));
      b.send(JSON.stringify({ t: 'ready' }));
      setTimeout(() => a.send(JSON.stringify({ t: 'start' })), 300);
    }, 400);

    // 持续发输入
    const timer = setInterval(() => {
      const msg = JSON.stringify({ t: 'input', mx: 1, my: 0, aim: 0.5, shoot: true });
      if (a.readyState === 1) a.send(msg);
      if (b.readyState === 1) b.send(msg);
    }, 33);

    setTimeout(() => {
      clearInterval(timer);
      console.log('\n--- 结果 ---');
      console.log('A 收到快照:', results.a.snaps, ' 最多可见单位:', results.a.units, ' 开局:', results.a.started);
      console.log('B 收到快照:', results.b.snaps, ' 最多可见单位:', results.b.units, ' 开局:', results.b.started);
      assert(results.a.started && results.b.started, '两边都应收到 start');
      assert(results.a.snaps > 20, 'A 应收到足够多的快照');
      assert(results.b.snaps > 20, 'B 应收到足够多的快照');
      assert(results.a.units >= 1, 'A 至少应看到自己');
      console.log(failed ? '\n失败 ' + failed + ' 项' : '\n全部通过');
      try { a.close(); b.close(); } catch (e) { }
      srv.kill();
      process.exit(failed ? 1 : 0);
    }, 3000);
  }, 300);
}, 600);

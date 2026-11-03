'use strict';
/* 踢人测试 */
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8128;
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
  env: Object.assign({}, process.env, { PORT: String(PORT) }),
  stdio: ['ignore', 'pipe', 'pipe']
});
srv.stdout.on('data', (d) => process.stdout.write('[srv] ' + d));

let failed = 0;
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); failed++; } else console.log('OK  ' + m); };

function mk(name) {
  const st = { joined: null, kicked: false, lobby: null };
  st.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?mode=small&room=KICK&name=' + name);
  st.ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'joined') st.joined = m;
    if (m.t === 'kicked') st.kicked = true;
    if (m.t === 'lobby') st.lobby = m;
  };
  st.send = (o) => { if (st.ws.readyState === 1) st.ws.send(JSON.stringify(o)); };
  return st;
}

setTimeout(() => {
  const A = mk('Host');
  setTimeout(() => {
    const B = mk('Victim');
    setTimeout(() => {
      ok(A.joined && A.joined.host, 'A 是房主');
      ok(B.joined && !B.joined.host, 'B 不是房主');
      const before = A.lobby ? A.lobby.players.length : 0;
      ok(before === 2, '大厅 2 人，实得 ' + before);
      A.send({ t: 'kick', id: B.joined.id });
      setTimeout(() => {
        ok(B.kicked, 'B 收到 kicked');
        ok(A.lobby && A.lobby.players.length === 1, '踢出后剩 1 人，实得 ' + (A.lobby ? A.lobby.players.length : '?'));
        // 非房主不能踢人
        const C = mk('Guest');
        setTimeout(() => {
          C.send({ t: 'kick', id: A.joined.id });
          setTimeout(() => {
            ok(!A.kicked, '非房主踢人无效');
            console.log(failed ? '\n失败 ' + failed + ' 项' : '\n全部通过');
            try { srv.kill(); } catch (e) { }
            process.exit(failed ? 1 : 0);
          }, 400);
        }, 400);
      }, 500);
    }, 500);
  }, 500);
}, 700);

'use strict';
/* 房间系统测试：房主 / 准备 / 开始 / 踢人 / 快照 */
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8127;
const ROOM = 'RM' + Math.floor(Math.random() * 90 + 10);
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
  env: Object.assign({}, process.env, { PORT: String(PORT) }),
  stdio: ['ignore', 'pipe', 'pipe']
});
srv.stdout.on('data', (d) => process.stdout.write('[srv] ' + d));

let failed = 0;
function assert(c, m) { if (!c) { console.error('FAIL:', m); failed++; } }

function client(name, key) {
  const st = { name, lobby: null, joined: null, started: false, snaps: 0, kicked: false, ended: false, err: null };
  const w = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?mode=medium&room=' + ROOM + '&name=' + name);
  w.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'joined') st.joined = m;
    else if (m.t === 'lobby') st.lobby = m;
    else if (m.t === 'start') st.started = true;
    else if (m.t === 'snap') st.snaps++;
    else if (m.t === 'kicked') st.kicked = true;
    else if (m.t === 'end') st.ended = true;
    else if (m.t === 'error') st.err = m.msg;
  };
  st.ws = w;
  st.send = (o) => { if (w.readyState === 1) w.send(JSON.stringify(o)); };
  return st;
}

setTimeout(() => {
  const A = client('Host', 'a');
  setTimeout(() => {
    const B = client('Guest', 'b');
    setTimeout(() => {
      assert(A.joined && A.joined.host === true, 'A 应是房主');
      assert(B.joined && B.joined.host === false, 'B 不是房主');
      assert(A.lobby && A.lobby.players.length === 2, '大厅应有 2 人');
      assert(A.lobby.players[0].host === true, '大厅里第一个人是房主');

      // 未准备时开始应被拒绝
      A.send({ t: 'start' });
      setTimeout(() => {
        assert(!A.started, '未全准备时不应开始');
        assert(A.err && A.err.indexOf('准备') >= 0, '应提示"还有玩家没准备", 实得 ' + A.err);

        // 两人准备
        A.send({ t: 'ready' });
        B.send({ t: 'ready' });

        setTimeout(() => {
          assert(A.lobby.allReady === true, '大厅应标记全员准备');
          assert(A.lobby.canStart === true, '房主应看到 canStart');
          assert(B.lobby.canStart === false, '非房主不能开始');

          A.send({ t: 'start' });

          setTimeout(() => {
            assert(A.started && B.started, '双方都应收到 start');
            assert(A.snaps > 10 && B.snaps > 10, '双方都应收到快照, A=' + A.snaps + ' B=' + B.snaps);

            // 踢人：另开一个观察者 C
            const C = client('Victim', 'c');
            setTimeout(() => {
              assert(!C.joined, '对局进行中不应能加入, 实得 ' + JSON.stringify(C.err));
              console.log('\n--- 结果 ---');
              console.log('A(房主) 开局:', A.started, ' 快照:', A.snaps);
              console.log('B(客人) 开局:', B.started, ' 快照:', B.snaps);
              console.log('C 中途加入被拒:', C.err || '(未拒绝)');
              console.log(failed ? '\n失败 ' + failed + ' 项' : '\n全部通过');
              try { srv.kill(); } catch (e) { }
              process.exit(failed ? 1 : 0);
            }, 700);
          }, 1200);
        }, 400);
      }, 400);
    }, 500);
  }, 400);
}, 700);

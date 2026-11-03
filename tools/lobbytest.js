'use strict';
/* 联机功能测试：房间列表 / 战绩面板 / 商店指令 / 连杀 */
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8141;
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
  env: Object.assign({}, process.env, { PORT: String(PORT) }),
  stdio: ['ignore', 'pipe', 'pipe']
});
srv.stdout.on('data', (d) => process.stdout.write('[srv] ' + d));

let failed = 0;
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); failed++; } else console.log('OK  ' + m); };

function mk(name, room) {
  const st = { board: null, toasts: [], snaps: 0, started: false, you: null, lobby: null };
  st.ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?mode=medium&room=' + room + '&name=' + name);
  st.ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'snap') {
      st.snaps++;
      st.you = m.you;
      if (m.board) st.board = m.board;
    } else if (m.t === 'toast') st.toasts.push(m);
    else if (m.t === 'start') st.started = true;
    else if (m.t === 'lobby') st.lobby = m;
  };
  st.send = (o) => { if (st.ws.readyState === 1) st.ws.send(JSON.stringify(o)); };
  return st;
}

setTimeout(async () => {
  const a = mk('Host', 'T1');
  setTimeout(() => {
    const b = mk('Guest', 'T1');
    setTimeout(() => {
      // 房间列表 API
      fetch('http://127.0.0.1:' + PORT + '/api/rooms')
        .then((r) => r.json())
        .then((list) => {
          ok(Array.isArray(list) && list.length >= 1, '房间列表返回 ' + list.length + ' 个房间');
          const r0 = list.find((x) => x.code === 'T1');
          ok(!!r0, '列表里有 T1');
          ok(r0 && r0.mode === 'medium', 'T1 模式是 medium');
          ok(r0 && r0.players === 2, 'T1 人数 2，实得 ' + (r0 && r0.players));

          a.send({ t: 'ready' }); b.send({ t: 'ready' });
          setTimeout(() => {
            a.send({ t: 'start' });
            setTimeout(() => {
              ok(a.started && b.started, '开局成功');

              // 给钱后买东西
              a.send({ t: 'cmd', cmd: 'buy', kind: 'weapon', key: 'rifle' });
              setTimeout(() => {
                var msgs = a.toasts.map((t) => t.msg);
                ok(a.toasts.length > 0, '商店指令有服务端回执：' + JSON.stringify(msgs));
                ok(msgs.some((m) => /资金不足|已经拥有|已购买/.test(m)), '回执内容合理');

                // 战绩面板
                setTimeout(() => {
                  ok(a.board && a.board.length >= 6, '战绩面板有 ' + (a.board ? a.board.length : 0) + ' 行');
                  const row = a.board && a.board[0];
                  ok(row && typeof row.k === 'number' && typeof row.d === 'number',
                    '战绩含击杀/死亡字段: k=' + (row && row.k) + ' d=' + (row && row.d));
                  ok(a.you && a.you.unlocked, '快照含已解锁武器');
                  ok(a.you && a.you.talents, '快照含天赋状态');
                  console.log(failed ? '\n失败 ' + failed + ' 项' : '\n全部通过');
                  try { srv.kill(); } catch (e) { }
                  process.exit(failed ? 1 : 0);
                }, 1200);
              }, 500);
            }, 900);
          }, 500);
        })
        .catch((e) => { console.error('FAIL: fetch rooms', e.message); process.exit(1); });
    }, 500);
  }, 500);
}, 700);

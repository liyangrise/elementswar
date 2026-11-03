const fs = require('fs');
let s = fs.readFileSync('js/main.js', 'utf8');
let n = 0;
function rep(a, b) { if (s.includes(a)) { s = s.replace(a, b); n++; } else console.log('MISS:', a.slice(0, 60).replace(/\n/g, '|')); }

// ---------- 1. 选择器换成新的 mode-grid ----------
rep("document.querySelectorAll('.modes button')", "document.querySelectorAll('.mode-grid button')");

// ---------- 2. 版本号写两处 ----------
rep("  document.getElementById('ver').textContent = EW.VERSION;",
`  document.getElementById('ver').textContent = EW.VERSION;
  var _ver2 = document.getElementById('ver2');
  if (_ver2) _ver2.textContent = EW.VERSION;`);

// ---------- 3. 大厅设置按钮 ----------
rep("  document.getElementById('btnChangelog').onclick = showChangelog;",
`  var _bh = document.getElementById('btnChangelog');
  if (_bh) _bh.onclick = showChangelog;
  var _bhs = document.getElementById('btnHallSettings');
  if (_bhs) _bhs.onclick = function () { clickSfx(); settingsReturn = 'net'; openSettings(); };`);

// ---------- 4. 房间列表卡片 ----------
const roomsStart = s.indexOf('  function renderRooms(list) {');
const roomsEnd = s.indexOf('  function refreshRooms() {', roomsStart);
if (roomsStart < 0 || roomsEnd < 0) { console.error('renderRooms bounds'); process.exit(1); }
const roomsNew = `  function renderRooms(list) {
    var box = document.getElementById('roomList');
    var cnt = document.getElementById('roomCount');
    if (!box) return;
    if (!list || !list.length) {
      box.innerHTML = '<div class="empty"><b>还没有房间</b>在右侧填写昵称，点「进入 / 创建房间」开一局</div>';
      if (cnt) cnt.textContent = '0 个';
      return;
    }
    if (cnt) cnt.textContent = list.length + ' 个';
    var html = '';
    list.forEach(function (r) {
      var full = r.players >= r.max;
      var cls = r.started ? 'play' : (full ? 'full' : 'wait');
      var label = r.started ? '进行中' : (full ? '已满' : '等待中');
      html += '<div class="room">' +
        '<span class="code">' + r.code + '</span>' +
        '<div class="meta"><div class="n">' + r.name + '</div>' +
        '<div class="m">房主 ' + (r.host || '—') + '</div></div>' +
        '<span class="cnt">' + r.players + '/' + r.max + '</span>' +
        '<span class="st ' + cls + '">' + label + '</span>' +
        '<button class="btn sm' + (r.started ? ' ghost' : '') + '" data-room="' + r.code +
        '" data-mode="' + r.mode + '"' + (r.started ? ' disabled' : '') + '>进入</button>' +
        '</div>';
    });
    box.innerHTML = html;
    Array.prototype.forEach.call(box.querySelectorAll('button[data-room]'), function (b) {
      b.onclick = function () {
        clickSfx();
        var name = (document.getElementById('netName').value || '玩家').slice(0, 10);
        startNet({ mode: b.getAttribute('data-mode'), room: b.getAttribute('data-room'), name: name });
      };
    });
  }

`;
s = s.slice(0, roomsStart) + roomsNew + s.slice(roomsEnd);
n++;

// ---------- 5. 房间等待界面 ----------
const lobStart = s.indexOf('  function renderLobby(m) {');
const lobEnd = s.indexOf('  function showLobby(on) {', lobStart);
if (lobStart < 0 || lobEnd < 0) { console.error('renderLobby bounds'); process.exit(1); }
const lobNew = `  function renderLobby(m) {
    if (m.code) lobbyState.code = m.code;
    if (m.players) lobbyState.players = m.players;
    lobbyState.canStart = !!m.canStart;
    lobbyState.allReady = !!m.allReady;
    if (m.max) lobbyState.max = m.max;
    if (m.mode && EW.MAPS[m.mode]) lobbyState.modeName = EW.MAPS[m.mode].name;

    var el = document.getElementById('lobby');
    if (!el) return;
    document.getElementById('lobbyCode').textContent = lobbyState.code || '----';

    var me = null;
    for (var i = 0; i < lobbyState.players.length; i++) {
      if (lobbyState.players[i].id === Net.mySlot) me = lobbyState.players[i];
    }
    lobbyState.host = me ? me.host : false;
    lobbyState.me = me;
    var max = lobbyState.max || '?';
    document.getElementById('lobbySub').textContent =
      (lobbyState.modeName || '') + ' · ' + lobbyState.players.length + '/' + max +
      (lobbyState.allReady ? ' · 全员已准备' : ' · 等待准备');

    var t0 = '', t1 = '';
    lobbyState.players.forEach(function (p) {
      var isMe = p.id === Net.mySlot;
      var isHost = p.host;
      var row = '<div class="pl' + (isMe ? ' me' : '') + '">' +
        '<span class="dot" style="background:' + (p.team === 0 ? '#4de8cf' : '#ff7f8b') + '"></span>' +
        '<span class="nm">' + p.name + (isMe ? '（你）' : '') + '</span>' +
        (isHost ? '<span class="tag host">房主</span>' : '') +
        '<span class="tag ' + (p.ready ? 'rdy' : 'no') + '">' + (p.ready ? '已准备' : '未准备') + '</span>' +
        '<span class="ping">' + (p.rtt ? p.rtt + 'ms' : '—') + '</span>' +
        (lobbyState.host && !isMe
          ? '<button class="btn ghost sm" data-kick="' + p.id + '" style="padding:4px 10px;font-size:11px">踢出</button>'
          : '') +
        '</div>';
      if (p.team === 0) t0 += row; else t1 += row;
    });

    document.getElementById('lobbyList').innerHTML =
      '<div class="team-col"><div class="team-title t0">蓝队</div>' +
      (t0 || '<div class="hint" style="padding:6px 2px">等待加入…</div>') + '</div>' +
      '<div class="team-col"><div class="team-title t1">红队</div>' +
      (t1 || '<div class="hint" style="padding:6px 2px">等待加入…</div>') + '</div>';

    Array.prototype.forEach.call(el.querySelectorAll('button[data-kick]'), function (b) {
      b.onclick = function () { clickSfx(); Net.kick(parseInt(b.getAttribute('data-kick'), 10)); };
    });

    var rb = document.getElementById('lobbyReady');
    rb.textContent = me && me.ready ? '取消准备' : '准备';
    rb.onclick = function () { clickSfx(); Net.ready(); };

    var sb = document.getElementById('lobbyStart');
    sb.disabled = !lobbyState.canStart;
    sb.textContent = lobbyState.host
      ? (lobbyState.canStart ? '开始游戏' : '等待全员准备')
      : '等待房主开始';
    sb.onclick = function () { if (lobbyState.canStart) { clickSfx(); Net.startGame(); } };

    document.getElementById('lobbyLeave').onclick = function () {
      clickSfx(); Net.close(); netActive = false; showLobby(false); setState('menu');
    };
  }

`;
s = s.slice(0, lobStart) + lobNew + s.slice(lobEnd);
n++;

// ---------- 6. NET_ONLY：只启动大厅 ----------
rep(`  var qsp = new URLSearchParams(location.search);
  if (qsp.get('net') === '1') {`,
`  var qsp = new URLSearchParams(location.search);
  var NET_ONLY = !!window.NET_ONLY;

  // 服务器版本：隐藏单机入口，直接进大厅
  if (NET_ONLY) {
    var _mg = document.querySelector('.mode-grid');
    if (_mg) _mg.style.display = 'none';
    var _bc = document.getElementById('btnChangelog');
    if (_bc) _bc.style.display = 'none';
    var _bn = document.getElementById('btnNet');
    if (_bn) _bn.style.display = 'none';
    setTimeout(function () { openHall(); }, 0);
  }

  if (qsp.get('net') === '1') {`);

fs.writeFileSync('js/main.js', s, 'utf8');
console.log('applied', n);

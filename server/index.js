'use strict';
/*
 * ElementsWar 联机服务器
 *  - 静态文件 + WebSocket（零依赖）
 *  - 房间：房主制，准备 / 开始 / 踢人
 *  - 30Hz 固定步长模拟，15Hz 快照，按视野裁剪
 *  - 延迟补偿：记录位置历史，按玩家 RTT 回退命中判定
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const ws = require('./ws');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.env.PORT || '8080', 10);
const TICK = 1 / 30;
const SNAP_EVERY = 1;
const INTERP_MS = 80;          // 客户端插值缓冲，用于延迟补偿估算

require(path.join(ROOT, 'js', 'core.js'));
const EW = globalThis.EW;

// ---------------- 静态文件 ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/api/rooms') {
    const list = [];
    rooms.forEach((r) => {
      list.push({
        code: r.code, mode: r.mode,
        name: EW.MAPS[r.mode] ? EW.MAPS[r.mode].name : r.mode,
        players: r.players.length, max: r.maxPlayers,
        started: r.started, host: (r.players.find((x) => x.host) || {}).name || ''
      });
    });
    list.sort((a, b) => (b.players - a.players) || a.code.localeCompare(b.code));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(list));
    return;
  }
  if (p === '/' || p === '') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

// ---------------- 房间 ----------------
const rooms = new Map();

function makeCode() {
  const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += s[Math.floor(Math.random() * s.length)];
  return rooms.has(c) ? makeCode() : c;
}

class Room {
  constructor(code, mode) {
    this.code = code;
    this.mode = mode;
    this.players = [];
    this.g = null;
    this.tick = 0;
    this.acc = 0;
    this.last = Date.now();
    this.timer = null;
    this.started = false;
  }

  get maxPlayers() { return EW.MAPS[this.mode].teamSize * 2; }

  join(conn, name) {
    if (this.started) { conn.send({ t: 'error', msg: '对局进行中，请稍后再进' }); conn.close(); return; }
    if (this.players.length >= this.maxPlayers) { conn.send({ t: 'error', msg: '房间已满' }); conn.close(); return; }

    const host = this.players.length === 0;
    const c0 = this.players.filter((p) => p.team === 0).length;
    const c1 = this.players.filter((p) => p.team === 1).length;
    const team = c0 <= c1 ? 0 : 1;

    const p = {
      conn,
      id: (team * 100) + this.players.length,
      name: (name || ('玩家' + (this.players.length + 1))).slice(0, 12),
      team, ready: false, host, rtt: 0, unit: null
    };
    this.players.push(p);
    conn.onClose = () => this.leave(p);
    conn.onMessage = (m) => this.onMessage(p, m);
    conn.send({ t: 'joined', code: this.code, id: p.id, team: p.team, host, mode: this.mode });
    this.broadcastLobby();
    console.log('[room] ' + this.code + ' +' + p.name + ' (' + this.players.length + '/' + this.maxPlayers + ')');
  }

  leave(p) {
    const i = this.players.indexOf(p);
    if (i >= 0) this.players.splice(i, 1);

    if (this.started) {
      this.endMatch(-1, '有玩家离开，本局结束');
      this.started = false;
      this.g = null;
      if (this.timer) clearInterval(this.timer);
      this.players.forEach((x) => { x.ready = false; x.unit = null; });
    }
    if (this.players.length && !this.players.some((x) => x.host)) this.players[0].host = true;
    this.broadcastLobby();
    if (!this.players.length) this.destroy();
  }

  kick(byPlayer, targetId) {
    if (!byPlayer.host) return;
    const t = this.players.find((p) => p.id === targetId);
    if (!t || t === byPlayer) return;
    try { t.conn.send({ t: 'kicked' }); } catch (e) { }
    t.conn.close();
  }

  broadcastLobby() {
    const list = this.players.map((p) => ({
      id: p.id, name: p.name, team: p.team, ready: p.ready, host: p.host, rtt: Math.round(p.rtt)
    }));
    const allReady = this.players.length > 0 && this.players.every((p) => p.ready);
    this.players.forEach((p) => {
      try {
        p.conn.send({
          t: 'lobby', code: this.code, mode: this.mode, players: list,
          max: this.maxPlayers, allReady,
          canStart: p.host && allReady
        });
      } catch (e) { }
    });
  }

  onMessage(p, m) {
    if (m.t === 'input' && p.unit && this.g) {
      if (typeof m.rtt === 'number') p.rtt = Math.max(0, Math.min(400, m.rtt));
      if (!p.queue) p.queue = [];
      p.queue.push({
        seq: m.seq || 0,
        mx: m.mx || 0, my: m.my || 0, aim: m.aim || 0,
        shoot: !!m.shoot, sprint: !!m.sprint,
        item: m.item || null
      });
      // 防止堆积（客户端发太快时）
      while (p.queue.length > 20) p.queue.shift();
    } else if (m.t === 'ping') {
      p.conn.send({ t: 'pong', c: m.c });
    } else if (m.t === 'ready') {
      p.ready = !p.ready;
      this.broadcastLobby();
    } else if (m.t === 'start') {
      if (!p.host) { p.conn.send({ t: 'error', msg: '只有房主可以开始' }); return; }
      if (!this.players.every((x) => x.ready)) { p.conn.send({ t: 'error', msg: '还有玩家没准备' }); return; }
      if (this.started) return;
      this.start();
    } else if (m.t === 'kick') {
      this.kick(p, m.id);
    } else if (m.t === 'cmd') {
      this.onCommand(p, m);
    }
  }

  onCommand(p, m) {
    const g = this.g, u = p.unit;
    if (!g || !u) return;
    const reply = (ok, msg) => { try { p.conn.send({ t: 'toast', ok, msg }); } catch (e) { } };
    if (m.cmd === 'buy') {
      const r = EW.shopBuy(g, u, m.kind, m.key, m.dat);
      if (r === 'ok') reply(true, '已购买');
      else if (r === 'owned') reply(true, '已经拥有了');
      else if (r === 'money') reply(false, '资金不足');
      else if (r === 'locked') reply(false, '条件不满足');
      else reply(false, '无法购买');
    } else if (m.cmd === 'ks') {
      if (!EW.useKsItem(g, u, m.x || 0, m.y || 0)) reply(false, '没有可用的连杀技能');
    } else if (m.cmd === 'reload') {
      u.reloadReq = true;
    }
  }

  start() {
    this.started = true;
    this.g = EW.createGame(this.mode);
    this.g.score = [0, 0];
    this.bindHumanUnits();
    this.tick = 0; this.acc = 0; this.last = Date.now();
    this.players.forEach((p) => {
      try {
        p.conn.send({
          t: 'start', mode: this.mode, map: EW.MAPS[this.mode].name,
          you: p.unit ? p.unit.id : -1, team: p.team
        });
      } catch (e) { }
    });
    this.timer = setInterval(() => this.loop(), 16);
    console.log('[room] ' + this.code + ' 开局，真人 ' + this.players.length + ' 名');
  }

  bindHumanUnits() {
    const g = this.g;
    g.units.forEach((u) => { u.isPlayer = false; });
    const used = { 0: 0, 1: 0 };
    this.players.forEach((p) => {
      const list = g.units.filter((u) => u.team === p.team);
      if (!list.length) return;
      const u = list[used[p.team] % list.length];
      used[p.team]++;
      u.human = true;
      u.isPlayer = true;
      u.name = p.name;
      u.weapon = 'rifle';
      u.unlocked.rifle = true;
      u.mag = EW.WEAPONS.rifle.mag;
      p.unit = u;
    });
  }

  loop() {
    const now = Date.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25;
    this.acc += dt;

    let steps = 0;
    while (this.acc >= TICK && steps < 5) {
      this.acc -= TICK;
      this.stepOnce();
      steps++;
    }
    if (this.g && this.g.winner >= 0) {
      this.endMatch(this.g.winner, null);
      this.started = false;
      this.g = null;
      if (this.timer) clearInterval(this.timer);
      this.players.forEach((x) => { x.ready = false; x.unit = null; });
      this.broadcastLobby();
    }
  }

  stepOnce() {
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (!p.unit) continue;
      p.unit.lag = Math.min(EW.CFG.lagMax, (p.rtt / 2 + INTERP_MS) / 1000);
      // 每个 tick 消费一条输入，没有新输入就沿用上一条（和客户端重放一一对应）
      if (p.queue && p.queue.length) {
        const q = p.queue.shift();
        const inp = this.g.inputs[p.unit.id];
        inp.mx = q.mx; inp.my = q.my; inp.aim = q.aim;
        inp.shoot = q.shoot; inp.sprint = q.sprint;
        if (q.item) inp.throwElem = { slot: q.item.slot, x: q.item.x, y: q.item.y };
        p.ackSeq = q.seq;
      }
    }
    EW.step(this.g, TICK);
    this.tick++;
    if (this.tick % SNAP_EVERY === 0) this.broadcastSnapshot();
  }

  broadcastSnapshot() {
    const g = this.g;
    this.players.forEach((p) => {
      if (!p.unit) return;
      const u = p.unit;
      const poly = g.vision[u.id];
      const snap = {
        t: 'snap', tick: this.tick,
        you: {
          id: u.id,
          x: Math.round(u.x), y: Math.round(u.y),
          hp: Math.round(u.hp), armor: Math.round(u.armor), shield: Math.round(u.shield),
          mag: u.mag, reloadT: +u.reloadT.toFixed(2),
          itemCd: {
            w: +u.itemCd.w.toFixed(1), f: +u.itemCd.f.toFixed(1),
            e: +u.itemCd.e.toFixed(1), d: +u.itemCd.d.toFixed(1)
          },
          money: Math.floor(u.money), streak: u.streak, ksItem: u.ksItem,
          fearT: +u.fearT.toFixed(1), revealT: +u.revealT.toFixed(1),
          alive: u.alive, respawnT: +Math.max(0, u.respawnT).toFixed(1),
          maxHp: u.maxHp, stamina: Math.round(u.stamina),
          ack: p.ackSeq || 0,
          weapon: u.weapon, ammoElem: u.ammoElem, items: u.items,
          unlocked: u.unlocked, talents: u.talents
        },
        units: [],
        zones: g.zones.map((z) => ({ e: z.elem, x: Math.round(z.x), y: Math.round(z.y), r: Math.round(z.r), f: Math.round(z.fuel) })),
        walls: g.walls.map((w) => ({ x: Math.round(w.cx), y: Math.round(w.cy), w: w.w, h: w.h, hp: Math.round(w.hp) })),
        barrels: g.barrels.map((b) => ({ x: b.x, y: b.y, hp: b.alive ? Math.round(b.hp) : 0 })),
        bullets: [],
        fogs: g.fogs.map((f) => ({ x: Math.round(f.x), y: Math.round(f.y), r: Math.round(f.r), l: +f.life.toFixed(2), m: +f.maxLife.toFixed(2) })),
        traps: g.traps.map((t) => ({ x: Math.round(t.x), y: Math.round(t.y), r: Math.round(t.r), l: +t.life.toFixed(2), m: +t.maxLife.toFixed(2) })),
        grenades: g.grenades.map((gr) => ({
          x: Math.round(gr.x), y: Math.round(gr.y),
          tx: Math.round(gr.tx), ty: Math.round(gr.ty),
          e: gr.elem, p: +(gr.t / gr.dur).toFixed(2), bomb: !!gr.bomb
        })),
        score: g.score.slice()
      };
      // 子弹：只发视野附近的（视觉用）
      for (const b of g.bullets) {
        var dxb = b.x - u.x, dyb = b.y - u.y;
        if (dxb * dxb + dyb * dyb > 1200 * 1200) continue;
        snap.bullets.push({
          x: Math.round(b.x), y: Math.round(b.y),
          vx: Math.round(b.vx), vy: Math.round(b.vy), e: b.elem
        });
      }
      for (const o of g.units) {
        if (!o.alive) continue;
        if (o.team !== u.team) {
          const visible = poly && EW.pointInPoly(o.x, o.y, poly) && !EW.fogBlocked(g, u.x, u.y, o.x, o.y);
          if (!visible && u.revealT <= 0) continue;
        }
        snap.units.push({
          id: o.id, tm: o.team, x: Math.round(o.x), y: Math.round(o.y),
          a: +o.aim.toFixed(2), hp: Math.round(o.hp), ar: Math.round(o.armor),
          st: [Math.round(o.status.w), Math.round(o.status.f), Math.round(o.status.e)],
          n: o.name, wp: o.weapon
        });
      }
      if (this.tick % 8 === 0) {
        snap.board = g.units.map((x) => ({
          id: x.id, tm: x.team, n: x.name || 'AI',
          k: x.kills | 0, d: x.deaths | 0, al: x.alive ? 1 : 0, wp: x.weapon
        }));
      }
      snap.events = g.sfx.slice(0, 20);
      try { p.conn.send(snap); } catch (e) { }
    });
  }

  endMatch(winner, msg) {
    const g = this.g;
    const score = g ? g.score : [0, 0];
    this.players.forEach((p) => {
      try { p.conn.send({ t: 'end', winner, score, msg: msg || null }); } catch (e) { }
    });
    if (this.timer) clearInterval(this.timer);
  }

  destroy() {
    clearInterval(this.timer);
    rooms.delete(this.code);
    console.log('[room] 关闭 ' + this.code);
  }
}

// ---------------- 入场 ----------------
ws.attach(server, (conn, req) => {
  const qp = new URL(req.url, 'http://x').searchParams;
  const q = {};
  qp.forEach((v, k) => { q[k] = v; });

  const mode = EW.MAPS[q.mode] ? q.mode : 'small';
  let code = (q.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  let room;

  if (code && rooms.has(code)) {
    room = rooms.get(code);
    if (room.mode !== mode) { conn.send({ t: 'error', msg: '房间模式不符（该房间是 ' + room.mode + '）' }); conn.close(); return; }
  } else {
    code = code || makeCode();
    room = new Room(code, mode);
    rooms.set(code, room);
    console.log('[room] 创建 ' + code + ' ' + mode);
  }
  room.join(conn, (q.name || '').slice(0, 12));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('ElementsWar server  http://0.0.0.0:' + PORT);
  console.log('模式: small / tian / medium / large');
});

setInterval(() => {
  rooms.forEach((r) => r.players.forEach((p) => { try { p.conn.ping(); } catch (e) { } }));
}, 20000);

/* ElementsWar - 客户端联机层
 * 职责：连接、30Hz 上行输入、快照接收、RTT 统计
 * 不碰渲染，渲染仍在 main.js
 */
(function (root) {
  'use strict';

  var Net = {
    ws: null,
    connected: false,
    started: false,
    myId: -1,
    mySlot: -1,
    myTeam: 0,
    room: '',
    mode: 'small',
    rtt: 0,
    lastSnapAt: 0,
    snapCount: 0,
    pingTimer: null,
    seq: 0,
    handlers: {},
    _pingAt: 0,

    connect: function (opts) {
      var self = this;
      this.mode = opts.mode || 'small';
      this.handlers = opts.handlers || {};
      var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
      var qs = '?mode=' + encodeURIComponent(this.mode) +
        '&name=' + encodeURIComponent(opts.name || '玩家') +
        (opts.room ? '&room=' + encodeURIComponent(opts.room) : '');

      try {
        this.ws = new WebSocket(proto + location.host + '/ws' + qs);
      } catch (e) {
        this._fire('onError', '无法创建连接: ' + e.message);
        return;
      }

      this.ws.onopen = function () {
        self.connected = true;
        self._fire('onOpen');
        self.pingTimer = setInterval(function () { self.ping(); }, 2000);
      };
      this.ws.onmessage = function (ev) {
        var m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        self._handle(m);
      };
      this.ws.onclose = function () {
        self.connected = false;
        if (self.pingTimer) clearInterval(self.pingTimer);
        self._fire('onClose');
      };
      this.ws.onerror = function () {
        self._fire('onError', '连接失败');
      };
    },

    _fire: function (name, a, b) {
      var f = this.handlers[name];
      if (typeof f === 'function') f(a, b);
    },

    _handle: function (m) {
      if (m.t === 'joined') {
        this.mySlot = m.id;          // 槽位 id（大厅列表用）
        this.myTeam = m.team;        // 单位 id 只在 start 的 you 里给
        this.room = m.code;
        this._fire('onJoined', m);
      } else if (m.t === 'lobby') {
        this._fire('onLobby', m);
      } else if (m.t === 'start') {
        this.started = true;
        this._fire('onStart', m);
      } else if (m.t === 'snap') {
        this.snapCount++;
        this.lastSnapAt = performance.now();
        this._fire('onSnap', m);
      } else if (m.t === 'end') {
        this.started = false;
        this._fire('onEnd', m);
      } else if (m.t === 'pong') {
        this.rtt = Math.max(0, Date.now() - m.c);
      } else if (m.t === 'error') {
        this._fire('onError', m.msg);
      } else if (m.t === 'toast') {
        this._fire('onToast', m);
      } else if (m.t === 'kicked') {
        this._fire('onKicked');
      }
    },

    ping: function () {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify({ t: 'ping', c: Date.now() }));
      }
    },

    send: function (obj) {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify(obj));
      }
    },

    /* 每帧调用：把本地输入按 30Hz 节流后发出去 */
    _acc: 0,
    input: function (dt, inp) {
      this._acc += dt;
      if (this._acc < 1 / 30) return false;
      this._acc = 0;
      this.seq++;
      var _sq = this.seq;
      this.send({
        t: 'input',
        seq: _sq,
        rtt: Math.round(this.rtt),
        mx: +inp.mx.toFixed(2),
        my: +inp.my.toFixed(2),
        aim: +inp.aim.toFixed(2),
        shoot: inp.shoot ? 1 : 0,
        sprint: inp.sprint ? 1 : 0,
        item: inp.item || null
      });
      return _sq;
    },

    ready: function () { this.send({ t: 'ready' }); },
    startGame: function () { this.send({ t: 'start' }); },
    kick: function (id) { this.send({ t: 'kick', id: id }); },

    close: function () {
      if (this.pingTimer) clearInterval(this.pingTimer);
      try { this.ws && this.ws.close(); } catch (e) { }
      this.connected = false;
    }
  };

  root.Net = Net;
})(typeof window !== 'undefined' ? window : globalThis);

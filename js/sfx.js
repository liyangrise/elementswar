/* ElementsWar - 程序化音效（Web Audio 合成，无音频文件） */
(function (root) {
  'use strict';

  var ctx = null, master = null, comp = null, noiseBuf = null;
  var enabled = true;
  var listener = { x: 0, y: 0 };
  var lastPlay = {};
  var THROTTLE = {
    shoot: 0.022, hit: 0.03, boom: 0.06, vapor: 0.12, shock: 0.12,
    tri: 0.08, kill: 0.06, land: 0.06, throw: 0.06, strength: 0.05
  };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function init() {
    if (ctx) return true;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) { enabled = false; return false; }
    try { ctx = new AC(); } catch (e) { enabled = false; return false; }
    master = ctx.createGain();
    master.gain.value = 0.55;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 20;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master.connect(comp);
    comp.connect(ctx.destination);
    return true;
  }

  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function getNoise() {
    if (noiseBuf) return noiseBuf;
    var len = Math.floor(ctx.sampleRate * 1.5);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  // 带距离衰减 + 声像的输出节点
  function bus(x, y) {
    var g = ctx.createGain();
    var vol = 1, pan = 0;
    if (x !== undefined) {
      var dx = x - listener.x, dy = y - listener.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      vol = Math.pow(clamp(1 - d / 1500, 0, 1), 1.6);
      pan = clamp(dx / 800, -0.85, 0.85);
      if (vol < 0.02) return null;
    }
    g.gain.value = vol;
    if (ctx.createStereoPanner) {
      var p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p); p.connect(master);
    } else {
      g.connect(master);
    }
    return g;
  }

  function noiseBurst(dest, t, dur, type, f0, f1, q, peak) {
    var src = ctx.createBufferSource();
    src.buffer = getNoise();
    src.loop = true;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    var flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    flt.Q.value = q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(dest);
    src.start(t); src.stop(t + dur + 0.03);
  }

  function tone(dest, t, dur, type, f0, f1, peak) {
    var o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.03);
  }

  // ---------------- 各类音效 ----------------
  var GUN = {
    rifle:   { f: 1700, dur: 0.075, pump: 0.55, thump: 190 },
    smg:     { f: 2300, dur: 0.055, pump: 0.42, thump: 240 },
    shotgun: { f: 780,  dur: 0.24,  pump: 0.95, thump: 110 },
    sniper:  { f: 620,  dur: 0.32,  pump: 1.00, thump: 80 },
    lmg:     { f: 1450, dur: 0.085, pump: 0.62, thump: 170 },
    dmr:     { f: 1250, dur: 0.13,  pump: 0.70, thump: 150 }
  };

  function sShoot(ev) {
    var cfg = GUN[ev.w] || GUN.rifle;
    var o = bus(ev.x, ev.y); if (!o) return;
    var t = ctx.currentTime + 0.001;
    noiseBurst(o, t, cfg.dur, 'bandpass', cfg.f, cfg.f * 0.45, 0.9, 0.42 * cfg.pump);
    tone(o, t, 0.09, 'sine', cfg.thump, cfg.thump * 0.4, 0.34 * cfg.pump);
    if (ev.w === 'sniper') noiseBurst(o, t, 0.05, 'highpass', 3200, 2400, 1, 0.22);
    if (ev.w === 'shotgun') noiseBurst(o, t + 0.01, 0.16, 'lowpass', 500, 200, 1, 0.25);
  }

  function sHit(ev) {
    var o = bus(ev.x, ev.y); if (!o) return;
    var t = ctx.currentTime + 0.001;
    var base = { w: 1500, f: 1100, e: 2000 }[ev.elem] || 1400;
    tone(o, t, 0.05, 'square', base, base * 0.6, 0.10);
    noiseBurst(o, t, 0.035, 'highpass', 2600, 2000, 1, 0.10);
    if (ev.mine) tone(o, t + 0.005, 0.03, 'sine', 2200, 2200, 0.06);
  }

  function sBoom(ev) {
    var o = bus(ev.x, ev.y); if (!o) return;
    var t = ctx.currentTime + 0.001;
    var s = ev.size || 1;
    noiseBurst(o, t, 0.55 * s, 'lowpass', 1000 * s, 130, 1, 0.55 * Math.min(1.4, s));
    tone(o, t, 0.5 * s, 'sine', 95, 38, 0.38 * Math.min(1.4, s));
  }

  function sVapor(ev) {
    var o = bus(ev.x, ev.y); if (!o) return;
    var t = ctx.currentTime + 0.001;
    noiseBurst(o, t, 0.62, 'bandpass', 480, 1500, 0.8, 0.16);
  }

  function sShock(ev) {
    var o = bus(ev.x, ev.y); if (!o) return;
    var t = ctx.currentTime + 0.001;
    tone(o, t, 0.2, 'sawtooth', 260, 160, 0.14);
    noiseBurst(o, t, 0.18, 'highpass', 2200, 3200, 1, 0.10);
  }

  function sTri(ev) {
    var o = bus(ev.x, ev.y); if (!o) return;
    var t = ctx.currentTime + 0.001;
    [523, 659, 784, 1046].forEach(function (f, i) {
      tone(o, t + i * 0.05, 0.22, 'triangle', f, f, 0.09);
    });
    noiseBurst(o, t, 0.35, 'bandpass', 900, 2200, 0.7, 0.12);
  }

  function sThrow(ev) {
    var o = bus(ev.x, ev.y); if (!o) return;
    var t = ctx.currentTime + 0.001;
    noiseBurst(o, t, 0.19, 'bandpass', 620, 1900, 2.2, 0.18);
  }

  function sLand(ev) {
    var o = bus(ev.x, ev.y); if (!o) return;
    var t = ctx.currentTime + 0.001;
    tone(o, t, 0.16, 'sine', 320, 130, 0.22);
    noiseBurst(o, t, 0.1, 'lowpass', 420, 200, 1, 0.14);
    var f = { w: 440, f: 330, e: 880 }[ev.elem];
    if (f) tone(o, t + 0.02, 0.3, 'sine', f, f * 1.5, 0.07);
  }

  function sKill(ev) {
    var o = bus(ev.x, ev.y); if (!o) return;
    var t = ctx.currentTime + 0.001;
    tone(o, t, 0.07, 'square', 880, 880, 0.10);
    tone(o, t + 0.06, 0.09, 'square', 1320, 1320, 0.09);
    if (ev.mine) tone(o, t + 0.13, 0.14, 'triangle', 1560, 1560, 0.07);
  }

  function sReload(ev) {
    var o = bus(ev.x, ev.y); if (!o) return;
    var t = ctx.currentTime + 0.001;
    noiseBurst(o, t, 0.04, 'highpass', 1800, 1400, 1, 0.12);
    noiseBurst(o, t + 0.17, 0.05, 'highpass', 1200, 900, 1, 0.12);
  }

  function sHeal(ev) {
    var o = bus(ev.x, ev.y); if (!o) return;
    var t = ctx.currentTime + 0.001;
    tone(o, t, 0.4, 'sine', 520, 1040, 0.16);
  }

  function sStreak(ev) {
    var o = bus(ev.x, ev.y); if (!o) return;
    var t = ctx.currentTime + 0.001;
    var n = ev.tier >= 20 ? 6 : ev.tier >= 13 ? 5 : ev.tier >= 9 ? 4 : 3;
    var scale = [523, 659, 784, 1046, 1318, 1568];
    for (var i = 0; i < n; i++) {
      tone(o, t + i * 0.075, 0.3, 'triangle', scale[i], scale[i], 0.10);
    }
  }

  function ui() {
    if (!ctx || !enabled) return;
    var o = bus(); if (!o) return;
    var t = ctx.currentTime + 0.001;
    tone(o, t, 0.05, 'square', 720, 620, 0.09);
  }

  function play(ev) {
    if (!enabled || !ctx || ctx.state === 'suspended') return;
    var th = THROTTLE[ev.t];
    if (th) {
      var now = ctx.currentTime;
      if (lastPlay[ev.t] && now - lastPlay[ev.t] < th) return;
      lastPlay[ev.t] = now;
    }
    switch (ev.t) {
      case 'shoot': sShoot(ev); break;
      case 'hit': sHit(ev); break;
      case 'boom': sBoom(ev); break;
      case 'vapor': sVapor(ev); break;
      case 'shock': sShock(ev); break;
      case 'tri': sTri(ev); break;
      case 'throw': sThrow(ev); break;
      case 'land': sLand(ev); break;
      case 'kill': sKill(ev); break;
      case 'reload': sReload(ev); break;
      case 'heal': sHeal(ev); break;
      case 'streak': sStreak(ev); break;
    }
  }

  root.SFX = {
    init: init,
    resume: resume,
    play: play,
    ui: ui,
    setListener: function (x, y) { listener.x = x; listener.y = y; },
    toggle: function () { enabled = !enabled; return enabled; },
    isOn: function () { return enabled; },
    getState: function () { return ctx ? ctx.state : 'none'; }
  };
})(typeof window !== 'undefined' ? window : globalThis);

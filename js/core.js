/* ElementsWar - 核心逻辑（无 DOM 依赖，可在 node 下跑无头测试） */
(function (root) {
  'use strict';

  var VERSION = '0.13.0';

  // ---------------- 可调参数 ----------------
  var CFG = {
    theta: 25, zoneR: 150, zoneFuel: 100, zoneDecay: 11,
    reactCost: 8, reactCoeff: 0.14,
    statusGain: 55, statusDecay: 10, statusThreshold: 40,
    bulletStatus: 20,
    unitHp: 200, unitSpeed: 190, dmgMult: 1,
    visionRange: 560, visionHalfDeg: 80,
    fogDur: 3.2, fogR: 92,
    respawn: 4, spawnProt: 10,
    itemCd: 8,
    aiErr: 0.11, aiReaction: 0.45,
    streakHeal: 0.6,
    streakReveal: 12,
    streakPhase: 6.5,
    streakBombR: 270,
    streakBombDmg: 150,
    winStreak: 20,
    shockStun: 0.28,      // 触电麻痹时长
    shockCd: 1.4,         // 触电麻痹内置冷却（防无限控）
    sprintMul: 1.6,
    staminaMax: 100, staminaDrain: 28, staminaRegen: 20,
    talentCost: 1500, talentHeal: 0.2,
    talentRubber: 3000, talentEagle: 2000,
    talentRegenArmor: 2000, talentHeavyArmor: 2200, talentThirdEye: 2400,
    rearHalfDeg: 55, rearRangeK: 0.55,
    regenArmorMax: 50, regenArmorRate: 5, regenArmorDelay: 3,
    heavyArmorMax: 100,
    fearDur: 15, fearShield: 800, fearRate: 1.5, fearReload: 1.5, fearKillExtend: 3,
    mudR: 140, mudSlow: 0.55, mudFire: 1.6, earthCd: 16,
    eagleRange: 1.4, eagleAngle: 1.3,
    barrelKnock: 820,
    killMoneyGun: 300, killMoneyElem: 500,
    weaponCost: 500,
    barrelRespawn: 20,
    earthHp: 240, earthLife: 8.4,
    puddleStrength: 40,
    lagComp: true, lagMax: 0.25, histLen: 50
  };

  var CELL = 30;
  var UNIT_R = 13;
  var RAYS = 64;
  var REACT_BUDGET = 30;

  var K = { NONE: 0, W: 1, F: 2, E: 3, VAPOR: 4, OVERLOAD: 5, SHOCK: 6, TRI: 7 };
  var KIND_COLOR = {
    0: null, 1: [70, 160, 235], 2: [245, 120, 40], 3: [165, 90, 250],
    4: [215, 245, 255], 5: [255, 70, 55], 6: [150, 100, 255], 7: [255, 240, 170]
  };
  var ELEM_COLOR = { w: [70, 160, 235], f: [245, 120, 40], e: [165, 90, 250], d: [196, 158, 96] };

  // ---------------- 武器 ----------------
  var WEAPONS = {
    pistol:  { name: '手枪', dmg: 18, rpm: 380, spread: 0.030, speed: 1300, mag: 12, reload: 1.5, pellets: 1, semi: true, cost: 0, range: 420,
      desc: '免费装备的备用武器。单发 18 伤害、半自动，容错高但持续输出低，用来攒出第一把主武器。' },
    rifle:   { name: '步枪', dmg: 12, rpm: 600, spread: 0.020, speed: 1500, mag: 30, reload: 2.0, pellets: 1, cost: 500, range: 700,
      desc: '全能型自动武器。600 射速配 30 发弹匣，中距离最稳，没有明显短板，是绝大多数情况下的默认答案。' },
    smg:     { name: '冲锋枪', dmg: 8, rpm: 900, spread: 0.050, speed: 1200, mag: 35, reload: 1.8, pellets: 1, cost: 500, range: 400,
      desc: '射速最快、散布最大。近距离贴脸时 DPS 压制力最强，但中远距离几乎打不中，适合绕后与掩体间突进。' },
    shotgun: { name: '霰弹枪', dmg: 9, rpm: 260, spread: 0.115, speed: 1150, mag: 8, reload: 2.4, pellets: 8, auto: true, cost: 500, range: 320,
      desc: '全自动连喷（AA12 式）。一发 8 颗弹丸 × 9 伤害，260 射速可以按住不放，贴脸持续输出 300+ DPS，但 320px 外迅速衰减。' },
    blade:   { name: '长刀', dmg: 70, rpm: 90, spread: 0, speed: 0, mag: 1, reload: 0.1, pellets: 0, melee: true, cost: 500, range: 118,
      desc: '近战长刀。向前挥出 118×92 的矩形范围伤害，一次可命中多个敌人；从背后命中造成 2 倍伤害。' },
    sniper:  { name: '狙击枪', dmg: 95, rpm: 45, spread: 0.004, speed: 2600, mag: 5, reload: 3.0, pellets: 1, semi: true, pierce: true, cost: 1000, range: 1400,
      desc: '单发 95 伤害，半自动。子弹可穿透多个敌人（每穿一人 ×0.75），也能打穿土墙（对墙 200%，自身伤害减半）。' },
    lmg:     { name: '机枪', dmg: 11, rpm: 700, spread: 0.060, speed: 1400, mag: 75, reload: 3.5, pellets: 1, fireMove: 0.5, moveSpread: 2.0, cost: 1000, range: 800,
      desc: '75 发弹匣的压制武器。开火时移速减半、移动散布翻倍——站着打是火力网，边走边打是浪费子弹。' },
    dmr:     { name: '射手步枪', dmg: 26, rpm: 200, spread: 0.012, speed: 1900, mag: 12, reload: 2.4, pellets: 1, semi: true, cost: 500, range: 1000,
      desc: '半自动点射，单发 26。两枪带走半血，节奏感强；必须一下一下点，长按不会连发。' }
  };
  var WEAPON_ORDER = ['pistol', 'rifle', 'smg', 'shotgun', 'blade', 'sniper', 'lmg', 'dmr'];

  var ITEMS = {
    w: { name: '水手雷', cd: 7.0, desc: '制造水元素区域' },
    f: { name: '火手雷', cd: 8.0, desc: '制造火元素区域' },
    e: { name: '电手雷', cd: 9.0, desc: '制造电元素区域' },
    d: { name: '土手雷', cd: 16.0, desc: '生成一面墙，周围形成泥沼' }
  };

  // ---------------- 地图 ----------------
  var WALL_T = 22;

  function mirrorRect(r, w) { return [w - r[2], r[1], w - r[0], r[3]]; }

  function spawnRoomWalls(rx0, ry0, rx1, ry1, doorOnRight) {
    var cy = (ry0 + ry1) / 2, gap = 58;
    var walls = [
      [rx0, ry0, rx1, ry0 + WALL_T],
      [rx0, ry1 - WALL_T, rx1, ry1]
    ];
    if (doorOnRight) {
      walls.push([rx0, ry0, rx0 + WALL_T, ry1]);
      walls.push([rx1 - WALL_T, ry0, rx1, cy - gap]);
      walls.push([rx1 - WALL_T, cy + gap, rx1, ry1]);
    } else {
      walls.push([rx1 - WALL_T, ry0, rx1, ry1]);
      walls.push([rx0, ry0, rx0 + WALL_T, cy - gap]);
      walls.push([rx0, cy + gap, rx0 + WALL_T, ry1]);
    }
    return walls;
  }

  function makeMap(def) {
    var w = def.w, h = def.h;
    var cols = Math.floor(w / CELL), rows = Math.floor(h / CELL);
    w = cols * CELL; h = rows * CELL;
    var noMirror = !!def.noMirror;

    var base = def.covers.map(function (r) { return [r[0], r[1], r[2], r[3]]; });
    var barrels = def.barrels.map(function (p) { return [p[0], p[1]]; });
    var puddles = (def.puddles || []).map(function (r) { return [r[0], r[1], r[2], r[3]]; });
    if (!noMirror) {
      barrels = barrels.concat(def.barrels.map(function (p) { return [w - p[0], p[1]]; }));
      puddles = puddles.concat((def.puddles || []).map(function (r) { return mirrorRect(r, w); }));
    }

    var spawns = [[], []];
    for (var i = 0; i < def.spawnY.length; i++) {
      spawns[0].push({ x: def.spawnX, y: def.spawnY[i] });
      spawns[1].push({ x: w - def.spawnX, y: def.spawnY[i] });
    }

    if (def.noRoom) {
      return {
        key: def.key, name: def.name, w: w, h: h, cols: cols, rows: rows,
        teamSize: def.teamSize, killTarget: def.killTarget,
        covers: noMirror ? base : base.concat(base.map(function (r) { return mirrorRect(r, w); })),
        barrels: barrels, puddles: puddles, spawns: spawns,
        spawnZones: [
          { x0: 0, y0: 0, x1: w * 0.18, y1: h },
          { x0: w * 0.82, y0: 0, x1: w, y1: h }
        ],
        dummy: !!def.dummy
      };
    }

    var midY = def.spawnY[def.spawnY.length >> 1];
    var roomH = 300, roomX0 = 24, roomX1 = Math.max(roomX0 + 300, def.spawnX + 110);
    var ry0 = Math.round(midY - roomH / 2), ry1 = ry0 + roomH;
    var leftRoom = spawnRoomWalls(roomX0, ry0, roomX1, ry1, true);
    var rightRoom = leftRoom.map(function (r) { return mirrorRect(r, w); });
    var allCovers = base.concat(leftRoom).concat(rightRoom);
    if (!noMirror) allCovers = allCovers.concat(base.map(function (r) { return mirrorRect(r, w); }));

    return {
      key: def.key, name: def.name, w: w, h: h, cols: cols, rows: rows,
      teamSize: def.teamSize, killTarget: def.killTarget,
      covers: allCovers, barrels: barrels, puddles: puddles, spawns: spawns,
      spawnZones: [
        { x0: roomX0 + WALL_T, y0: ry0 + WALL_T, x1: roomX1 - WALL_T, y1: ry1 - WALL_T },
        { x0: w - roomX1 + WALL_T, y0: ry0 + WALL_T, x1: w - roomX0 - WALL_T, y1: ry1 - WALL_T }
      ],
      dummy: !!def.dummy
    };
  }

  var MAPS = {
    small: makeMap({
      key: 'small', name: '1v1 · 小型地图', teamSize: 1, killTarget: 15,
      w: 1530, h: 900, spawnX: 150, spawnY: [450],
      covers: [
        [420, 360, 466, 540], [560, 150, 640, 190],
        [560, 710, 640, 750], [680, 400, 750, 500],
        [900, 250, 990, 286], [900, 614, 990, 650]
      ],
      barrels: [[500, 240], [500, 660]],
      puddles: [[630, 590, 750, 690]]
    }),
    tian: makeMap({
      key: 'tian', name: '1v1 · 田字地图', teamSize: 1, killTarget: 15,
      w: 1800, h: 1080, spawnX: 170, spawnY: [540],
      covers: [
        // 中央十字（中间留缺口）
        [560, 500, 880, 536], [920, 500, 1240, 536],
        [882, 300, 918, 470], [882, 610, 918, 780],
        // 四角小掩体
        [430, 220, 540, 256], [430, 824, 540, 860],
        [700, 220, 764, 320], [700, 760, 764, 860]
      ],
      barrels: [[820, 540], [980, 540]],
      puddles: [[560, 640, 700, 740], [980, 340, 1120, 440]]
    }),
    medium: makeMap({
      key: 'medium', name: '3v3 · 中型地图', teamSize: 3, killTarget: 40,
      w: 2040, h: 1140, spawnX: 210, spawnY: [420, 570, 720],
      covers: [
        [250, 360, 390, 392], [250, 748, 390, 780],
        [470, 500, 510, 640], [600, 250, 730, 286],
        [600, 854, 730, 890], [730, 470, 782, 560],
        [880, 210, 930, 340], [880, 800, 930, 930],
        [915, 520, 965, 620], [360, 120, 470, 156],
        [360, 984, 470, 1020]
      ],
      barrels: [[420, 570], [650, 400], [650, 740], [830, 570]],
      puddles: [[560, 600, 700, 700]]
    }),
    range: makeMap({
      key: 'range', name: '靶场 · 测试场', teamSize: 1, killTarget: 99999,
      w: 1500, h: 900, spawnX: 150, spawnY: [450],
      covers: [], barrels: [], puddles: [], noRoom: true, dummy: true
    }),
    large: makeMap({
      key: 'large', name: '5v5 · 大型地图', teamSize: 5, killTarget: 100,
      w: 2400, h: 1350, spawnX: 260, spawnY: [585, 630, 675, 720, 765],
      covers: [
        [430, 420, 590, 456], [430, 894, 590, 930],
        [700, 600, 746, 750], [840, 300, 1000, 340],
        [840, 1010, 1000, 1050], [1000, 560, 1060, 690],
        [1180, 250, 1240, 400], [1180, 950, 1240, 1100],
        [1220, 620, 1280, 730], [570, 160, 700, 200],
        [570, 1150, 700, 1190]
      ],
      barrels: [[640, 675], [900, 480], [900, 870], [1120, 675]],
      puddles: [[760, 800, 930, 920], [1300, 620, 1450, 730]]
    })
  };

  var M = MAPS.large;
  var DYN = [];            // 动态掩体（土墙），同步成矩形

  function sfxPush(g, obj) {
    if (g.sfx.length < 160) { obj.t0 = g.t; g.sfx.push(obj); }
  }

  // ---------------- 几何 ----------------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  function rayAABB(ox, oy, dx, dy, r, maxT) {
    var tmin = 0, tmax = maxT, t1, t2, tmp;
    var lo = r[0], hi = r[2];
    if (Math.abs(dx) < 1e-9) { if (ox < lo || ox > hi) return -1; }
    else {
      t1 = (lo - ox) / dx; t2 = (hi - ox) / dx;
      if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
    }
    lo = r[1]; hi = r[3];
    if (Math.abs(dy) < 1e-9) { if (oy < lo || oy > hi) return -1; }
    else {
      t1 = (lo - oy) / dy; t2 = (hi - oy) / dy;
      if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
    }
    if (tmax < tmin) return -1;
    return tmin;
  }

  function segAABB(x1, y1, x2, y2, r) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return -1;
    var t = rayAABB(x1, y1, dx / len, dy / len, r, len);
    if (t < 0) return -1;
    return t / len;
  }

  function segCircle(x1, y1, x2, y2, cx, cy, rad) {
    var dx = x2 - x1, dy = y2 - y1;
    var fx = x1 - cx, fy = y1 - cy;
    var a = dx * dx + dy * dy;
    if (a < 1e-9) return dist2(x1, y1, cx, cy) <= rad * rad ? 0 : -1;
    var b = 2 * (fx * dx + fy * dy);
    var c = fx * fx + fy * fy - rad * rad;
    var disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    var sq = Math.sqrt(disc);
    var t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
    if (t1 >= 0 && t1 <= 1) return t1;
    if (t2 >= 0 && t2 <= 1) return t2;
    if (t1 < 0 && t2 > 1) return 0;
    return -1;
  }

  function pointInPoly(px, py, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function cellIndex(x, y) {
    var i = clamp(Math.floor(x / CELL), 0, M.cols - 1);
    var j = clamp(Math.floor(y / CELL), 0, M.rows - 1);
    return j * M.cols + i;
  }

  function inRect(x, y, r) { return x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]; }
  function pointInPuddle(x, y) {
    for (var i = 0; i < M.puddles.length; i++) if (inRect(x, y, M.puddles[i])) return true;
    return false;
  }

  // ---------------- 视野 ----------------
  function rayCovers(x, y, ang, maxR) {
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var best = maxR || CFG.visionRange;
    var i, t;
    for (i = 0; i < M.covers.length; i++) {
      t = rayAABB(x, y, dx, dy, M.covers[i], best);
      if (t >= 0 && t < best) best = t;
    }
    for (i = 0; i < DYN.length; i++) {
      t = rayAABB(x, y, dx, dy, DYN[i], best);
      if (t >= 0 && t < best) best = t;
    }
    if (dx > 1e-6) best = Math.min(best, (M.w - x) / dx);
    if (dx < -1e-6) best = Math.min(best, (0 - x) / dx);
    if (dy > 1e-6) best = Math.min(best, (M.h - y) / dy);
    if (dy < -1e-6) best = Math.min(best, (0 - y) / dy);
    return best;
  }

  // 复用输出数组：视野每帧都算，不能每次新建 40 个 [x,y]
  function conePoly(u, dir, half, range, out) {
    var poly = out || [];
    var need = RAYS + 2;
    for (var w = poly.length; w < need; w++) poly.push([0, 0]);
    poly.length = need;
    poly[0][0] = u.x; poly[0][1] = u.y;
    for (var i = 0; i <= RAYS; i++) {
      var a = dir - half + (2 * half) * i / RAYS;
      var d = rayCovers(u.x, u.y, a, range);
      var p = poly[i + 1];
      p[0] = u.x + Math.cos(a) * d;
      p[1] = u.y + Math.sin(a) * d;
    }
    return poly;
  }

  function computeVision(u) {
    var eagle = u.talents && u.talents.eagle;
    var half = CFG.visionHalfDeg * (eagle ? CFG.eagleAngle : 1) * Math.PI / 360;
    var range = CFG.visionRange * (eagle ? CFG.eagleRange : 1);
    if (!u._vp) u._vp = [];
    return conePoly(u, u.aim, half, range, u._vp);
  }

  function computeRear(u) {
    if (!(u.talents && u.talents.thirdEye)) return null;
    var half = CFG.rearHalfDeg * Math.PI / 180;
    var range = CFG.visionRange * CFG.rearRangeK;
    if (!u._vr) u._vr = [];
    return conePoly(u, u.aim + Math.PI, half, range, u._vr);
  }

  function fogBlocked(g, x1, y1, x2, y2) {
    for (var i = 0; i < g.fogs.length; i++) {
      var f = g.fogs[i];
      if (segCircle(x1, y1, x2, y2, f.x, f.y, f.r) >= 0) return true;
    }
    return false;
  }

  function canSee(g, u, tx, ty) {
    var poly = g.vision[u.id];
    var seen = !!(poly && poly.length >= 3 && pointInPoly(tx, ty, poly));
    if (!seen) {
      var rear = g.visionR && g.visionR[u.id];
      if (rear && rear.length >= 3 && pointInPoly(tx, ty, rear)) seen = true;
    }
    if (!seen) return false;
    if (fogBlocked(g, u.x, u.y, tx, ty)) return false;
    return true;
  }

  // ---------------- 建局 ----------------
  var TEAM_NAMES = [
    ['你', '艾达', '博尔', '昆恩', '莱恩'],
    ['敌-1', '敌-2', '敌-3', '敌-4', '敌-5']
  ];

  function defaultLoadout() {
    return { weapon: 'pistol', ammo: 'w', items: ['w', 'f'] };
  }

  function createGame(modeKey, playerLoadout) {
    M = MAPS[modeKey] || MAPS.large;
    var lo = playerLoadout || defaultLoadout();
    var n = M.cols * M.rows;
    DYN = [];

    var unlocked = { pistol: true };
    var g = {
      t: 0, _dt: 0, nextId: 1, map: M,
      units: [], zones: [], bullets: [], grenades: [],
      fogs: [], traps: [], barrels: [], walls: [], fx: [], events: [],
      vision: {}, visionR: {}, inputs: {}, hist: [], histPool: [],
      field: {
        w: new Float32Array(n), f: new Float32Array(n), e: new Float32Array(n),
        cd: new Float32Array(n), kind: new Uint8Array(n), inten: new Float32Array(n)
      },
      stats: { tri: 0, vapor: 0, overload: 0, shock: 0, cells: 0 },
      totals: { tri: 0, vapor: 0, overload: 0, shock: 0 },
      covers: M.covers,
      killLog: [], sfx: [],
      score: [0, 0], winner: -1,
      loadout: lo, unlocked: unlocked
    };
    g._visited = new Uint8Array(n);

    if (!unlocked[lo.weapon]) lo.weapon = 'pistol';

    var aiWeapons = ['rifle', 'smg', 'shotgun', 'dmr', 'lmg', 'sniper'];
    for (var t = 0; t < 2; t++) {
      for (var i = 0; i < M.teamSize; i++) {
        var isP = (t === 0 && i === 0);
        var wkey = isP ? lo.weapon : 'pistol';
        var u = makeUnit(g, {
          team: t, name: TEAM_NAMES[t][i], x: M.spawns[t][i].x, y: M.spawns[t][i].y,
          aim: t === 0 ? 0 : Math.PI, weapon: wkey, isPlayer: isP
        });
        if (isP) {
          u.ammoElem = lo.ammo;
          u.items = lo.items.slice();
        } else {
          u.ammoElem = ['w', 'f', 'e'][(i + t) % 3];
          var pick = ['w', 'f', 'e', 'd'].slice();
          for (var s = pick.length - 1; s > 0; s--) {
            var j = Math.floor(Math.random() * (s + 1));
            var tmp = pick[s]; pick[s] = pick[j]; pick[j] = tmp;
          }
          u.items = [pick[0], pick[1]];
        }
        u.aiLane = (i - (M.teamSize - 1) / 2) * 115;
      }
    }
    g.player = g.units[0];
    g.unlocked = g.player.unlocked;
    if (M.dummy) {
      var dm = g.units.find(function (x) { return x.team === 1; });
      if (dm) {
        dm.isDummy = true;
        dm.maxHp = 5000; dm.hp = 5000;
        dm.weapon = 'pistol';
        dm.x = M.w * 0.6; dm.y = M.h / 2;
        dm.dummyHome = { x: dm.x, y: dm.y };
        g.dummy = dm;
      }
    }
    for (var ei = 0; ei < g.units.length; ei++) {
      if (g.units[ei].team === 1) { g.enemy = g.units[ei]; break; }
    }

    for (var b = 0; b < M.barrels.length; b++) {
      g.barrels.push({ id: g.nextId++, x: M.barrels[b][0], y: M.barrels[b][1], r: 16, hp: 80, maxHp: 80, alive: true, respawnT: 0 });
    }
    for (var uu = 0; uu < g.units.length; uu++) {
      g.inputs[g.units[uu].id] = { mx: 0, my: 0, aim: g.units[uu].aim, shoot: false, throwElem: null };
    }
    buildWalk();
    return g;
  }

  function makeUnit(g, o) {
    var w = WEAPONS[o.weapon || 'pistol'];
    var u = {
      id: g.nextId++, team: o.team, name: o.name,
      x: o.x, y: o.y, r: UNIT_R,
      hp: CFG.unitHp, maxHp: CFG.unitHp,
      aim: o.aim || 0, vx: 0, vy: 0,
      alive: true, isPlayer: !!o.isPlayer,
      status: { w: 0, f: 0, e: 0 },
      stun: 0, slowT: 0, vulnT: 0, protT: CFG.spawnProt,
      shockCd: 0, phaseT: 0,
      stamina: CFG.staminaMax, sprinting: false,
      weapon: o.weapon || 'pistol', ammoElem: 'w',
      items: ['w', 'f'], itemCd: { w: 0, f: 0, e: 0, d: 0 },
      mag: w.mag, reloadT: 0, fireT: 0, fireMoveT: 0,
      streak: 0, ksItem: null, revealT: 0,
      money: 0,
      talents: { lifesteal: false, rubber: false, eagle: false, regenArmor: false, heavyArmor: false, thirdEye: false },
      armor: 0, armorMax: 0, lastDmgT: 0,
      shield: 0, fearT: 0, mudT: 0,
      unlocked: { pistol: true },
      outSpawn: false,
      kills: 0, deaths: 0, dmg: 0,
      lastHitBy: null, respawnT: 0, _prevShoot: false
    };
    g.units.push(u);
    return u;
  }

  function inSpawnZone(u) {
    var z = M.spawnZones[u.team];
    return u.x >= z.x0 && u.x <= z.x1 && u.y >= z.y0 && u.y <= z.y1;
  }

  // ---------------- 伤害 ----------------
  var ELEM_HOW = { '蒸发': 1, '超载爆炸': 1, '感电陷阱': 1, '三相共鸣': 1, '燃烧': 1, '空袭': 1 };

  function damage(g, u, amount, src, how, noNum) {
    if (!u.alive || u.protT > 0) return;
    amount *= CFG.dmgMult;
    if (u.vulnT > 0) amount *= 1.5;
    u.lastDmgT = 0;
    if (u.shield > 0) {
      var sh = Math.min(u.shield, amount);
      u.shield -= sh; amount -= sh;
    }
    if (amount > 0 && u.armor > 0) {
      var ar = Math.min(u.armor, amount);
      u.armor -= ar; amount -= ar;
    }
    u.hp -= amount;
    if (src && src.team !== u.team) { if (!noNum) src.dmg += amount; u.lastHitBy = src; }
    if (!noNum && amount >= 2) {
      sfxPush(g, {
        t: 'dmg', uid: u.id, x: u.x, y: u.y - 10, amt: Math.round(amount),
        how: how || '', elem: (src && src.ammoElem) || null,
        srcTeam: src ? src.team : -1, dstTeam: u.team,
        mine: !!(src && src.isPlayer), big: amount >= 60
      });
    }
    if (u.hp > 0) return;

    u.hp = 0; u.alive = false; u.respawnT = CFG.respawn;
    u.deaths++;
    u.streak = 0;
    u.phaseT = 0;

    var credit = (u.lastHitBy && u.lastHitBy.team !== u.team) ? u.lastHitBy : null;
    var killerName = credit ? credit.name : '环境';
    if (credit) {
      credit.kills++;
      credit.streak++;
      var earn = ELEM_HOW[how] ? CFG.killMoneyElem : CFG.killMoneyGun;
      credit.money += earn;
      if (credit.isPlayer) {
        sfxPush(g, { t: 'killfx', victim: u.name, how: how || '伤害', money: earn, weapon: credit.weapon });
      }
      if (credit.talents && credit.talents.lifesteal) {
        credit.hp = Math.min(credit.maxHp, credit.hp + credit.maxHp * CFG.talentHeal);
        g.fx.push({ type: 'heal', x: credit.x, y: credit.y, life: 0.6, max: 0.6, r: 50 });
      }
      if (credit.fearT > 0) credit.fearT += CFG.fearKillExtend;
      g.score[credit.team]++;
      grantStreak(g, credit);
    }
    g.events.push({ type: 'kill', killer: killerName, victim: u.name, t: g.t, how: how || '伤害' });
    g.killLog.push({ killer: killerName, victim: u.name, t: g.t, how: how || '伤害', team: credit ? credit.team : -1 });
    if (g.killLog.length > 7) g.killLog.shift();
    sfxPush(g, { t: 'kill', x: u.x, y: u.y, mine: credit ? credit.isPlayer : false });

    if (g.score[0] >= M.killTarget) g.winner = 0;
    if (g.score[1] >= M.killTarget) g.winner = 1;
  }

  function grantStreak(g, u) {
    var s = u.streak;
    if (s === CFG.winStreak) {
      u.ksItem = 'fear';
      g.events.push({ type: 'streak', name: u.name, tier: 20, t: g.t });
      sfxPush(g, { t: 'streak', tier: 20, mine: u.isPlayer });
      return;
    }
    if (s === 13) u.ksItem = 'bomb';
    else if (s === 9) u.ksItem = 'reveal';
    else if (s === 5) u.ksItem = 'phase';
    else return;
    g.events.push({ type: 'streak', name: u.name, tier: s, t: g.t });
    sfxPush(g, { t: 'streak', tier: s, mine: u.isPlayer });
  }

  function useKsItem(g, u, tx, ty) {
    if (!u.ksItem || !u.alive) return false;
    if (u.ksItem === 'phase') {
      u.phaseT = CFG.streakPhase;
      u.ksItem = null;
      sfxPush(g, { t: 'heal', x: u.x, y: u.y, mine: u.isPlayer });
      g.fx.push({ type: 'phase', x: u.x, y: u.y, life: 0.7, max: 0.7, r: 50 });
      return true;
    }
    if (u.ksItem === 'reveal') {
      u.revealT = CFG.streakReveal;
      u.ksItem = null;
      g.fx.push({ type: 'phase', x: u.x, y: u.y, life: 0.7, max: 0.7, r: 70 });
      return true;
    }
    if (u.ksItem === 'fear') {
      u.fearT = CFG.fearDur;
      u.shield = Math.max(u.shield, CFG.fearShield);
      u.ksItem = null;
      g.fx.push({ type: 'phase', x: u.x, y: u.y, life: 0.9, max: 0.9, r: 80 });
      sfxPush(g, { t: 'streak', tier: 20, mine: u.isPlayer });
      return true;
    }
    if (u.ksItem === 'bomb') {
      var d = Math.sqrt(dist2(u.x, u.y, tx, ty));
      var maxD = 900;
      if (d > maxD) { tx = u.x + (tx - u.x) / d * maxD; ty = u.y + (ty - u.y) / d * maxD; }
      g.grenades.push({
        x: u.x, y: u.y, sx: u.x, sy: u.y, tx: tx, ty: ty, t: 0,
        dur: 0.5 + d / 900, elem: 'f', owner: u, bomb: true
      });
      u.ksItem = null;
      return true;
    }
    return false;
  }

  function addStatus(u, elem, amount) { u.status[elem] = clamp(u.status[elem] + amount, 0, 100); }

  function aoeDamage(g, x, y, r, dmg, src, knock, how) {
    for (var i = 0; i < g.units.length; i++) {
      var u = g.units[i];
      if (!u.alive) continue;
      var d = Math.sqrt(dist2(u.x, u.y, x, y));
      if (d > r + u.r) continue;
      damage(g, u, dmg * (1 - 0.5 * (d / r)), src, how);
      if (knock) {
        var ang = Math.atan2(u.y - y, u.x - x);
        u.vx += Math.cos(ang) * knock;
        u.vy += Math.sin(ang) * knock;
      }
    }
    for (var b = 0; b < g.barrels.length; b++) {
      var br = g.barrels[b];
      if (!br.alive) continue;
      if (dist2(br.x, br.y, x, y) < (r + br.r) * (r + br.r)) damageBarrel(g, br, dmg, src);
    }
    for (var wi = 0; wi < g.walls.length; wi++) {
      var wl = g.walls[wi];
      if (dist2(wl.cx, wl.cy, x, y) < (r + wl.w) * (r + wl.w)) wl.hp -= dmg;
    }
  }

  function damageBarrel(g, b, amount, src) {
    if (!b.alive) return;
    b.hp -= amount * CFG.dmgMult;
    if (b.hp <= 0) { b.alive = false; b.respawnT = CFG.barrelRespawn; explodeBarrel(g, b, src); }
  }

  function explodeBarrel(g, b, src) {
    aoeDamage(g, b.x, b.y, 150, 55, src, CFG.barrelKnock, '火药桶');
    sfxPush(g, { t: 'boom', x: b.x, y: b.y, size: 1 });
    g.fx.push({ type: 'boom', x: b.x, y: b.y, life: 0.5, max: 0.5, r: 150 });
    g.zones.push({ id: g.nextId++, elem: 'f', x: b.x, y: b.y, r: CFG.zoneR * 0.8, fuel: CFG.zoneFuel, maxFuel: CFG.zoneFuel, owner: src || null });
  }

  // ---------------- 场 ----------------
  function dominantOwner(g, cx, cy, elem) {
    var best = null, bestAmt = 0;
    for (var i = 0; i < g.zones.length; i++) {
      var z = g.zones[i];
      if (z.elem !== elem || !z.owner) continue;
      var d2 = dist2(cx, cy, z.x, z.y);
      if (d2 >= z.r * z.r) continue;
      var amt = z.fuel * (1 - 0.7 * d2 / (z.r * z.r));
      if (amt > bestAmt) { bestAmt = amt; best = z.owner; }
    }
    return best;
  }

  // 延迟补偿：查某个单位在 t 时刻的历史位置
  function histPos(g, id, t) {
    var h = g.hist;
    for (var i = h.length - 1; i >= 0; i--) {
      if (h[i].t <= t) {
        var p = h[i].p;
        for (var j = 0; j < p.length; j++) if (p[j][0] === id) return p[j];
        return null;
      }
    }
    return null;
  }

  // 联机客户端用：只做视觉烘焙（浓度 + 分类），不消耗、不反应
  function bakeVisual(g) {
    if (!g || !g.field) return;
    fillConc(g);
    var f = g.field, n = M.cols * M.rows, i;
    for (i = 0; i < n; i++) {
      var w = f.w[i], fi = f.f[i], el = f.e[i];
      var maxv = Math.max(w, fi, el);
      if (maxv < CFG.theta) { f.kind[i] = 0; f.inten[i] = 0; continue; }
      var act = 0;
      if (w >= CFG.theta) act |= 1;
      if (fi >= CFG.theta) act |= 2;
      if (el >= CFG.theta) act |= 4;
      f.inten[i] = clamp(maxv / 100, 0, 1);
      if (act === 1) f.kind[i] = K.W;
      else if (act === 2) f.kind[i] = K.F;
      else if (act === 4) f.kind[i] = K.E;
      else if (act === 3) f.kind[i] = K.VAPOR;
      else if (act === 6) f.kind[i] = K.OVERLOAD;
      else if (act === 5) f.kind[i] = K.SHOCK;
      else f.kind[i] = K.TRI;
    }
  }

  // ---------------- 商店（单机与联机共用同一套规则） ----------------
  var TALENTS = [
    { k: 'lifesteal', name: '击杀回血', cost: 1500 },
    { k: 'rubber', name: '橡胶子弹', cost: 3000 },
    { k: 'eagle', name: '鹰眼视野', cost: 2000 },
    { k: 'thirdEye', name: '第三只眼', cost: 2400 }
  ];
  var ARMORS = [
    { k: 'regenArmor', name: '再生护甲', cost: 2000 },
    { k: 'heavyArmor', name: '重型护甲', cost: 2200 }
  ];

  function findDef(list, key) {
    for (var i = 0; i < list.length; i++) if (list[i].k === key) return list[i];
    return null;
  }

  // 返回 'ok' | 'owned' | 'money' | 'locked' | 'bad'
  function shopBuy(g, u, kind, key, dat) {
    if (!u) return 'bad';
    if (kind === 'weapon') {
      var w = WEAPONS[key];
      if (!w) return 'bad';
      if (u.unlocked[key]) return 'owned';
      if (u.money < w.cost) return 'money';
      u.money -= w.cost;
      u.unlocked[key] = true;
      return 'ok';
    }
    if (kind === 'talent') {
      var t = findDef(TALENTS, key);
      if (!t) return 'bad';
      if (u.talents[key]) return 'owned';
      if (u.money < t.cost) return 'money';
      u.money -= t.cost;
      u.talents[key] = true;
      return 'ok';
    }
    if (kind === 'armor') {
      var a = findDef(ARMORS, key);
      if (!a) return 'bad';
      if (u.talents.regenArmor || u.talents.heavyArmor) return 'locked';
      if (u.money < a.cost) return 'money';
      u.money -= a.cost;
      u.talents.regenArmor = (key === 'regenArmor');
      u.talents.heavyArmor = (key === 'heavyArmor');
      u.armorMax = (key === 'regenArmor') ? CFG.regenArmorMax : CFG.heavyArmorMax;
      u.armor = u.armorMax;
      return 'ok';
    }
    if (kind === 'loadout') {
      if (!dat || !dat.weapon || !u.unlocked[dat.weapon]) return 'locked';
      u.weapon = dat.weapon;
      u.mag = WEAPONS[dat.weapon].mag;
      u.reloadT = 0;
      if (dat.ammo) u.ammoElem = dat.ammo;
      if (dat.items && dat.items.length === 2) u.items = dat.items.slice();
      return 'ok';
    }
    if (kind === 'weaponSwitch') {
      if (!u.unlocked[key]) return 'locked';
      u.weapon = key;
      u.mag = WEAPONS[key].mag;
      u.reloadT = 0;
      return 'ok';
    }
    return 'bad';
  }

  function consumeZone(g, cx, cy, elem, amount) {
    var contributing = [], total = 0, i, z, d2v, amt;
    for (i = 0; i < g.zones.length; i++) {
      z = g.zones[i];
      if (z.elem !== elem) continue;
      d2v = dist2(cx, cy, z.x, z.y);
      if (d2v >= z.r * z.r) continue;
      amt = z.fuel * (1 - 0.7 * d2v / (z.r * z.r));
      contributing.push([z, amt]); total += amt;
    }
    if (total <= 0) return;
    for (i = 0; i < contributing.length; i++) contributing[i][0].fuel -= amount * (contributing[i][1] / total);
  }

  function bakeField(g) {
    var f = g.field, n = M.cols * M.rows, dt = g._dt, i;
    for (i = 0; i < n; i++) { if (f.cd[i] > 0) { f.cd[i] -= dt; if (f.cd[i] < 0) f.cd[i] = 0; } }
    fillConc(g);
  }

  // 只算浓度，不处理冷却/反应（联机客户端做视觉用）
  function fillConc(g) {
    var f = g.field, n = M.cols * M.rows, i;
    f.w.fill(0); f.f.fill(0); f.e.fill(0);

    // 水坑：永久水源
    for (var pi = 0; pi < M.puddles.length; pi++) {
      var pd = M.puddles[pi];
      var i0 = Math.max(0, Math.floor(pd[0] / CELL)), i1 = Math.min(M.cols - 1, Math.floor(pd[2] / CELL));
      var j0 = Math.max(0, Math.floor(pd[1] / CELL)), j1 = Math.min(M.rows - 1, Math.floor(pd[3] / CELL));
      for (var j = j0; j <= j1; j++) {
        for (var ii = i0; ii <= i1; ii++) {
          var cx = ii * CELL + CELL / 2, cy = j * CELL + CELL / 2;
          if (!inRect(cx, cy, pd)) continue;
          f.w[j * M.cols + ii] += CFG.puddleStrength;
        }
      }
    }

    for (var zi = 0; zi < g.zones.length; zi++) {
      var z = g.zones[zi];
      var arr = f[z.elem];
      var a0 = Math.max(0, Math.floor((z.x - z.r) / CELL));
      var a1 = Math.min(M.cols - 1, Math.floor((z.x + z.r) / CELL));
      var b0 = Math.max(0, Math.floor((z.y - z.r) / CELL));
      var b1 = Math.min(M.rows - 1, Math.floor((z.y + z.r) / CELL));
      var rr = z.r * z.r;
      for (var jj = b0; jj <= b1; jj++) {
        for (var kk = a0; kk <= a1; kk++) {
          var c2x = kk * CELL + CELL / 2, c2y = jj * CELL + CELL / 2;
          var dx = c2x - z.x, dy = c2y - z.y;
          var d2 = dx * dx + dy * dy;
          if (d2 >= rr) continue;
          arr[jj * M.cols + kk] += z.fuel * (1 - 0.7 * d2 / rr);
        }
      }
    }

    // 泥沼：抵消范围内的水浓度，并吞噬水区域
    for (var wi = 0; wi < g.walls.length; wi++) {
      var wl0 = g.walls[wi];
      var mr = wl0.mudR || 0;
      if (!mr) continue;
      var mi0 = Math.max(0, Math.floor((wl0.cx - mr) / CELL));
      var mi1 = Math.min(M.cols - 1, Math.floor((wl0.cx + mr) / CELL));
      var mj0 = Math.max(0, Math.floor((wl0.cy - mr) / CELL));
      var mj1 = Math.min(M.rows - 1, Math.floor((wl0.cy + mr) / CELL));
      var mr2 = mr * mr;
      for (var mj = mj0; mj <= mj1; mj++) {
        for (var mi = mi0; mi <= mi1; mi++) {
          var mx2 = mi * CELL + CELL / 2, my2 = mj * CELL + CELL / 2;
          if (dist2(mx2, my2, wl0.cx, wl0.cy) < mr2) f.w[mj * M.cols + mi] = 0;
        }
      }
      for (var zz = 0; zz < g.zones.length; zz++) {
        var zw = g.zones[zz];
        if (zw.elem !== 'w') continue;
        if (dist2(zw.x, zw.y, wl0.cx, wl0.cy) < (mr + zw.r) * (mr + zw.r)) zw.fuel -= 70 * g._dt;
      }
    }
  }

  function resolveCells(g) {
    var f = g.field, n = M.cols * M.rows, i, w, fi, el, maxv, act;
    for (i = 0; i < n; i++) {
      w = f.w[i]; fi = f.f[i]; el = f.e[i];
      maxv = Math.max(w, fi, el);
      if (maxv < CFG.theta) { f.kind[i] = 0; f.inten[i] = 0; continue; }
      act = 0;
      if (w >= CFG.theta) act |= 1;
      if (fi >= CFG.theta) act |= 2;
      if (el >= CFG.theta) act |= 4;
      f.inten[i] = clamp(maxv / 100, 0, 1);
      if (act === 1) f.kind[i] = K.W;
      else if (act === 2) f.kind[i] = K.F;
      else if (act === 4) f.kind[i] = K.E;
      else if (act === 3) f.kind[i] = K.VAPOR;
      else if (act === 6) f.kind[i] = K.OVERLOAD;
      else if (act === 5) f.kind[i] = K.SHOCK;
      else f.kind[i] = K.TRI;
      if (f.cd[i] > 0 && act > 4) f.inten[i] *= 0.5;
    }

    var visited = g._visited;
    visited.fill(0);
    var groups = [];
    for (i = 0; i < n; i++) {
      if (visited[i] || f.cd[i] > 0) continue;
      var kd = f.kind[i];
      if (kd < K.VAPOR) continue;
      visited[i] = 1;
      var stack = [i], cells = [i], bx = 0, by = 0;
      while (stack.length) {
        var c = stack.pop();
        bx += (c % M.cols) * CELL + CELL / 2;
        by += Math.floor(c / M.cols) * CELL + CELL / 2;
        for (var d = 0; d < 4; d++) {
          if (d === 0 && c % M.cols === 0) continue;
          if (d === 1 && c % M.cols === M.cols - 1) continue;
          var ni = c + (d === 0 ? -1 : d === 1 ? 1 : d === 2 ? -M.cols : M.cols);
          if (ni < 0 || ni >= n) continue;
          if (visited[ni] || f.cd[ni] > 0 || f.kind[ni] !== kd) continue;
          visited[ni] = 1; stack.push(ni); cells.push(ni);
        }
      }
      groups.push({ k: kd, cells: cells, x: bx / cells.length, y: by / cells.length });
    }

    var tri = 0, vap = 0, ovl = 0, shk = 0, budget = REACT_BUDGET;
    for (var gi = 0; gi < groups.length && budget > 0; gi++, budget--) {
      var grp = groups[gi];
      var size = grp.cells.length, sq = Math.sqrt(size);
      var cost = CFG.reactCost + size * CFG.reactCoeff;
      var cd = grp.k === K.TRI ? 6 : grp.k === K.VAPOR ? 0.5 : grp.k === K.OVERLOAD ? 1.5 : 1.0;
      for (var ci = 0; ci < size; ci++) f.cd[grp.cells[ci]] = cd;

      if (grp.k === K.VAPOR) {
        vap++; g.totals.vapor++;
        consumeZone(g, grp.x, grp.y, 'w', cost);
        consumeZone(g, grp.x, grp.y, 'f', cost);
        sfxPush(g, { t: 'vapor', x: grp.x, y: grp.y });
        if (g.fogs.length < 60) g.fogs.push({ x: grp.x, y: grp.y, r: CFG.fogR + 1.4 * sq, life: CFG.fogDur, maxLife: CFG.fogDur });
        g.fx.push({ type: 'vapor', x: grp.x, y: grp.y, life: 0.55, max: 0.55, r: 50 + 2 * sq });
      } else if (grp.k === K.OVERLOAD) {
        ovl++; g.totals.overload++;
        var bo = dominantOwner(g, grp.x, grp.y, 'f') || dominantOwner(g, grp.x, grp.y, 'e');
        consumeZone(g, grp.x, grp.y, 'f', cost);
        consumeZone(g, grp.x, grp.y, 'e', cost);
        var rad = 52 + 3.6 * sq;
        aoeDamage(g, grp.x, grp.y, rad, 28 * (1 + 0.12 * Math.min(2, size / 30)), bo, 300, '超载爆炸');
        sfxPush(g, { t: 'boom', x: grp.x, y: grp.y, size: 1 });
        g.fx.push({ type: 'boom', x: grp.x, y: grp.y, life: 0.42, max: 0.42, r: rad });
      } else if (grp.k === K.SHOCK) {
        shk++; g.totals.shock++;
        consumeZone(g, grp.x, grp.y, 'w', cost);
        consumeZone(g, grp.x, grp.y, 'e', cost);
        var rad2 = 46 + 2.8 * sq;
        if (g.traps.length < 40) g.traps.push({ x: grp.x, y: grp.y, r: rad2, life: 2.2, maxLife: 2.2 });
        sfxPush(g, { t: 'shock', x: grp.x, y: grp.y });
        g.fx.push({ type: 'shock', x: grp.x, y: grp.y, life: 0.45, max: 0.45, r: rad2 });
      } else {
        tri++; g.totals.tri++;
        var to = dominantOwner(g, grp.x, grp.y, 'w') || dominantOwner(g, grp.x, grp.y, 'f') || dominantOwner(g, grp.x, grp.y, 'e');
        consumeZone(g, grp.x, grp.y, 'w', cost);
        consumeZone(g, grp.x, grp.y, 'f', cost);
        consumeZone(g, grp.x, grp.y, 'e', cost);
        var rad3 = 66 + 3.2 * sq;
        aoeDamage(g, grp.x, grp.y, rad3, 42, to, 260, '三相共鸣');
        sfxPush(g, { t: 'tri', x: grp.x, y: grp.y });
        for (var ui = 0; ui < g.units.length; ui++) {
          var uu = g.units[ui];
          if (!uu.alive) continue;
          if (dist2(uu.x, uu.y, grp.x, grp.y) < rad3 * rad3) { uu.slowT = 2.0; uu.vulnT = 3.0; }
        }
        g.fx.push({ type: 'tri', x: grp.x, y: grp.y, life: 0.85, max: 0.85, r: rad3 });
      }
    }
    g.stats.tri = tri; g.stats.vapor = vap; g.stats.overload = ovl; g.stats.shock = shk;
    g.stats.cells = groups.length;
  }

  // ---------------- 射击 ----------------
  function reloadTime(u, w) { return w.reload / (u.fearT > 0 ? CFG.fearReload : 1); }

  function rangeMult(range, d) {
    if (!range || d <= range) return 1;
    return Math.max(0.4, 1 - 0.6 * (d - range) / range);
  }

  function meleeSwing(g, u, w) {
    u.fireT = 60 / w.rpm;
    u.protT = 0;
    u.fireMoveT = 0.2;
    var cos = Math.cos(u.aim), sin = Math.sin(u.aim);
    var reach = w.range, halfW = 46;
    var ox = u.x + cos * 14, oy = u.y + sin * 14;
    var hits = 0;
    for (var i = 0; i < g.units.length; i++) {
      var t = g.units[i];
      if (!t.alive || t.team === u.team) continue;
      var dx = t.x - ox, dy = t.y - oy;
      var fwd = dx * cos + dy * sin;
      var side = Math.abs(-dx * sin + dy * cos);
      if (fwd < -8 || fwd > reach + t.r || side > halfW + t.r) continue;
      var tx = u.x - t.x, ty = u.y - t.y;
      var len = Math.sqrt(tx * tx + ty * ty) || 1;
      var dot = (Math.cos(t.aim) * tx + Math.sin(t.aim) * ty) / len;
      var back = dot < -0.35;
      damage(g, t, w.dmg * (back ? 2 : 1), u, back ? '背刺' : '长刀');
      addStatus(t, u.ammoElem, CFG.bulletStatus * 1.5);
      hits++;
    }
    g.fx.push({ type: 'slash', x: ox, y: oy, life: 0.24, max: 0.24, r: reach, ang: u.aim, elem: u.ammoElem });
    sfxPush(g, { t: 'shoot', w: 'blade', x: u.x, y: u.y, mine: u.isPlayer });
    return hits;
  }

  function tryFire(g, u, shootDown) {
    var w = WEAPONS[u.weapon];
    if (w.semi && u._prevShoot) return;      // 单点武器：必须松开再按
    if (u.reloadT > 0 || u.fireT > 0 || u.stun > 0 || !u.alive) return;
    if (w.melee) { meleeSwing(g, u, w); return; }
    if (u.mag <= 0) { u.reloadT = reloadTime(u, w); return; }
    u.mag--;
    var rate = 60 / w.rpm;
    if (u.fearT > 0) rate /= CFG.fearRate;
    if (u.mudT > 0) rate *= CFG.mudFire;
    u.fireT = rate;
    u.protT = 0;
    u.fireMoveT = 0.25;
    // 子弹起点：如果有延迟补偿，用自己 lag 之前的位置
    // 否则服务端用当前位置开枪，而玩家在屏幕上看到的自己在更前面 → 枪口明显错位
    var ox = u.x, oy = u.y;
    if (CFG.lagComp && u.lag > 0) {
      var hp = histPos(g, u.id, g.t - Math.min(CFG.lagMax, u.lag));
      if (hp) { ox = hp[1]; oy = hp[2]; }
    }
    var moving = u._moving;
    var spread = w.spread * (moving ? (w.moveSpread || 1) : 1);
    var pellets = w.pellets || 1;
    for (var p = 0; p < pellets; p++) {
      var ang = u.aim + (Math.random() - 0.5) * spread * 2;
      g.bullets.push({
        x: ox + Math.cos(ang) * 16, y: oy + Math.sin(ang) * 16,
        vx: Math.cos(ang) * w.speed, vy: Math.sin(ang) * w.speed,
        elem: u.ammoElem, dmg: w.dmg, owner: u, team: u.team, life: 2.2,
        pierce: w.pierce ? 3 : 0, hitIds: null, dmgMul: 1,
        bounces: (u.talents && u.talents.rubber) ? 1 : 0,
        sx: ox, sy: oy, range: w.range || 0, wallPierce: !!w.pierce,
        lag: (CFG.lagComp && u.lag) ? Math.min(CFG.lagMax, u.lag) : 0
      });
    }
    sfxPush(g, { t: 'shoot', w: u.weapon, x: ox, y: oy, mine: u.isPlayer });
    if (u.mag <= 0) u.reloadT = reloadTime(u, w);
  }

  function bulletBlockedByWall(g, x1, y1, x2, y2) {
    for (var i = 0; i < g.walls.length; i++) {
      var wl = g.walls[i];
      var t = segAABB(x1, y1, x2, y2, wl.rect);
      if (t >= 0) return { t: t, wall: wl };
    }
    return null;
  }

  function updateBullets(g, dt) {
    var out = [];
    for (var i = 0; i < g.bullets.length; i++) {
      var b = g.bullets[i];
      var alive = true;
      var stepLeft = 1;

      while (stepLeft > 0 && alive) {
        var nx = b.x + b.vx * dt * stepLeft, ny = b.y + b.vy * dt * stepLeft;
        var hitT = 2, hitUnit = null, hitBarrel = null, hitCover = 2, hitWall = null, hitCoverRect = null;

        for (var j = 0; j < g.units.length; j++) {
          var u = g.units[j];
          if (!u.alive || u.team === b.team) continue;
          if (b.hitIds && b.hitIds.indexOf(u.id) >= 0) continue;
          var hx = u.x, hy = u.y, hr = u.r;
          if (b.lag > 0) {
            var hp = histPos(g, u.id, g.t - b.lag);
            if (hp) { hx = hp[1]; hy = hp[2]; hr = hp[3]; }
          }
          var t = segCircle(b.x, b.y, nx, ny, hx, hy, hr);
          if (t >= 0 && t < hitT) { hitT = t; hitUnit = u; hitBarrel = null; hitWall = null; }
        }
        for (var bi = 0; bi < g.barrels.length; bi++) {
          var br = g.barrels[bi];
          if (!br.alive) continue;
          var tb = segCircle(b.x, b.y, nx, ny, br.x, br.y, br.r);
          if (tb >= 0 && tb < hitT) { hitT = tb; hitUnit = null; hitBarrel = br; hitWall = null; }
        }
        for (var c = 0; c < M.covers.length; c++) {
          var tc = segAABB(b.x, b.y, nx, ny, M.covers[c]);
          if (tc >= 0 && tc < hitCover) { hitCover = tc; hitWall = null; hitCoverRect = M.covers[c]; }
        }
        var wb = bulletBlockedByWall(g, b.x, b.y, nx, ny);
        if (wb && wb.t < hitCover) { hitCover = wb.t; hitWall = wb.wall; hitUnit = null; hitBarrel = null; }

        if (hitUnit && hitT < hitCover) {
          var bd = Math.sqrt(dist2(b.sx, b.sy, hitUnit.x, hitUnit.y));
          damage(g, hitUnit, b.dmg * b.dmgMul * rangeMult(b.range, bd), b.owner, '子弹');
          addStatus(hitUnit, b.elem, CFG.bulletStatus);
          sfxPush(g, { t: 'hit', elem: b.elem, x: hitUnit.x, y: hitUnit.y, mine: b.owner.isPlayer });
          g.fx.push({ type: 'spark', x: hitUnit.x, y: hitUnit.y, life: 0.25, max: 0.25, r: 22, elem: b.elem });
          if (b.pierce > 0) {
            b.pierce--;
            b.dmgMul *= 0.75;
            if (!b.hitIds) b.hitIds = [];
            b.hitIds.push(hitUnit.id);
            stepLeft *= (1 - hitT);
            b.x += b.vx * dt * hitT; b.y += b.vy * dt * hitT;
            continue;
          }
          alive = false;
          break;
        }
        if ((hitBarrel || hitWall) && hitT < hitCover) {
          if (hitBarrel) {
            damageBarrel(g, hitBarrel, b.dmg * b.dmgMul, b.owner);
            g.fx.push({ type: 'spark', x: hitBarrel.x, y: hitBarrel.y, life: 0.25, max: 0.25, r: 20, elem: b.elem });
          }
          alive = false;
          break;
        }
        if (hitWall && b.wallPierce) {
          hitWall.hp -= b.dmg * b.dmgMul * 2;
          hitWall.flash = 0.15;
          b.dmgMul *= 0.5;
          // 把子弹直接送到墙的另一侧，避免卡在墙体内反复命中
          var rr3 = hitWall.rect;
          var hx3 = b.x + b.vx * dt * stepLeft * hitCover;
          var hy3 = b.y + b.vy * dt * stepLeft * hitCover;
          if (Math.abs(b.vx) >= Math.abs(b.vy)) {
            var ex3 = b.vx > 0 ? rr3[2] + 3 : rr3[0] - 3;
            var k3 = (ex3 - hx3) / b.vx;
            b.x = ex3;
            b.y = hy3 + b.vy * k3;
          } else {
            var ey3 = b.vy > 0 ? rr3[3] + 3 : rr3[1] - 3;
            var k4 = (ey3 - hy3) / b.vy;
            b.y = ey3;
            b.x = hx3 + b.vx * k4;
          }
          if (!isFinite(b.x) || !isFinite(b.y)) { alive = false; break; }
          stepLeft *= 0.5;
          sfxPush(g, { t: 'hit', elem: b.elem, x: b.x, y: b.y, mine: b.owner.isPlayer });
          continue;
        }
        if (hitCover < 2 && b.bounces > 0 && hitCoverRect) {
          b.bounces--;
          var bx2 = b.x + b.vx * dt * stepLeft * hitCover, by2 = b.y + b.vy * dt * stepLeft * hitCover;
          var rr2 = hitCoverRect;
          var dl2 = Math.abs(bx2 - rr2[0]), dr2 = Math.abs(rr2[2] - bx2);
          var dt2 = Math.abs(by2 - rr2[1]), db2 = Math.abs(rr2[3] - by2);
          var mm = Math.min(dl2, dr2, dt2, db2);
          if (mm === dl2 || mm === dr2) b.vx = -b.vx; else b.vy = -b.vy;
          b.x = bx2 + b.vx * 0.006; b.y = by2 + b.vy * 0.006;
          b.owner = b.owner;
          stepLeft *= (1 - hitCover) * 0.98;
          sfxPush(g, { t: 'hit', elem: b.elem, x: bx2, y: by2, mine: b.owner.isPlayer });
          g.fx.push({ type: 'spark', x: bx2, y: by2, life: 0.22, max: 0.22, r: 16, elem: b.elem });
          continue;
        }
        if (hitCover < 2) {
          var px = b.x + b.vx * dt * stepLeft * hitCover, py = b.y + b.vy * dt * stepLeft * hitCover;
          if (hitWall) {
            hitWall.hp -= b.dmg * b.dmgMul;
            hitWall.flash = 0.15;
          }
          g.fx.push({ type: 'spark', x: px, y: py, life: 0.2, max: 0.2, r: 14, elem: b.elem });
          alive = false;
          break;
        }
        b.x = nx; b.y = ny;
        stepLeft = 0;
      }

      b.life -= dt;
      if (alive && b.life > 0 && b.x > -40 && b.y > -40 && b.x < M.w + 40 && b.y < M.h + 40) out.push(b);
    }
    g.bullets = out;
  }

  // ---------------- 道具 ----------------
  function throwItem(g, u, slot, tx, ty) {
    if (!u.alive || u.stun > 0) return false;
    var elem = u.items[slot];
    if (!elem || u.itemCd[elem] > 0) return false;
    var d = Math.sqrt(dist2(u.x, u.y, tx, ty));
    var maxD = 560;
    if (d > maxD) { tx = u.x + (tx - u.x) / d * maxD; ty = u.y + (ty - u.y) / d * maxD; }
    u.itemCd[elem] = CFG.itemCd * (ITEMS[elem].cd / 8);
    u.protT = 0;
    g.grenades.push({
      x: u.x, y: u.y, sx: u.x, sy: u.y, tx: tx, ty: ty, t: 0,
      dur: 0.5 + Math.sqrt(dist2(u.x, u.y, tx, ty)) / 1400,
      elem: elem, owner: u,
      angle: Math.atan2(ty - u.y, tx - u.x)
    });
    sfxPush(g, { t: 'throw', x: u.x, y: u.y, mine: u.isPlayer });
    return true;
  }

  function spawnEarthWall(g, gr, owner) {
    var horiz = Math.abs(Math.cos(gr.angle)) > Math.abs(Math.sin(gr.angle));
    var w = horiz ? 44 : 190, h = horiz ? 190 : 44;
    var wall = {
      id: g.nextId++, cx: gr.tx, cy: gr.ty, w: w, h: h,
      rect: [gr.tx - w / 2, gr.ty - h / 2, gr.tx + w / 2, gr.ty + h / 2],
      hp: CFG.earthHp, maxHp: CFG.earthHp, life: CFG.earthLife, owner: owner, flash: 0, mudR: CFG.mudR
    };
    g.walls.push(wall);
    g.fx.push({ type: 'land', x: gr.tx, y: gr.ty, life: 0.5, max: 0.5, r: 90, elem: 'd' });
  }

  function updateGrenades(g, dt) {
    var out = [];
    for (var i = 0; i < g.grenades.length; i++) {
      var gr = g.grenades[i];
      gr.t += dt;
      var p = Math.min(1, gr.t / gr.dur);
      gr.x = gr.sx + (gr.tx - gr.sx) * p;
      gr.y = gr.sy + (gr.ty - gr.sy) * p;
      if (p >= 1) {
        if (gr.bomb) {
          aoeDamage(g, gr.tx, gr.ty, CFG.streakBombR, CFG.streakBombDmg, gr.owner, 520, '空袭');
          sfxPush(g, { t: 'boom', x: gr.tx, y: gr.ty, size: 2 });
          g.zones.push({ id: g.nextId++, elem: 'f', x: gr.tx, y: gr.ty, r: CFG.zoneR * 1.2, fuel: CFG.zoneFuel * 1.5, maxFuel: CFG.zoneFuel, owner: gr.owner });
          g.fx.push({ type: 'boom', x: gr.tx, y: gr.ty, life: 0.9, max: 0.9, r: CFG.streakBombR });
        } else if (gr.elem === 'd') {
          spawnEarthWall(g, gr, gr.owner);
          sfxPush(g, { t: 'land', x: gr.tx, y: gr.ty, elem: 'd' });
        } else {
          g.zones.push({ id: g.nextId++, elem: gr.elem, x: gr.tx, y: gr.ty, r: CFG.zoneR, fuel: CFG.zoneFuel, maxFuel: CFG.zoneFuel, owner: gr.owner });
          sfxPush(g, { t: 'land', x: gr.tx, y: gr.ty, elem: gr.elem });
          g.fx.push({ type: 'land', x: gr.tx, y: gr.ty, life: 0.5, max: 0.5, r: CFG.zoneR, elem: gr.elem });
        }
      } else out.push(gr);
    }
    g.grenades = out;

    // 土墙生命周期
    var wout = [];
    for (var w = 0; w < g.walls.length; w++) {
      var wl = g.walls[w];
      wl.life -= dt;
      if (wl.flash > 0) wl.flash -= dt;
      if (wl.life > 0 && wl.hp > 0) wout.push(wl);
      else g.fx.push({ type: 'land', x: wl.cx, y: wl.cy, life: 0.4, max: 0.4, r: 60, elem: 'd' });
    }
    g.walls = wout;
    DYN = g.walls.map(function (x) { return x.rect; });
  }

  // ---------------- 单位反应 ----------------
  function unitReactionCheck(g, u) {
    if (u.uReactCd > 0) return;
    var act = [];
    if (u.status.w >= CFG.statusThreshold) act.push('w');
    if (u.status.f >= CFG.statusThreshold) act.push('f');
    if (u.status.e >= CFG.statusThreshold) act.push('e');
    if (act.length < 2) return;

    var name = '蒸发';
    if (act.length === 3) name = '三相共鸣';
    else if (act.indexOf('f') >= 0 && act.indexOf('e') >= 0) name = '超载爆炸';
    else if (act.indexOf('w') >= 0 && act.indexOf('e') >= 0) name = '感电陷阱';

    u.uReactCd = 2.5;
    for (var i = 0; i < act.length; i++) u.status[act[i]] = Math.max(0, u.status[act[i]] - 50);

    if (name === '蒸发') {
      g.fogs.push({ x: u.x, y: u.y, r: CFG.fogR * 0.9, life: CFG.fogDur, maxLife: CFG.fogDur });
      u.slowT = 2.5;
      g.fx.push({ type: 'vapor', x: u.x, y: u.y, life: 0.5, max: 0.5, r: 60 });
    } else if (name === '超载爆炸') {
      aoeDamage(g, u.x, u.y, 80, 30, u.lastHitBy, 300, '超载爆炸');
      g.fx.push({ type: 'boom', x: u.x, y: u.y, life: 0.4, max: 0.4, r: 80 });
    } else if (name === '感电陷阱') {
      g.traps.push({ x: u.x, y: u.y, r: 78, life: 2.0, maxLife: 2.0 });
      g.fx.push({ type: 'shock', x: u.x, y: u.y, life: 0.45, max: 0.45, r: 78 });
    } else {
      aoeDamage(g, u.x, u.y, 100, 40, u.lastHitBy, 240, '三相共鸣');
      g.fx.push({ type: 'tri', x: u.x, y: u.y, life: 0.8, max: 0.8, r: 110 });
    }
  }

  // ---------------- 单位更新 ----------------
  function updateUnit(g, u, dt, inp) {
    var w = WEAPONS[u.weapon];
    if (u.fireT > 0) u.fireT -= dt;
    if (u.fireMoveT > 0) u.fireMoveT -= dt;
    if (u.uReactCd > 0) u.uReactCd -= dt;
    if (u.stun > 0) u.stun -= dt;
    if (u.slowT > 0) u.slowT -= dt;
    if (u.vulnT > 0) u.vulnT -= dt;
    if (u.protT > 0) u.protT -= dt;
    if (u.revealT > 0) u.revealT -= dt;
    if (u.phaseT > 0) u.phaseT -= dt;
    if (u.shockCd > 0) u.shockCd -= dt;
    if (u.fearT > 0) u.fearT -= dt;
    if (u.mudT > 0) u.mudT -= dt;
    u.lastDmgT += dt;
    if (u.talents.regenArmor && u.armor < u.armorMax && u.lastDmgT > CFG.regenArmorDelay) {
      u.armor = Math.min(u.armorMax, u.armor + CFG.regenArmorRate * dt);
    }
    for (var kk in u.itemCd) if (u.itemCd[kk] > 0) u.itemCd[kk] -= dt;

    if (u.reloadT > 0) {
      u.reloadT -= dt;
      if (u.reloadT <= 0) u.mag = w.mag;
    }
    if (u.reloadReq) {
      u.reloadReq = false;
      if (u.reloadT <= 0 && u.mag < w.mag) {
        u.reloadT = reloadTime(u, w);
        sfxPush(g, { t: 'reload', x: u.x, y: u.y, mine: u.isPlayer });
      }
    }

    for (var k in u.status) if (u.status[k] > 0) u.status[k] = Math.max(0, u.status[k] - CFG.statusDecay * dt);

    var ci = cellIndex(u.x, u.y), f = g.field;
    if (f.w[ci] >= CFG.theta) addStatus(u, 'w', CFG.statusGain * dt);
    if (f.f[ci] >= CFG.theta) addStatus(u, 'f', CFG.statusGain * dt);
    if (f.e[ci] >= CFG.theta) addStatus(u, 'e', CFG.statusGain * dt);

    // 触电：带内置冷却，防止无限麻痹
    if (u.status.e >= CFG.statusThreshold && u.shockCd <= 0) {
      u.stun = Math.max(u.stun, CFG.shockStun);
      u.shockCd = CFG.shockCd;
    }
    if (u.status.f >= CFG.statusThreshold) damage(g, u, 7 * dt, u.lastHitBy, '燃烧', true);

    for (var i = 0; i < g.fogs.length; i++) {
      if (dist2(u.x, u.y, g.fogs[i].x, g.fogs[i].y) < g.fogs[i].r * g.fogs[i].r) {
        u.slowT = Math.max(u.slowT, 0.3);
        damage(g, u, 4 * dt, u.lastHitBy, '蒸发', true);
        break;
      }
    }
    for (var t = 0; t < g.traps.length; t++) {
      var tr = g.traps[t];
      if (dist2(u.x, u.y, tr.x, tr.y) < tr.r * tr.r) {
        if (u.shockCd <= 0) { u.stun = Math.max(u.stun, CFG.shockStun); u.shockCd = CFG.shockCd; }
        addStatus(u, 'e', 10 * dt);
      }
    }

    for (var mw = 0; mw < g.walls.length; mw++) {
      var wl2 = g.walls[mw];
      if (!wl2.mudR) continue;
      if (dist2(u.x, u.y, wl2.cx, wl2.cy) < wl2.mudR * wl2.mudR) {
        u.mudT = 0.2;
        u.slowT = Math.max(u.slowT, CFG.mudSlow);
        break;
      }
    }

    unitReactionCheck(g, u);

    var sp = CFG.unitSpeed * (u.slowT > 0 ? 0.6 : 1);
    if (u.status.w >= CFG.statusThreshold) sp *= 0.6;
    if (u.fireMoveT > 0 && w.fireMove) sp *= w.fireMove;

    var ml = Math.sqrt(inp.mx * inp.mx + inp.my * inp.my);
    u._moving = ml > 0.1;

    // 疾跑
    var wantSprint = !!inp.sprint && u._moving && u.stun <= 0 && u.stamina > 1;
    u.sprinting = wantSprint;
    if (wantSprint) {
      sp *= CFG.sprintMul;
      u.stamina = Math.max(0, u.stamina - CFG.staminaDrain * dt);
    } else {
      u.stamina = Math.min(CFG.staminaMax, u.stamina + CFG.staminaRegen * dt);
    }

    if (u.stun <= 0) {
      if (ml > 1) { inp.mx /= ml; inp.my /= ml; }
      u.x += inp.mx * sp * dt;
      u.y += inp.my * sp * dt;
    }
    u.x += u.vx * dt; u.y += u.vy * dt;
    u.vx *= 0.86; u.vy *= 0.86;
    if (Math.abs(u.vx) < 2) u.vx = 0;
    if (Math.abs(u.vy) < 2) u.vy = 0;

    var phasing = u.phaseT > 0;
    if (!phasing) {
      u.x = clamp(u.x, u.r, M.w - u.r);
      u.y = clamp(u.y, u.r, M.h - u.r);
      for (var c = 0; c < M.covers.length; c++) {
        var cv = M.covers[c];
        if (u.x > cv[0] - u.r && u.x < cv[2] + u.r && u.y > cv[1] - u.r && u.y < cv[3] + u.r) {
          var dl = Math.abs(u.x - (cv[0] - u.r)), dr = Math.abs(cv[2] + u.r - u.x);
          var dtp = Math.abs(u.y - (cv[1] - u.r)), db = Math.abs(cv[3] + u.r - u.y);
          var m = Math.min(dl, dr, dtp, db);
          if (m === dl) u.x = cv[0] - u.r;
          else if (m === dr) u.x = cv[2] + u.r;
          else if (m === dtp) u.y = cv[1] - u.r;
          else u.y = cv[3] + u.r;
        }
      }
    } else {
      u.x = clamp(u.x, u.r, M.w - u.r);
      u.y = clamp(u.y, u.r, M.h - u.r);
    }

    var wasIn = inSpawnZone(u);
    if (!u.outSpawn && !wasIn) u.outSpawn = true;
    if (wasIn) u.hp = Math.min(u.maxHp, u.hp + 25 * dt);
    if (u.outSpawn && u.protT > 0) u.protT = 0;

    if (inp.aim !== undefined) u.aim = inp.aim;
    if (inp.shoot) tryFire(g, u, true);
    u._prevShoot = !!inp.shoot;
    if (inp.throwElem) {
      throwItem(g, u, inp.throwElem.slot, inp.throwElem.x, inp.throwElem.y);
      inp.throwElem = null;
    }
  }

  // ---------------- 寻路 ----------------
  var WALK = null;

  function buildWalk() {
    var w = new Uint8Array(M.cols * M.rows);
    for (var i = 0; i < M.covers.length; i++) {
      var c = M.covers[i];
      var x0 = c[0] - UNIT_R - 2, x1 = c[2] + UNIT_R + 2;
      var y0 = c[1] - UNIT_R - 2, y1 = c[3] + UNIT_R + 2;
      var i0 = Math.max(0, Math.floor(x0 / CELL)), i1 = Math.min(M.cols - 1, Math.floor(x1 / CELL));
      var j0 = Math.max(0, Math.floor(y0 / CELL)), j1 = Math.min(M.rows - 1, Math.floor(y1 / CELL));
      for (var j = j0; j <= j1; j++) for (var ii = i0; ii <= i1; ii++) w[j * M.cols + ii] = 1;
    }
    for (var a = 0; a < M.cols; a++) { w[a] = 1; w[(M.rows - 1) * M.cols + a] = 1; }
    for (var b = 0; b < M.rows; b++) { w[b * M.cols] = 1; w[b * M.cols + M.cols - 1] = 1; }
    WALK = w;
    return w;
  }

  function walkable(i, j) { return WALK[j * M.cols + i] === 0; }

  function walkLOS(i1, j1, i2, j2) {
    var dx = Math.abs(i2 - i1), dy = Math.abs(j2 - j1);
    var sx = i1 < i2 ? 1 : -1, sy = j1 < j2 ? 1 : -1;
    var err = dx - dy, x = i1, y = j1, guard = 0;
    while (guard++ < 500) {
      if (!walkable(x, y)) return false;
      if (x === i2 && y === j2) return true;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return false;
  }

  var _gs, _from, _st;

  function ensurePathBufs() {
    var n = M.cols * M.rows;
    if (!_gs || _gs.length !== n) {
      _gs = new Float32Array(n); _from = new Int32Array(n); _st = new Uint8Array(n);
    }
  }

  function nearestFree(idx) {
    if (WALK[idx] === 0) return idx;
    var ci = idx % M.cols, cj = (idx - ci) / M.cols;
    for (var r = 1; r <= 10; r++) {
      for (var dj = -r; dj <= r; dj++) {
        for (var di = -r; di <= r; di++) {
          if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
          var ni = ci + di, nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= M.cols || nj >= M.rows) continue;
          if (WALK[nj * M.cols + ni] === 0) return nj * M.cols + ni;
        }
      }
    }
    return -1;
  }

  function heapPush(a, node) {
    a.push(node);
    var i = a.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      var t = a[p]; a[p] = a[i]; a[i] = t; i = p;
    }
  }
  function heapPop(a) {
    var top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  }

  var DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
              [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

  function findPath(sx, sy, gx, gy) {
    if (!WALK) buildWalk();
    ensurePathBufs();
    var s = nearestFree(cellIndex(sx, sy));
    var t = nearestFree(cellIndex(gx, gy));
    if (s < 0 || t < 0) return null;
    if (s === t) return [[gx, gy]];

    _st.fill(0); _from.fill(-1); _gs.fill(0);
    var ti = t % M.cols, tj = (t - ti) / M.cols;
    _st[s] = 1; _gs[s] = 0; _from[s] = -1;
    var open = [{ i: s, f: 0 }];
    var guard = 0, found = false;

    while (open.length && guard++ < 12000) {
      var cur = heapPop(open).i;
      if (_st[cur] === 2) continue;
      _st[cur] = 2;
      if (cur === t) { found = true; break; }
      var ci = cur % M.cols, cj = (cur - ci) / M.cols;
      for (var k = 0; k < 8; k++) {
        var ni = ci + DIRS[k][0], nj = cj + DIRS[k][1];
        if (ni < 0 || nj < 0 || ni >= M.cols || nj >= M.rows) continue;
        var nIdx = nj * M.cols + ni;
        if (WALK[nIdx] || _st[nIdx] === 2) continue;
        if (DIRS[k][0] !== 0 && DIRS[k][1] !== 0) {
          if (WALK[cj * M.cols + ni] || WALK[nj * M.cols + ci]) continue;
        }
        var ng = _gs[cur] + DIRS[k][2];
        if (_st[nIdx] === 0 || ng < _gs[nIdx]) {
          _gs[nIdx] = ng; _from[nIdx] = cur; _st[nIdx] = 1;
          var h = Math.sqrt((ni - ti) * (ni - ti) + (nj - tj) * (nj - tj));
          heapPush(open, { i: nIdx, f: ng + h * 1.05 });
        }
      }
    }
    if (!found) return null;

    var cells = [], c2 = t;
    while (c2 !== -1) { cells.push(c2); c2 = _from[c2]; }
    cells.reverse();

    var pts = [], i0 = 0;
    while (i0 < cells.length - 1) {
      var ai = cells[i0] % M.cols, aj = (cells[i0] - ai) / M.cols;
      var far = i0 + 1;
      for (var m = cells.length - 1; m > i0; m--) {
        var mi = cells[m] % M.cols, mj = (cells[m] - mi) / M.cols;
        if (walkLOS(ai, aj, mi, mj)) { far = m; break; }
      }
      var fi = cells[far] % M.cols, fj = (cells[far] - fi) / M.cols;
      pts.push([fi * CELL + CELL / 2, fj * CELL + CELL / 2]);
      i0 = far;
    }
    if (!pts.length) pts.push([gx, gy]);
    return pts;
  }

  // ---------------- AI ----------------
  function nearestEnemy(g, u) {
    var best = null, bd = 1e18;
    for (var i = 0; i < g.units.length; i++) {
      var o = g.units[i];
      if (!o.alive || o.team === u.team) continue;
      var d = dist2(u.x, u.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  function resolvePath(u, gx, gy, dt) {
    u.aiPathT = (u.aiPathT || 0) - dt;
    var stale = !u.aiPath || u.aiPathIdx >= u.aiPath.length || u.aiPathT <= 0 ||
      !u.aiPathGoal || dist2(gx, gy, u.aiPathGoal.x, u.aiPathGoal.y) > 130 * 130;
    if (stale) {
      u.aiPath = findPath(u.x, u.y, gx, gy);
      u.aiPathIdx = 0; u.aiPathT = 1.0;
      u.aiPathGoal = { x: gx, y: gy };
    }
    if (!u.aiPath || !u.aiPath.length) return null;
    var wp = u.aiPath[u.aiPathIdx];
    if (dist2(u.x, u.y, wp[0], wp[1]) < 26 * 26) {
      u.aiPathIdx++;
      if (u.aiPathIdx >= u.aiPath.length) return null;
      wp = u.aiPath[u.aiPathIdx];
    }
    return Math.atan2(wp[1] - u.y, wp[0] - u.x);
  }

  function updateAI(g, u, dt, inp) {
    if (u.isDummy) { inp.mx = 0; inp.my = 0; inp.shoot = false; return; }
    // AI 在出生区里攒够钱就买枪
    u.aiShopT = (u.aiShopT || 2) - dt;
    if (u.aiShopT <= 0) {
      u.aiShopT = 2.5;
      if (inSpawnZone(u)) aiShop(g, u);
    }
    // 连杀技能：AI 自动使用
    if (u.ksItem) {
      var tgt = nearestEnemy(g, u);
      if (u.ksItem === 'bomb' && tgt && canSee(g, u, tgt.x, tgt.y)) useKsItem(g, u, tgt.x, tgt.y);
      else if (u.ksItem === 'fear' && tgt) useKsItem(g, u, 0, 0);
      else if (u.ksItem === 'phase' && u.hp < u.maxHp * 0.4) useKsItem(g, u, 0, 0);
      else if (u.ksItem === 'reveal') useKsItem(g, u, 0, 0);
    }

    var target = nearestEnemy(g, u);
    if (!target) return;

    var d = Math.sqrt(dist2(u.x, u.y, target.x, target.y));
    var sees = canSee(g, u, target.x, target.y);
    if (sees) { u.aiLast = { x: target.x, y: target.y }; u.aiLastT = 6; u.aiLockT = (u.aiLockT || 0) + dt; }
    else { u.aiLockT = 0; u.aiLastT = (u.aiLastT || 0) - dt; }

    var aimAng = Math.atan2(target.y - u.y, target.x - u.x);

    u.aiErrT = (u.aiErrT || 0) - dt;
    if (u.aiErrT <= 0) { u.aiErrT = 0.3; u.aiErr = (Math.random() - 0.5) * CFG.aiErr; }
    u.aiBurstT = (u.aiBurstT || 0.4) - dt;
    if (u.aiBurstT <= 0) { u.aiFiring = !u.aiFiring; u.aiBurstT = u.aiFiring ? 0.65 : 0.45; }

    inp.aim = aimAng + (u.aiErr || 0);
    inp.shoot = false;
    inp.sprint = false;

    var goal;
    if (sees) goal = { x: target.x, y: target.y };
    else if (u.aiLastT > 0 && u.aiLast) goal = u.aiLast;
    else goal = { x: u.team === 0 ? M.w * 0.72 : M.w * 0.28, y: M.h / 2 + (u.aiLane || 0) };

    var pathAng = resolvePath(u, goal.x, goal.y, dt);

    var meleeW = WEAPONS[u.weapon].melee;
    if (meleeW) {
      inp.shoot = sees && d < WEAPONS[u.weapon].range * 0.9;
      var ma = pathAng !== null ? pathAng : aimAng;
      if (d > 70) { inp.mx = Math.cos(ma); inp.my = Math.sin(ma); }
      else { inp.mx = 0; inp.my = 0; }
      return;
    }
    if (sees && d < 700) {
      inp.shoot = !!u.aiFiring && u.aiLockT > CFG.aiReaction;
      if (d > 360) {
        if (pathAng !== null) { inp.mx = Math.cos(pathAng); inp.my = Math.sin(pathAng); }
        else { inp.mx = Math.cos(aimAng); inp.my = Math.sin(aimAng); }
      } else if (d < 190) {
        inp.mx = -Math.cos(aimAng); inp.my = -Math.sin(aimAng);
      } else {
        var side = u.aiSide || (u.aiSide = Math.random() < 0.5 ? 1 : -1);
        inp.mx = Math.cos(aimAng + side * Math.PI / 2) * 0.75;
        inp.my = Math.sin(aimAng + side * Math.PI / 2) * 0.75;
      }
    } else {
      if (pathAng !== null) { inp.mx = Math.cos(pathAng); inp.my = Math.sin(pathAng); }
      else { inp.mx = Math.cos(aimAng); inp.my = Math.sin(aimAng); }
    }

    for (var s = 0; s < u.items.length; s++) {
      var el = u.items[s];
      if (el && u.itemCd[el] <= 0 && sees && d < 520 && Math.random() < dt * 0.5) {
        inp.throwElem = { slot: s, x: target.x + (Math.random() - 0.5) * 80, y: target.y + (Math.random() - 0.5) * 80 };
        break;
      }
    }
  }

  // ---------------- 主循环 ----------------
  function step(g, dt) {
    dt = Math.min(dt, 0.05);
    g._dt = dt;
    g.t += dt;
    g.sfx.length = 0;
    var i, u;

    for (i = 0; i < g.units.length; i++) {
      u = g.units[i];
      g.vision[u.id] = u.alive ? computeVision(u) : [];
      g.visionR[u.id] = u.alive ? computeRear(u) : null;
    }
    for (i = 0; i < g.units.length; i++) {
      u = g.units[i];
      if (!u.alive || u.isPlayer) continue;
      updateAI(g, u, dt, g.inputs[u.id]);
    }
    for (i = 0; i < g.units.length; i++) {
      u = g.units[i];
      if (!u.alive) continue;
      updateUnit(g, u, dt, g.inputs[u.id]);
    }

    updateBullets(g, dt);
    updateGrenades(g, dt);

    // 记录位置历史（延迟补偿用）
    if (CFG.lagComp) {
      var rec = g.histPool.pop() || { t: 0, p: [] };
      rec.t = g.t;
      rec.p.length = g.units.length;
      for (var hi = 0; hi < g.units.length; hi++) {
        var hu = g.units[hi];
        var slot = rec.p[hi] || (rec.p[hi] = [0, 0, 0, 0]);
        slot[0] = hu.id; slot[1] = hu.x; slot[2] = hu.y; slot[3] = hu.r;
      }
      g.hist.push(rec);
      if (g.hist.length > CFG.histLen) g.histPool.push(g.hist.shift());
    }

    var zout = [];
    for (i = 0; i < g.zones.length; i++) {
      g.zones[i].fuel -= CFG.zoneDecay * dt;
      if (g.zones[i].fuel > 0) zout.push(g.zones[i]);
    }
    g.zones = zout;

    // 火药桶重生
    for (i = 0; i < g.barrels.length; i++) {
      var br = g.barrels[i];
      if (!br.alive) {
        br.respawnT -= dt;
        if (br.respawnT <= 0) { br.alive = true; br.hp = br.maxHp; br.respawnT = 0; }
      }
    }

    bakeField(g);
    resolveCells(g);

    g.fogs = g.fogs.filter(function (v) { v.life -= dt; return v.life > 0; });
    g.traps = g.traps.filter(function (v) { v.life -= dt; return v.life > 0; });
    g.fx = g.fx.filter(function (v) { v.life -= dt; return v.life > 0; });

    for (i = 0; i < g.units.length; i++) {
      u = g.units[i];
      if (u.alive) continue;
      u.respawnT -= dt;
      if (u.respawnT <= 0) respawn(g, u);
    }
  }

  function respawn(g, u) {
    if (u.isDummy) {
      u.alive = true; u.hp = u.maxHp;
      u.status.w = u.status.f = u.status.e = 0;
      u.x = u.dummyHome ? u.dummyHome.x : u.x;
      u.y = u.dummyHome ? u.dummyHome.y : u.y;
      u.armor = 0; u.shield = 0; u.protT = 0;
      return;
    }
    var idx = g.units.filter(function (o) { return o.team === u.team; }).indexOf(u);
    if (idx < 0) idx = 0;
    var sp = M.spawns[u.team][Math.min(idx, M.spawns[u.team].length - 1)];
    u.alive = true; u.hp = u.maxHp;
    u.x = sp.x + (Math.random() - 0.5) * 30;
    u.y = sp.y + (Math.random() - 0.5) * 30;
    u.status.w = u.status.f = u.status.e = 0;
    u.stun = 0; u.slowT = 0; u.vulnT = 0;
    u.protT = CFG.spawnProt;
    u.stamina = CFG.staminaMax;
    u.mag = WEAPONS[u.weapon].mag;
    u.reloadT = 0;
    u.itemCd = { w: 0, f: 0, e: 0, d: 0 };
    u.revealT = 0; u.phaseT = 0; u.fearT = 0; u.shield = 0;
    u.armor = u.armorMax;
    u.outSpawn = false;
    u.lastHitBy = null;
    u.aiPath = null; u.aiPathT = 0;
    aiShop(g, u);
  }

  // AI 自己攒钱买枪
  function aiShop(g, u) {
    if (u.isPlayer) return;
    var pool = [];
    for (var i = 0; i < WEAPON_ORDER.length; i++) {
      var k = WEAPON_ORDER[i];
      if (k !== 'pistol' && !u.unlocked[k] && u.money >= WEAPONS[k].cost) pool.push(k);
    }
    if (!pool.length) return;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    u.money -= WEAPONS[pick].cost;
    u.unlocked[pick] = true;
    u.weapon = pick;
    u.mag = WEAPONS[pick].mag;
    u.reloadT = 0;
  }

  root.EW = {
    VERSION: VERSION,
    CFG: CFG, MAPS: MAPS, ITEMS: ITEMS,
    CELL: CELL, UNIT_R: UNIT_R, K: K, KIND_COLOR: KIND_COLOR, ELEM_COLOR: ELEM_COLOR,
    WEAPONS: WEAPONS, WEAPON_ORDER: WEAPON_ORDER,
    createGame: createGame, step: step, computeVision: computeVision,
    pointInPoly: pointInPoly, canSee: canSee, cellIndex: cellIndex,
    rayCovers: rayCovers, fogBlocked: fogBlocked, nearestEnemy: nearestEnemy,
    throwItem: throwItem, useKsItem: useKsItem, inSpawnZone: inSpawnZone,
    shopBuy: shopBuy, TALENTS: TALENTS, ARMORS: ARMORS,
    dealDamage: damage, pointInPuddle: pointInPuddle, rangeMult: rangeMult,
    computeRear: computeRear, bakeVisual: bakeVisual, histPos: histPos,
    buildCustomMap: function (def) {
      var m = makeMap(def);
      MAPS[def.key || 'custom'] = m;
      return m;
    },
    getMap: function () { return M; }
  };
})(typeof window !== 'undefined' ? window : globalThis);

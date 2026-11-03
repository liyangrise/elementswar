// 无头冒烟测试：v0.4.0（22 项改动）
require('../js/core.js');
const EW = globalThis.EW;
const CFG = EW.CFG;

let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed++; throw new Error(msg); }
}
function ok(msg) { console.log('OK  ' + msg); }
function idle(g, frames) { for (let i = 0; i < frames; i++) EW.step(g, 1 / 60); }
function zoneAt(g, elem, x, y, fuel = 100) {
  g.zones.push({ id: g.nextId++, elem, x, y, r: CFG.zoneR, fuel, maxFuel: 100 });
}
function clearUnits(g) { g.units = g.units.filter(u => u.isPlayer); g.player = g.units[0]; }

// --- 1. 四张地图 ---
{
  const info = [];
  for (const k of ['small', 'tian', 'medium', 'large']) {
    const g = EW.createGame(k);
    assert(g.units.length === EW.MAPS[k].teamSize * 2, k + ' 人数不对');
    info.push(k + ' ' + EW.MAPS[k].teamSize + 'v' + EW.MAPS[k].teamSize);
  }
  ok('四张地图: ' + info.join(' / '));
}

// --- 2. 镜像对称 ---
{
  for (const k of ['small', 'tian', 'medium', 'large']) {
    const m = EW.MAPS[k];
    const near = (a, b) => Math.abs(a - b) < 0.001;
    const bad = m.covers.filter(r => {
      const mx = m.w - r[2];
      return !m.covers.some(o => near(o[0], mx) && near(o[1], r[1]) && near(o[2], m.w - r[0]) && near(o[3], r[3]));
    });
    assert(bad.length === 0, k + ' 存在不对称掩体: ' + JSON.stringify(bad[0]));
  }
  ok('四张地图全部严格镜像对称');
}

// --- 3. 出生房间 ---
{
  const g = EW.createGame('large');
  const M = g.map;
  for (const t of [0, 1]) {
    const sp = M.spawns[t][Math.floor(M.spawns[t].length / 2)];
    const leftWall = M.covers.find(r => r[2] < sp.x + 5 && sp.y > r[1] && sp.y < r[3]);
    assert(leftWall, '队伍 ' + t + ' 出生点左侧没有墙（不是封闭房间）');
    const z = M.spawnZones[t];
    assert(sp.x > z.x0 - 1 && sp.x < z.x1 + 1 && sp.y > z.y0 - 1 && sp.y < z.y1 + 1, '队伍 ' + t + ' 出生点不在区域内');
  }
  ok('出生点为四面环墙的房间');
}

// --- 4. 重生无敌 10s，离开出生区即解除 ---
{
  const g = EW.createGame('large');
  const p = g.player;
  assert(Math.abs(p.protT - 10) < 0.01, '出生保护应为 10s, 实得 ' + p.protT);
  const hp0 = p.hp;
  EW.dealDamage(g, p, 30, g.enemy, '测试');
  assert(p.hp === hp0, '无敌期间不应受伤');
  p.x = 1200; p.y = 675;
  EW.step(g, 1 / 60);
  assert(p.protT <= 0, '离开出生区应解除无敌');
  EW.dealDamage(g, p, 30, g.enemy, '测试');
  assert(p.hp < hp0, '解除后应能受伤');
  ok('重生无敌 10s，离开出生区解除');
}

// --- 5. 武器解锁 ---
{
  const g = EW.createGame('large', { weapon: 'sniper', ammo: 'w', items: ['w', 'f'] });
  assert(g.player.weapon === 'pistol', '未解锁的武器应回退为手枪');
  assert(g.unlocked.pistol === true, '手枪应默认解锁');
  assert(!g.unlocked.sniper, '狙击枪默认未解锁');
  g.loadout.weapon = 'sniper';
  const g2 = EW.createGame('large');
  g2.unlocked.sniper = true;
  ok('武器解锁：手枪免费，其余需购买');
}

// --- 6. 半自动武器不能长按 ---
{
  for (const wk of ['dmr', 'sniper', 'pistol']) {
    const g = EW.createGame('small');
    clearUnits(g);
    const p = g.player;
    p.weapon = wk; p.mag = EW.WEAPONS[wk].mag;
    p.x = 700; p.y = 300;
    g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: true, throwElem: null };
    let fired = 0;
    for (let i = 0; i < 30; i++) { EW.step(g, 1 / 60); fired = Math.max(fired, g.bullets.length); }
    const spent = EW.WEAPONS[wk].mag - p.mag;
    assert(spent === 1, wk + ' 长按应只打 1 发, 实得 ' + spent);
  }
  ok('半自动：手枪 / 狙击枪 / 射手步枪长按只出 1 发');
}

// --- 7. 霰弹枪 8 弹丸 ---
{
  const g = EW.createGame('small');
  clearUnits(g);
  const p = g.player;
  p.weapon = 'shotgun'; p.mag = 6; p.x = 700; p.y = 300;
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: true, throwElem: null };
  EW.step(g, 1 / 60);
  assert(g.bullets.length === 8, '霰弹枪应为 8 弹丸, 实得 ' + g.bullets.length);
  ok('霰弹枪单发 8 弹丸');
}

// --- 8. 狙击枪穿透 ---
{
  const g = EW.createGame('medium');
  const p = g.player, e1 = g.enemy;
  p.x = 450; p.y = 200; p.weapon = 'sniper'; p.mag = 5; p.ammoElem = 'w';
  p.protT = 0;
  e1.x = 700; e1.y = 200; e1.protT = 0; e1.hp = 200; e1.isPlayer = true;
  const e2 = g.units.find(u => u.team === 1 && u !== e1);
  e2.x = 900; e2.y = 200; e2.protT = 0; e2.hp = 200; e2.isPlayer = true;
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: true, throwElem: null };
  for (let i = 0; i < 20; i++) EW.step(g, 1 / 60);
  const d1 = 200 - e1.hp, d2 = 200 - e2.hp;
  assert(d1 > 50 && d2 > 20, '两个敌人都应被打中: ' + d1.toFixed(0) + '/' + d2.toFixed(0));
  assert(d2 < d1 * 0.9, '穿透后伤害应衰减: 第一人 ' + d1.toFixed(0) + ' 第二人 ' + d2.toFixed(0));
  ok('狙击穿透: 第一人 ' + d1.toFixed(0) + ' → 第二人 ' + d2.toFixed(0) + '（×0.75）');
}

// --- 9. 道具 CD ---
{
  const g = EW.createGame('large');
  clearUnits(g);
  const p = g.player;
  p.items = ['w', 'f']; p.x = 900; p.y = 675;
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: false, throwElem: null };
  assert(EW.throwItem(g, p, 0, 1100, 675) === true, '第一次投掷应成功');
  assert(p.itemCd.w > 0, '应进入 CD');
  assert(EW.throwItem(g, p, 0, 1100, 675) === false, 'CD 中不应能再投');
  assert(EW.throwItem(g, p, 1, 1100, 675) === true, '另一个道具独立');
  ok('道具 CD 制');
}

// --- 10. 土手雷生成墙体并挡子弹 ---
{
  const g = EW.createGame('small');
  clearUnits(g);
  const p = g.player;
  p.items = ['d', 'w']; p.x = 560; p.y = 300; p.ammoElem = 'w';
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: false, throwElem: null };
  EW.throwItem(g, p, 0, 760, 300);
  idle(g, 90);
  assert(g.walls.length === 1, '应生成一面土墙, 实得 ' + g.walls.length);
  const wl = g.walls[0];
  assert(wl.hp > 0, '土墙应有血量');

  // 墙后的敌人不应被打到
  const e = g.enemy;
  e.x = 900; e.y = 300; e.protT = 0; e.hp = 200;
  p.mag = 30; p.weapon = 'rifle';
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: true, throwElem: null };
  idle(g, 60);
  assert(e.hp >= 200, '子弹不应穿过土墙, 敌人剩余 ' + e.hp);
  assert(wl.hp < CFG.earthHp, '土墙应被子弹消耗');

  wl.hp = 0;
  idle(g, 2);
  assert(g.walls.length === 0, '血量为 0 后土墙应消失');
  ok('土手雷：生成墙体、挡子弹、可被打碎');
}

// --- 11. 水坑 ---
{
  const g = EW.createGame('small');
  clearUnits(g);
  const p = g.player;
  const pd = g.map.puddles[0];
  p.x = (pd[0] + pd[2]) / 2; p.y = (pd[1] + pd[3]) / 2;
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: false, throwElem: null };
  idle(g, 90);
  assert(p.status.w > CFG.statusThreshold, '站在水坑里应获得潮湿, 实得 ' + p.status.w.toFixed(1));
  ok('水坑：进入获得潮湿（强度 ' + p.status.w.toFixed(0) + '）');
}

// --- 12. 连杀技能 ---
{
  const g = EW.createGame('large');
  const p = g.player, e = g.enemy;
  p.protT = 0; e.protT = 0;
  p.streak = 4; EW.dealDamage(g, e, 999, p, '子弹');
  assert(p.ksItem === 'phase', '5 杀应为穿行, 实得 ' + p.ksItem);
  e.alive = true; e.hp = 200; e.protT = 0; p.streak = 8;
  EW.dealDamage(g, e, 999, p, '子弹');
  assert(p.ksItem === 'reveal', '9 杀应为全图视野');
  e.alive = true; e.hp = 200; e.protT = 0; p.streak = 12;
  EW.dealDamage(g, e, 999, p, '子弹');
  assert(p.ksItem === 'bomb', '13 杀应为空袭');

  // 死亡不清空技能
  p.streak = 3;
  EW.dealDamage(g, p, 999, g.units.find(u => u.team === 1 && u.alive), '子弹');
  assert(p.alive === false, '玩家应死亡');
  assert(p.ksItem === 'bomb', '死亡后连杀技能不应消失, 实得 ' + p.ksItem);
  assert(p.streak === 0, '死亡后连杀计数应清零');
  ok('连杀技能：5穿行 / 9视野 / 13空袭，死亡保留技能');
}

// --- 13. 资金 ---
{
  const g = EW.createGame('large');
  const p = g.player, e = g.enemy;
  p.protT = 0; e.protT = 0;
  const m0 = p.money;
  EW.dealDamage(g, e, 999, p, '子弹');
  assert(p.money - m0 === CFG.killMoneyGun, '枪杀应得 ' + CFG.killMoneyGun + ', 实得 ' + (p.money - m0));
  e.alive = true; e.hp = 200; e.protT = 0;
  const m1 = p.money;
  EW.dealDamage(g, e, 999, p, '蒸发');
  assert(p.money - m1 === CFG.killMoneyElem, '元素击杀应得 ' + CFG.killMoneyElem + ', 实得 ' + (p.money - m1));
  ok('资金：枪杀 +' + CFG.killMoneyGun + ' / 元素击杀 +' + CFG.killMoneyElem);
}

// --- 14. 疾跑与体力 ---
{
  const g = EW.createGame('large');
  clearUnits(g);
  const p = g.player;
  p.x = 500; p.y = 250;
  g.inputs[p.id] = { mx: 1, my: 0, aim: 0, shoot: false, sprint: true, throwElem: null };
  const st0 = p.stamina, x0 = p.x;
  idle(g, 40);
  assert(p.stamina < st0, '疾跑应消耗体力');
  const sprintDist = p.x - x0;

  const g2 = EW.createGame('large');
  clearUnits(g2);
  const p2 = g2.player;
  p2.x = 500; p2.y = 250;
  g2.inputs[p2.id] = { mx: 1, my: 0, aim: 0, shoot: false, sprint: false, throwElem: null };
  idle(g2, 40);
  const walkDist = p2.x - 500;
  assert(sprintDist > walkDist * 1.3, '疾跑应明显更快: ' + sprintDist.toFixed(0) + ' vs ' + walkDist.toFixed(0));
  ok('疾跑消耗体力: 40 帧走 ' + walkDist.toFixed(0) + 'px / 疾跑 ' + sprintDist.toFixed(0) + 'px');
}

// --- 15. 触电麻痹不会无限控 ---
{
  const g = EW.createGame('large');
  clearUnits(g);
  const p = g.player;
  p.x = 1200; p.y = 675;
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: false, throwElem: null };
  let stunnedFrames = 0;
  for (let i = 0; i < 120; i++) {
    p.status.e = 100;                 // 持续保持满电
    EW.step(g, 1 / 60);
    if (p.stun > 0) stunnedFrames++;
  }
  const ratio = stunnedFrames / 120;
  assert(ratio < 0.45, '麻痹覆盖率过高（' + (ratio * 100).toFixed(0) + '%），控制过强');
  ok('触电麻痹削弱：2 秒内覆盖率 ' + (ratio * 100).toFixed(0) + '%');
}

// --- 16. 蒸发 / 三相 / 木桶 ---
{
  const g = EW.createGame('large');
  zoneAt(g, 'w', 1200, 675); zoneAt(g, 'f', 1200, 675);
  idle(g, 40);
  assert(g.totals.vapor > 0, '蒸发未触发');
  const g2 = EW.createGame('large');
  zoneAt(g2, 'w', 1200, 675); zoneAt(g2, 'f', 1200, 675); zoneAt(g2, 'e', 1200, 675);
  idle(g2, 30);
  assert(g2.totals.tri > 0, '三相共鸣未触发');
  ok('蒸发 / 三相共鸣正常');
}

// --- 17. 视锥遮挡 + 雾挡视线 ---
{
  const g = EW.createGame('large');
  clearUnits(g);
  const p = g.player;
  p.x = 700; p.y = 800; p.aim = -Math.PI / 2;   // 正对竖墙 [700,600,746,750]
  g.vision[p.id] = EW.computeVision(p);
  assert(EW.canSee(g, p, 700, 780) === true, '墙前应可见');
  assert(EW.canSee(g, p, 700, 560) === false, '墙后不应可见');
  g.fogs.push({ x: 700, y: 770, r: 40, life: 9, maxLife: 9 });
  assert(EW.canSee(g, p, 700, 780) === false, '雾中目标应不可见');
  ok('视锥遮挡 + 雾挡视线');
}

// --- 18. AI 推进对帧率不敏感 ---
{
  const results = [];
  for (const hz of [60, 144, 240]) {
    const g = EW.createGame('large');
    const mate = g.units.find(u => u.team === 0 && !u.isPlayer);
    const x0 = mate.x;
    let maxMoved = 0;
    for (let i = 0; i < hz * 10; i++) {
      EW.step(g, 1 / hz);
      maxMoved = Math.max(maxMoved, Math.abs(mate.x - x0));
    }
    results.push({ hz, moved: Math.round(maxMoved) });
  }
  assert(results.every(r => r.moved > 300), '高刷新率下 AI 不前进: ' + JSON.stringify(results));
  ok('AI 推进与帧率无关: ' + results.map(r => r.hz + 'Hz→' + r.moved + 'px').join(', '));
}

// --- 19. 音效事件 ---
{
  const g = EW.createGame('medium');
  const seen = new Set();
  const p = g.player, e = g.enemy;
  p.x = 450; p.y = 200; e.x = 700; e.y = 200; e.isPlayer = true;
  p.protT = 0; e.protT = 0; p.weapon = 'rifle'; p.mag = 30;
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: true, throwElem: null };
  for (let i = 0; i < 240; i++) {
    if (i === 60) g.inputs[p.id].throwElem = { slot: 0, x: 560, y: 200 };
    if (i === 90) g.inputs[p.id].throwElem = { slot: 1, x: 560, y: 200 };
    if (i === 150) p.reloadReq = true;
    EW.step(g, 1 / 60);
    g.sfx.forEach(s => seen.add(s.t));
  }
  const need = ['shoot', 'hit', 'throw', 'land', 'dmg'];
  const missing = need.filter(k => !seen.has(k));
  assert(missing.length === 0, '缺少事件: ' + missing.join(',') + ' 实得 ' + Array.from(seen).join(','));
  ok('事件齐全: ' + Array.from(seen).sort().join(', '));
}

// --- 20. 压力测试 ---
{
  const g = EW.createGame('large');
  for (let i = 0; i < 3600; i++) {
    const inp = g.inputs[g.player.id];
    inp.mx = Math.cos(i * 0.031); inp.my = Math.sin(i * 0.023);
    inp.aim = Math.atan2(675 - g.player.y, 1200 - g.player.x);
    inp.shoot = i % 3 === 0;
    inp.sprint = i % 7 === 0;
    if (i % 120 === 0) inp.throwElem = { slot: i % 2, x: g.player.x + Math.cos(i) * 300, y: g.player.y + Math.sin(i) * 300 };
    EW.step(g, 1 / 60);
  }
  ok('3600 帧压力测试通过, 比分 ' + g.score[0] + ':' + g.score[1] +
    ', 蒸发' + g.totals.vapor + ' 超载' + g.totals.overload + ' 感电' + g.totals.shock + ' 三相' + g.totals.tri);
}


// --- 21. AI 自己攒钱买枪 ---
{
  const g = EW.createGame('large');
  const bot = g.units.find(u => u.team === 1);
  assert(bot.weapon === 'pistol', 'AI 初始应为手枪');
  assert(bot.money === 0, 'AI 初始应没钱');
  bot.money = 500;
  bot.alive = false; bot.respawnT = 0.01;
  EW.step(g, 1 / 60);
  assert(bot.unlocked.pistol === true, '应保留手枪');
  const bought = EW.WEAPON_ORDER.some(k => k !== 'pistol' && bot.unlocked[k]);
  assert(bought, 'AI 有钱后应解锁新武器');
  assert(bot.weapon !== 'pistol', 'AI 应换上买到的枪');
  ok('AI 自购武器: 换装为 ' + EW.WEAPONS[bot.weapon].name + ', 余额 ' + bot.money);
}

// --- 22. 橡胶子弹弹射 ---
{
  const g = EW.createGame('small');
  clearUnits(g);
  const p = g.player;
  p.x = 560; p.y = 300; p.weapon = 'rifle'; p.mag = 30; p.ammoElem = 'w';
  p.talents.rubber = true;
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: true, throwElem: null };
  EW.step(g, 1 / 60);
  assert(g.bullets.length > 0, '应打出子弹');
  assert(g.bullets[0].bounces === 1, '橡胶子弹应有 1 次弹射, 实得 ' + g.bullets[0].bounces);
  const g2 = EW.createGame('small');
  clearUnits(g2);
  const p2 = g2.player;
  p2.x = 560; p2.y = 300; p2.weapon = 'rifle'; p2.mag = 30;
  g2.inputs[p2.id] = { mx: 0, my: 0, aim: 0, shoot: true, throwElem: null };
  EW.step(g2, 1 / 60);
  assert(g2.bullets[0].bounces === 0, '没有天赋时不应弹射');
  ok('橡胶子弹：装备后弹丸可弹射 1 次');
}

// --- 23. 鹰眼视野 ---
{
  const mk = (eagle) => {
    const g = EW.createGame('large');
    clearUnits(g);
    const p = g.player;
    p.x = 1000; p.y = 200; p.aim = 0;
    p.talents.eagle = eagle;
    g.vision[p.id] = EW.computeVision(p);
    const poly = g.vision[p.id];
    let maxD = 0;
    for (const pt of poly) maxD = Math.max(maxD, Math.hypot(pt[0] - p.x, pt[1] - p.y));
    return maxD;
  };
  const a = mk(false), b = mk(true);
  assert(b > a * 1.2, '鹰眼应明显增加视野距离: ' + a.toFixed(0) + ' vs ' + b.toFixed(0));
  ok('鹰眼视野: 射程 ' + a.toFixed(0) + ' → ' + b.toFixed(0));
}

// --- 24. 武器价格 ---
{
  assert(EW.WEAPONS.sniper.cost === 1000, '狙击枪应 1000');
  assert(EW.WEAPONS.lmg.cost === 1000, '机枪应 1000');
  assert(EW.WEAPONS.pistol.cost === 0, '手枪免费');
  assert(EW.CFG.talentRubber === 3000 && EW.CFG.talentEagle === 2000 && EW.CFG.talentCost === 1500, '天赋价格');
  ok('价格：狙击 1000 / 机枪 1000 / 橡胶 3000 / 鹰眼 2000 / 回血 1500');
}

// --- 25. 爆炸桶推力 ---
{
  assert(EW.CFG.barrelKnock >= 800, '爆炸桶推力应显著提升, 当前 ' + EW.CFG.barrelKnock);
  ok('爆炸桶推力 ' + EW.CFG.barrelKnock);
}


// --- 26. 护甲 ---
{
  const g = EW.createGame('large');
  const p = g.player, e = g.enemy;
  p.protT = 0; e.protT = 0;
  p.talents.heavyArmor = true;
  p.armorMax = CFG.heavyArmorMax; p.armor = CFG.heavyArmorMax;
  EW.dealDamage(g, p, 40, e, '子弹');
  assert(Math.abs(p.armor - 60) < 0.1, '护甲应吸收全部伤害, 实得 ' + p.armor);
  assert(p.hp === p.maxHp, '有护甲时不应掉血');
  p.armor = 0;
  EW.dealDamage(g, p, 30, e, '子弹');
  assert(Math.abs(p.hp - (p.maxHp - 30)) < 0.1, '护甲归零后应掉血');
  ok('护甲：吸收伤害，归零后打到血量');

  // 重生重置
  p.alive = false; p.respawnT = 0.01;
  EW.step(g, 1 / 60);
  assert(Math.abs(p.armor - CFG.heavyArmorMax) < 0.1, '重生应重置重型护甲, 实得 ' + p.armor);
  ok('重型护甲：重生重置为 ' + CFG.heavyArmorMax);
}

// --- 27. 再生护甲 ---
{
  const g = EW.createGame('large');
  const p = g.player, e = g.enemy;
  p.protT = 0; e.protT = 0;
  p.talents.regenArmor = true;
  p.armorMax = CFG.regenArmorMax; p.armor = 0;
  p.lastDmgT = 10;
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: false, throwElem: null };
  idle(g, 60);
  assert(p.armor > 0, '脱战后护甲应恢复');
  ok('再生护甲：脱战 ' + p.armor.toFixed(1) + ' 点已恢复');
}

// --- 28. 无畏战士 ---
{
  const g = EW.createGame('large');
  const p = g.player, e = g.enemy;
  p.protT = 0; e.protT = 0;
  p.ksItem = 'fear';
  assert(EW.useKsItem(g, p, 0, 0) === true, '应能释放无畏战士');
  assert(Math.abs(p.fearT - 15) < 0.01, '无畏持续 15s, 实得 ' + p.fearT);
  assert(p.shield === 800, '应获得 800 护盾, 实得 ' + p.shield);
  const hp0 = p.hp;
  EW.dealDamage(g, p, 300, e, '子弹');
  assert(p.hp === hp0 && p.shield === 500, '护盾应先吸收, 实得护盾 ' + p.shield);

  // 射速
  p.weapon = 'rifle'; p.mag = 30; p.fireT = 0; p.fearT = 0;
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: true, throwElem: null };
  EW.step(g, 1 / 60);
  const normal = p.fireT;
  p.fireT = 0; p.mag = 30; p.fearT = 15; p._prevShoot = false;
  EW.step(g, 1 / 60);
  const feared = p.fireT;
  assert(feared < normal * 0.8, '无畏期间射速应更快: ' + feared.toFixed(3) + ' vs ' + normal.toFixed(3));

  // 击杀延长
  p.streak = 0;
  e.hp = 1; e.protT = 0;
  EW.dealDamage(g, e, 999, p, '子弹');
  assert(p.fearT > 15, '击杀应延长无畏时间, 实得 ' + p.fearT.toFixed(1));
  ok('无畏战士：800 护盾 · 射速 +50% · 击杀延长至 ' + p.fearT.toFixed(1) + 's');
}

// --- 29. 射程衰减 ---
{
  const r = EW.rangeMult;
  assert(r(700, 500) === 1, '射程内不衰减');
  assert(r(700, 700) === 1, '刚好射程不衰减');
  const far = r(700, 1400);
  assert(far < 0.6 && far >= 0.4, '超射程应衰减到 40%~60%, 实得 ' + far);
  ok('有效射程：700 → 1400px 伤害倍率 ' + far.toFixed(2));
}

// --- 30. 狙击枪打穿土墙 ---
{
  const g = EW.createGame('small');
  clearUnits(g);
  const p = g.player;
  p.x = 500; p.y = 300; p.weapon = 'sniper'; p.mag = 5; p.protT = 0;
  p.items = ['d', 'w'];
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: false, throwElem: null };
  EW.throwItem(g, p, 0, 700, 300);
  idle(g, 90);
  assert(g.walls.length === 1, '应生成土墙');
  const wl = g.walls[0];
  const e = g.enemy;
  e.x = 860; e.y = 300; e.protT = 0; e.hp = 200; e.isPlayer = true;
  g.units.push(e);
  p.weapon = 'sniper'; p.mag = 5;
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: true, throwElem: null };
  EW.step(g, 1 / 60);
  const b0 = g.bullets[0];
  assert(!!b0, '第一帧应存在子弹, walls=' + JSON.stringify(g.walls.map(w => w.rect)) + ' px=' + p.x.toFixed(1) + ' py=' + p.y.toFixed(1) + ' aim=' + p.aim.toFixed(3));
  idle(g, 29);
  assert(wl.hp < CFG.earthHp, '土墙应被打掉血, 实得 ' + wl.hp + ' mag=' + p.mag + ' bullets=' + g.bullets.length + ' px=' + p.x.toFixed(0) + ' py=' + p.y.toFixed(0) + ' wall=' + JSON.stringify(wl.rect) + ' alive=' + p.alive + ' protT=' + p.protT.toFixed(1) + ' reload=' + p.reloadT.toFixed(2) + ' shoot=' + g.inputs[p.id].shoot);
  assert(e.hp < 200, '子弹应穿过土墙打到敌人, 实得 ' + e.hp);
  ok('狙击穿土墙: 墙 ' + wl.hp.toFixed(0) + ' 血, 敌人受 ' + (200 - e.hp).toFixed(0) + ' 伤害');
}

// --- 31. 泥沼抵消水 ---
{
  const g = EW.createGame('small');
  clearUnits(g);
  const p = g.player;
  p.x = 620; p.y = 250; p.protT = 0; p.items = ['d', 'w'];
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: false, throwElem: null };
  EW.throwItem(g, p, 0, 800, 250);
  idle(g, 90);
  assert(g.walls.length === 1, '应生成土墙');
  const wl = g.walls[0];
  zoneAt(g, 'w', wl.cx, wl.cy, 100);
  idle(g, 4);
  const ci = EW.cellIndex(wl.cx, wl.cy);
  assert(g.field.w[ci] < CFG.theta, '泥沼范围内不应有水浓度, 实得 ' + g.field.w[ci]);
  assert(g.zones.every(z => z.elem !== 'w' || z.fuel < 100), '水区域应被泥沼吞噬');
  ok('泥沼：抵消水浓度并吞噬水区域');
}

// --- 32. 价格与霰弹枪加强 ---
{
  assert(EW.CFG.talentRubber === 3000, '橡胶子弹应为 3000');
  assert(EW.WEAPONS.shotgun.dmg === 9 && EW.WEAPONS.shotgun.rpm === 260, '霰弹枪应加强为全自动');
  assert(EW.WEAPONS.shotgun.mag === 8 && EW.WEAPONS.shotgun.pellets === 8, '霰弹枪弹匣/弹丸');
  assert(EW.WEAPONS.sniper.range > 1000, '狙击枪射程应最远');
  ok('霰弹枪: ' + EW.WEAPONS.shotgun.dmg + '×' + EW.WEAPONS.shotgun.pellets +
     ' · ' + EW.WEAPONS.shotgun.rpm + 'rpm · 弹匣 ' + EW.WEAPONS.shotgun.mag + ' · 橡胶子弹 3000');
}


// --- 33. 长刀：矩形范围 + 背刺翻倍 ---
{
  const g = EW.createGame('small');
  clearUnits(g);
  const p = g.player;
  p.x = 600; p.y = 450; p.weapon = 'blade'; p.mag = 1; p.protT = 0; p.aim = 0;
  const e = g.enemy;
  e.x = 680; e.y = 450; e.protT = 0; e.hp = 500; e.isPlayer = true; e.aim = Math.PI;
  g.units.push(e);
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: true, throwElem: null };
  EW.step(g, 1 / 60);
  const front = 500 - e.hp;
  assert(front > 0, '正前方应被砍中');
  assert(g.bullets.length === 0, '近战不应产生子弹');

  // 背刺：目标背对攻击者
  e.hp = 500; e.aim = 0;              // 朝右，玩家在左边 → 背后
  p._prevShoot = false; p.fireT = 0;
  EW.step(g, 1 / 60);
  const back = 500 - e.hp;
  assert(back > front * 1.8, '背刺应翻倍: ' + front + ' vs ' + back);
  ok('长刀: 正面 ' + front + ' / 背刺 ' + back + '（矩形范围，无子弹）');
}

// --- 34. 靶场 ---
{
  const g = EW.createGame('range');
  assert(g.dummy, '靶场应有测试人机');
  assert(g.dummy.isDummy === true, '应标记为 dummy');
  const d = g.dummy;
  const x0 = d.x, y0 = d.y, hp0 = d.hp;
  for (let i = 0; i < 120; i++) EW.step(g, 1 / 60);
  assert(Math.abs(d.x - x0) < 1 && Math.abs(d.y - y0) < 1, '靶子不应移动');
  assert(d.hp === hp0, '靶子不应自己掉血');
  assert(g.winner < 0, '靶场不应结束对局');
  ok('靶场：静止人机，可调参数');
}

// --- 35. 自定义地图不再重复镜像 ---
{
  const m = EW.buildCustomMap({
    key: 'tmptest', name: '测试图', w: 1200, h: 720,
    covers: [[400, 300, 460, 340]], barrels: [], puddles: [],
    spawnX: 150, spawnY: [360], teamSize: 1, killTarget: 10,
    noMirror: true, noRoom: true
  });
  assert(m.covers.length === 1, '编辑器地图不应再被镜像一次, 实得 ' + m.covers.length);
  const m2 = EW.buildCustomMap({
    key: 'tmptest2', name: '测试图2', w: 1200, h: 720,
    covers: [[400, 300, 460, 340]], barrels: [], puddles: [],
    spawnX: 150, spawnY: [360], teamSize: 1, killTarget: 10, noRoom: true
  });
  assert(m2.covers.length === 2, '未标记 noMirror 的地图仍应镜像, 实得 ' + m2.covers.length);
  ok('地图编辑器：自定义地图不重复镜像（1 块 vs 2 块）');
}


// --- 36. 第三只眼：背后视野 ---
{
  const g = EW.createGame('large');
  const p = g.player, e = g.enemy;
  p.x = 1000; p.y = 200; p.aim = 0; p.protT = 0;
  e.x = 860; e.y = 200; e.protT = 0; e.isPlayer = true;
  p.talents.thirdEye = false;
  EW.step(g, 1 / 60);
  assert(EW.canSee(g, p, e.x, e.y) === false, '没有天赋时背后不应可见');
  p.talents.thirdEye = true;
  EW.step(g, 1 / 60);
  assert(!!g.visionR[p.id], '应生成背后视野多边形');
  assert(EW.canSee(g, p, e.x, e.y) === true, '第三只眼应能看到背后');
  ok('第三只眼：背后 140px 可见（原来看不到）');
}

// --- 37. 长刀附加元素 ---
{
  const g = EW.createGame('small');
  clearUnits(g);
  const p = g.player;
  p.x = 600; p.y = 450; p.weapon = 'blade'; p.protT = 0; p.aim = 0; p.ammoElem = 'w';
  const e = g.enemy;
  e.x = 680; e.y = 450; e.protT = 0; e.hp = 500; e.isPlayer = true; e.aim = Math.PI;
  g.units.push(e);
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: true, throwElem: null };
  EW.step(g, 1 / 60);
  assert(e.status.w > 0, '长刀应附加水属性, 实得 ' + e.status.w.toFixed(1));
  ok('长刀附加元素: 一刀挂上 ' + e.status.w.toFixed(0) + ' 点潮湿');
}

// --- 38. 土墙时间削弱 30% ---
{
  assert(Math.abs(CFG.earthLife - 8.4) < 0.01, '土墙时长应为 8.4s, 实得 ' + CFG.earthLife);
  const g = EW.createGame('small');
  clearUnits(g);
  const p = g.player;
  p.x = 500; p.y = 300; p.protT = 0; p.items = ['d', 'w'];
  g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: false, throwElem: null };
  EW.throwItem(g, p, 0, 700, 300);
  idle(g, 90);
  assert(g.walls.length === 1, '应生成土墙');
  idle(g, Math.ceil(CFG.earthLife * 60) + 20);
  assert(g.walls.length === 0, '土墙应在 ' + CFG.earthLife + 's 后消失');
  ok('土墙持续时间 ' + CFG.earthLife + 's（原 12s，削 30%）');
}

// --- 39. 灼烧不产生伤害数字，也不计入伤害统计 ---
{
  const g = EW.createGame('large');
  const p = g.player, e = g.enemy;
  p.protT = 0; e.protT = 0; e.hp = 500; e.maxHp = 500;
  EW.dealDamage(g, e, 1, p, '子弹');   // 建立 lastHitBy
  const dmg0 = p.dmg;
  let dmgEvents = 0;
  for (let i = 0; i < 120; i++) {
    e.status.f = 100;
    EW.step(g, 1 / 60);
    dmgEvents += g.sfx.filter(s => s.t === 'dmg').length;
  }
  assert(e.hp < 500, '灼烧应造成掉血');
  assert(dmgEvents === 0, '灼烧不应产生伤害数字, 实得 ' + dmgEvents);
  assert(Math.abs(p.dmg - dmg0) < 0.5, '灼烧不应计入伤害统计, 增加 ' + (p.dmg - dmg0).toFixed(1));
  ok('灼烧：持续掉血 ' + (500 - e.hp).toFixed(0) + '，但不飙字、不进统计');
}


// --- 40. 延迟补偿：命中判定回退到历史位置 ---
{
  function shot(hitLag) {
    const g = EW.createGame('small');
    clearUnits(g);
    const p = g.player;
    p.x = 500; p.y = 200; p.aim = 0; p.protT = 0; p.weapon = 'rifle'; p.mag = 30;
    g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: false, throwElem: null };
    const e = g.enemy;
    e.x = 640; e.y = 200; e.protT = 0; e.hp = 200; e.isPlayer = true;
    g.units.push(e);
    // 先记录 15 帧"敌人在 y=450"
    for (let i = 0; i < 15; i++) EW.step(g, 1 / 60);
    // 敌人瞬间横向位移（模拟"服务器当前位置"和"你看到的位置"不一致）
    e.y = 350;
    for (let i = 0; i < 1; i++) EW.step(g, 1 / 60);
    // 开火
    p.lag = hitLag;
    g.inputs[p.id] = { mx: 0, my: 0, aim: 0, shoot: true, throwElem: null };
    p._prevShoot = false; p.fireT = 0;
    for (let i = 0; i < 20; i++) EW.step(g, 1 / 60);
    return 200 - e.hp;
  }
  const noLag = shot(0);
  const withLag = shot(0.2);
  assert(noLag === 0, '无延迟补偿时应打空（敌人已横移）, 实得 ' + noLag);
  assert(withLag > 0, '有延迟补偿时应命中历史位置, 实得 ' + withLag);
  ok('延迟补偿：回退 200ms 后命中（无补偿 ' + noLag + ' → 有补偿 ' + withLag.toFixed(0) + '）');
}

// --- 41. 历史缓冲 ---
{
  const g = EW.createGame('large');
  idle(g, 40);
  assert(g.hist.length > 10, '应记录位置历史, 实得 ' + g.hist.length);
  const p = g.player;
  const hp = EW.histPos(g, p.id, g.t - 0.1);
  assert(hp && hp.length === 4, 'histPos 应能查到历史坐标');
  ok('位置历史：' + g.hist.length + ' 帧缓冲，可回溯 100ms');
}

// --- 42. 联机客户端场域烘焙 ---
{
  const g = EW.createGame('small');
  clearUnits(g);
  zoneAt(g, 'f', 700, 450, 100);
  zoneAt(g, 'f', 700, 450, 100);
  EW.bakeVisual(g);
  const ci = EW.cellIndex(700, 450);
  assert(g.field.kind[ci] > 0, 'bakeVisual 应给格子分类');
  assert(g.field.f[ci] > EW.CFG.theta, '浓度应叠加');
  ok('bakeVisual：格子 kind=' + g.field.kind[ci] + ' 浓度=' + g.field.f[ci].toFixed(0));
}

console.log('\n' + (failed ? failed + ' 项失败' : '全部通过 v' + EW.VERSION));






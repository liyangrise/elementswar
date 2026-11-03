/* ElementsWar - 渲染 / 输入 / HUD / 菜单 / 商店 / 设置 */
(function () {
  'use strict';
  var EW = window.EW;
  var CFG = EW.CFG;
  var SET = window.SETTINGS;
  var SD = SET.data;
  var ELEM_COLOR = EW.ELEM_COLOR;
  var ELEM_NAME = { w: '水', f: '火', e: '电', d: '土' };
  var ELEM_ORDER = ['w', 'f', 'e', 'd'];

  var VW = 1440, VH = 810;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  canvas.width = VW; canvas.height = VH;

  var FOG_S = 0.5;
  var fogCanvas = document.createElement('canvas');
  fogCanvas.width = Math.round(VW * FOG_S); fogCanvas.height = Math.round(VH * FOG_S);
  var fctx = fogCanvas.getContext('2d');

  var state = 'menu';
  var settingsReturn = 'menu';
  var pauseReturn = 'play';
  var mode = 'large';
  var loadout = { weapon: 'pistol', ammo: 'w', items: ['w', 'f'] };
  var g = null, player = null, M = null;
  var cam = { x: 0, y: 0 };
  var keys = {};
  var mouse = { sx: VW / 2, sy: VH / 2, x: 0, y: 0, down: false };
  var showScore = false;
  var showField = true;
  var startT = 0;
  var toast = { text: '', t: 0 };
  var inMatchLoadout = false;
  var selItem = 0;
  var dmgNums = [];
  var accumMap = {};
  var fpsAvg = 60, lastFrameT = 0, speedAvg = 0, renderMs = 0;
  var fatalCount = 0, fatalMsg = '';
  var visionMs = 0, frameJitter = 0, frameWorst = 0, jitterT = 0;
  var diagNoFog = new URLSearchParams(location.search).get('fog') === '0';
  var diagNoField = new URLSearchParams(location.search).get('field') === '0';
  var lastSnapWall = 0, netWarned = false;
  var lastPos = { x: 0, y: 0 };
  var awaitingKey = null;

  // ---------------- 音频 ----------------
  var SFX = window.SFX;
  function ensureAudio() { if (SFX) { SFX.init(); SFX.resume(); } }
  window.addEventListener('pointerdown', ensureAudio, { passive: true });
  window.addEventListener('keydown', ensureAudio, { passive: true });
  function clickSfx() { if (SFX) { ensureAudio(); SFX.ui(); } }

  // ---------------- DOM ----------------
  var ui = document.getElementById('ui');
  var elMenu = document.getElementById('menu');
  var elLoadout = document.getElementById('loadout');
  var elPause = document.getElementById('pause');
  var elShop = document.getElementById('shop');
  var elSettings = document.getElementById('settings');
  var elEnd = document.getElementById('end');
  var elWeapons = document.getElementById('weapons');
  var elAmmo = document.getElementById('ammo');
  var elItems = document.getElementById('items');
  var elWdesc = document.getElementById('wdesc');
  var elGo = document.getElementById('go');
  var elBack = document.getElementById('back');
  var elHint = document.getElementById('loHint');
  var elShopBody = document.getElementById('shopBody');
  var elShopMoney = document.getElementById('shopMoney');
  var elSettingsBody = document.getElementById('settingsBody');
  var elEndTitle = document.getElementById('endTitle');
  var elEndScore = document.getElementById('endScore');
  var PANELS = [elMenu, elLoadout, elPause, elShop, elSettings, elEnd];

  function show(el, on) { el.style.display = on ? '' : 'none'; }
  function setState(s) {
    state = s;
    ui.classList.toggle('hidden', s === 'play');
    show(elMenu, s === 'menu');
    show(elLoadout, s === 'loadout');
    show(elPause, s === 'pause');
    show(elShop, s === 'shop');
    show(elSettings, s === 'settings');
    show(elEnd, s === 'end');
    var np = document.getElementById('netpanel');
    if (np) show(np, s === 'net');
  }

  // ---------------- 更新日志 ----------------
  var CHANGELOG = [
    {
      v: '0.8.0', d: '本次更新', items: [
        '靶场人机上方直接显示当前生命 / 最大生命与护甲',
        '灼烧等持续伤害不再飙字，也不计入伤害统计（只算直接命中与反应爆发）',
        '角色头顶的血条上方新增护甲条（蓝色）与护盾条（金色）',
        '长刀现在附带当前弹药元素：命中会挂属性并可触发反应',
        '地图编辑器显示自动生成的重生房间范围，避免画到里面',
        '土墙持续时间 12s → 8.4s（削弱 30%）',
        '新天赋「第三只眼」2400：获得 110° 背后视野（射程 55%）'
      ]
    },
    {
      v: '0.7.0', d: '靶场 / 长刀', items: [
        '护甲条改为叠加在生命条上，修复状态栏错位',
        '修复伤害归属：元素反应伤害现在正确记在投掷者头上（之前因为先扣燃料再算归属，常常丢失）',
        '新增靶场：静止测试人机，F3 可调距离 / 高低 / 护甲 / 生命',
        '霰弹枪改为全自动连喷（AA12 式，260 射速）',
        '防具独立成栏，单局只能购买 1 种且购买后锁定',
        '新增长刀：矩形范围近战，背刺双倍伤害',
        '修复地图编辑器导入后与原有地图重叠（自定义地图被重复镜像了一次）'
      ]
    },
    {
      v: '0.6.0', d: '护甲 / 无畏战士', items: [
        '新增护甲系统：再生护甲 2000（50 点，脱战恢复）/ 重型护甲 2200（100 点，死亡重置）',
        '伤害数字只显示自己造成的伤害，元素反应会额外标注反应名（如「蒸发」）',
        '金钱改为亮绿色显示',
        '新增武器有效射程：超出射程后伤害线性衰减，最低 40%',
        '地图编辑器改为空白开局，可调整地图边界大小，新增中心对称编辑',
        '20 连杀改为「无畏战士」：15 秒内射速 +50%、换弹 +50%、获得 800 护盾，击杀 +3 秒',
        '橡胶子弹涨到 3000',
        '土手雷 CD 16 秒；土墙周围形成泥沼，抵消水区域并减速 / 降射速',
        '狙击枪可打穿土墙并对墙造成 200% 伤害，但自身伤害减半',
        '霰弹枪加强：伤害 7→9、射速 75→90、弹匣 6→7、换弹 2.6→2.2'],
    },
    {
      v: '0.5.0', items: [
        'AI 改为手枪开局、零资金，会在出生区攒钱自己解锁武器',
        '连杀技能持续时间延长：穿行 3.2s→6.5s，全图视野 8s→12s',
        '阵亡状态下也能打开配装界面修改装备',
        '天赋商店与配装界面合并成一个面板'
        ,
        '新增天赋：橡胶子弹 2500（子弹弹射一次）、鹰眼视野 2000（视野更远更宽）',
        '新增地图编辑器（主菜单进入），可绘制墙体/水坑/火药桶并保存试玩',
        '新增击杀反馈：技能栏上方显示击杀图标、目标与获得金钱',
        '伤害数字改到准星右侧，修复高负载时丢字的问题',
        '新增小地图：掩体、水坑、元素区域、队友与可见敌人',
        '爆炸桶击退 620→820',
        '狙击枪 / 机枪价格调整为 1000'
      ]
    },
    {
      v: '0.4.0', d: '本次更新', items: [
        '新增设置界面：伤害数字模式、详细信息、帧率上限、自定义按键',
        '伤害飙字：支持"每次伤害"与"累计叠加"两种显示',
        '天赋商店（单局）：枪杀 +300 / 元素击杀 +500，可购买击杀回血（20%，1500）',
        '5 杀奖励改为「穿行」：短时间穿墙移动，子弹依然无法穿墙',
        '连杀技能改为主动释放、可保留至死亡后，最多持有 1 个',
        '水电麻痹削弱：加入 1.4s 内置冷却，麻痹时长降到 0.28s',
        '出生点改为四面环墙的房间，房内回血 + 重生 10 秒无敌',
        '新增 1v1 田字地图；新增水坑场景交互物',
        'ESC 改为暂停界面（不再退回大厅）',
        '射手步枪与狙击枪改为半自动，必须点射',
        '配装页新增武器详细介绍；换弹显示环形读条',
        '狙击枪子弹可穿透，每穿过一人伤害 ×0.75',
        '爆炸桶击退加强，且会在 20 秒后恢复',
        '新增疾跑（Shift）与体力值；新增土手雷（临时墙体）',
        '武器解锁：手枪免费，其余武器 500 元解锁（单局）'
      ]
    },
    {
      v: '0.3.0', items: [
        '1v1 / 3v3 / 5v5 三张镜像对称地图与主菜单',
        '配装系统：1 武器 + 1 弹种 + 2 道具，出生区内可改',
        '道具改为 CD 制；新增霰弹枪',
        '连杀奖励：5 治疗 / 9 视野 / 13 空袭 / 20 胜利',
        '狙击枪伤害 55 → 95；机枪开火移动惩罚',
        'Tab 战绩面板、F2 调参面板'
      ]
    },
    {
      v: '0.2.0', items: [
        '改大地图，5v5，100 人头胜利条件',
        '雾真正遮挡视线（线段求交）',
        '出生保护、火药桶、区域附着速度 0.92s',
        'AI 网格 A* 寻路，修复高刷新率下原地抽搐'
      ]
    },
    {
      v: '0.1.0', items: [
        '元素场域模型：区域烘焙成格子浓度，按连通块裁决',
        '蒸发 / 超载 / 感电 / 三相共鸣四种反应',
        '木桶法则、燃料消耗、掩体遮挡、战争迷雾'
      ]
    }
  ];

  function showChangelog() {
    clickSfx();
    settingsReturn = state === 'pause' ? 'pause' : 'menu';
    var html = '<div class="ttl">版本 ' + EW.VERSION + '</div>';
    CHANGELOG.forEach(function (c) {
      html += '<div class="ttl" style="font-size:13px;color:#8b9ab3;margin-top:16px">v' + c.v +
        (c.d ? ' · ' + c.d : '') + '</div>';
      c.items.forEach(function (t) { html += '<div class="logline">' + t + '</div>'; });
    });
    elSettingsBody.innerHTML = html;
    elSettingsBody.dataset.mode = 'log';
    show(document.getElementById('setReset'), false);
    setState('settings');
  }

  // ---------------- 配装 + 天赋（合并界面） ----------------
  var TALENT_DESC = {
    lifesteal: '每次击杀回复 20% 生命', rubber: '子弹击中墙体后弹射一次',
    eagle: '视野距离 ×1.4、视野角度 ×1.3', thirdEye: '获得 110° 的背后视野（射程 55%）'
  };
  var ARMOR_DESC = {
    regenArmor: '获得 50 点护甲，脱战后缓慢恢复',
    heavyArmor: '获得 100 点护甲，不可恢复，死亡重置'
  };
  var TALENTS = EW.TALENTS.map(function (t) { return { k: t.k, name: t.name, cost: t.cost, desc: TALENT_DESC[t.k] || '' }; });
  var ARMORS = EW.ARMORS.map(function (t) { return { k: t.k, name: t.name, cost: t.cost, desc: ARMOR_DESC[t.k] || '' }; });
  var loadoutReturn = 'play';

  function money() { return player ? Math.floor(player.money) : 0; }
  function unlockedSet() { return g ? g.unlocked : { pistol: true }; }
  function talentSet() { return player ? player.talents : { lifesteal: false, rubber: false, eagle: false }; }

  function buildLoadoutUI() {
    var unl = unlockedSet();
    var canBuy = !!g;
    var m = money();

    var elMoney = document.getElementById('loMoney');
    if (elMoney) elMoney.textContent = canBuy ? ('¥' + m) : '开局后获得资金';

    // 武器
    elWeapons.innerHTML = '';
    EW.WEAPON_ORDER.forEach(function (k) {
      var w = EW.WEAPONS[k];
      var locked = !unl[k];
      var d = document.createElement('div');
      d.className = 'opt' + (loadout.weapon === k ? ' on' : '') + (locked ? ' locked' : '');
      var dps = Math.round(w.dmg * (w.pellets || 1) * w.rpm / 60);
      d.innerHTML = (locked ? '<div class="price">' + w.cost + '</div>' : '') +
        '<div class="n">' + w.name + (w.pellets > 1 ? ' <span style="color:#f5854a">×' + w.pellets + '</span>' : '') +
        (w.semi ? ' <span style="color:#7b8aa3;font-size:10px">半自动</span>' : '') +
        '</div><div class="s">' + w.dmg + ' × ' + w.rpm + ' · DPS ' + dps + '</div>';
      d.onmouseenter = function () { renderWeaponDesc(k); };
      d.onclick = function () {
        clickSfx();
        if (!locked) { loadout.weapon = k; buildLoadoutUI(); return; }
        if (!canBuy) { elHint.innerHTML = '<span class="warn">开局后才能购买武器</span>'; return; }
        if (m < w.cost) { elHint.innerHTML = '<span class="warn">资金不足（还差 ' + (w.cost - m) + '）</span>'; return; }
        loadout.weapon = k;
        if (netActive) {
          netCmd({ cmd: 'buy', kind: 'weapon', key: k });
          netCmd({ cmd: 'buy', kind: 'loadout', dat: { weapon: k, ammo: loadout.ammo, items: loadout.items } });
        } else {
          player.money -= w.cost;
          g.unlocked[k] = true;
          applyLoadoutToUnit();
          toastMsg('已解锁 ' + w.name + '（-' + w.cost + '）');
        }
        buildLoadoutUI();
      };
      elWeapons.appendChild(d);
    });
    renderWeaponDesc(loadout.weapon);

    // 天赋
    var elT = document.getElementById('talents');
    if (elT) {
      var tset = talentSet();
      elT.innerHTML = '';
      TALENTS.forEach(function (t) {
        var owned = !!tset[t.k];
        var d = document.createElement('div');
        d.className = 'opt' + (owned ? ' on' : '') + (owned ? '' : (canBuy ? '' : ' locked'));
        d.innerHTML = '<div class="n">' + t.name +
          (owned ? ' <span style="color:#8fe3d4;font-size:10px">已拥有</span>' : '') +
          '</div><div class="s">' + t.desc + '</div>' +
          (owned ? '' : '<div class="price">' + t.cost + '</div>');
        d.onclick = function () {
          clickSfx();
          if (owned) return;
          if (!canBuy) { elHint.innerHTML = '<span class="warn">开局后才能购买天赋</span>'; return; }
          if (m < t.cost) { elHint.innerHTML = '<span class="warn">资金不足（还差 ' + (t.cost - m) + '）</span>'; return; }
          if (netActive) { netCmd({ cmd: 'buy', kind: 'talent', key: t.k }); }
          else { player.money -= t.cost; player.talents[t.k] = true; }
          buildLoadoutUI();
          toastMsg('已购买天赋：' + t.name);
        };
        elT.appendChild(d);
      });
    }

    // 防具（单局只能买一种）
    var elA = document.getElementById('armors');
    if (elA) {
      var tsetA = talentSet();
      var ownedKey = tsetA.regenArmor ? 'regenArmor' : (tsetA.heavyArmor ? 'heavyArmor' : null);
      elA.innerHTML = '';
      ARMORS.forEach(function (t) {
        var owned = ownedKey === t.k;
        var lockedOther = !!ownedKey && !owned;
        var d = document.createElement('div');
        d.className = 'opt' + (owned ? ' on' : '') + ((lockedOther || !canBuy) ? ' locked' : '');
        d.innerHTML = '<div class="n">' + t.name +
          (owned ? ' <span style="color:#8fe3d4;font-size:10px">已装备</span>' : '') +
          (lockedOther ? ' <span style="color:#ff7a7a;font-size:10px">本局已锁定</span>' : '') +
          '</div><div class="s">' + t.desc + '</div>' +
          (owned || lockedOther ? '' : '<div class="price">' + t.cost + '</div>');
        d.onclick = function () {
          clickSfx();
          if (owned) return;
          if (lockedOther) { elHint.innerHTML = '<span class="warn">本局已购买其他防具，无法更换</span>'; return; }
          if (!canBuy) { elHint.innerHTML = '<span class="warn">开局后才能购买</span>'; return; }
          if (m < t.cost) { elHint.innerHTML = '<span class="warn">资金不足（还差 ' + (t.cost - m) + '）</span>'; return; }
          if (netActive) { netCmd({ cmd: 'buy', kind: 'armor', key: t.k }); }
          else {
            player.money -= t.cost;
            player.talents.regenArmor = (t.k === 'regenArmor');
            player.talents.heavyArmor = (t.k === 'heavyArmor');
            player.armorMax = (t.k === 'regenArmor') ? CFG.regenArmorMax : CFG.heavyArmorMax;
            player.armor = player.armorMax;
          }
          buildLoadoutUI();
          toastMsg('已装备 ' + t.name);
        };
        elA.appendChild(d);
      });
    }

    // 弹种
    elAmmo.innerHTML = '';
    ELEM_ORDER.slice(0, 3).forEach(function (k) {
      var d = document.createElement('div');
      d.className = 'opt' + (loadout.ammo === k ? ' on' : '');
      d.innerHTML = '<div class="n" style="color:rgb(' + ELEM_COLOR[k].join(',') + ')">' +
        ELEM_NAME[k] + ' 子弹</div><div class="s">' + {
          w: '减速 + 蒸发', f: '灼烧 + 超载', e: '麻痹 + 感电'
        }[k] + '</div>';
      d.onclick = function () { clickSfx(); loadout.ammo = k; buildLoadoutUI(); };
      elAmmo.appendChild(d);
    });

    // 道具
    elItems.innerHTML = '';
    ELEM_ORDER.forEach(function (k) {
      var on = loadout.items.indexOf(k) >= 0;
      var d = document.createElement('div');
      d.className = 'opt' + (on ? ' on' : '');
      d.innerHTML = '<div class="n" style="color:rgb(' + ELEM_COLOR[k].join(',') + ')">' +
        EW.ITEMS[k].name + '</div><div class="s">CD ' + EW.ITEMS[k].cd + 's · ' + EW.ITEMS[k].desc + '</div>';
      d.onclick = function () {
        clickSfx();
        var i = loadout.items.indexOf(k);
        if (i >= 0) loadout.items.splice(i, 1);
        else if (loadout.items.length < 2) loadout.items.push(k);
        else { elHint.innerHTML = '<span class="warn">最多装备 2 件道具</span>'; return; }
        buildLoadoutUI();
      };
      elItems.appendChild(d);
    });

    var ok = loadout.items.length === 2 && unlockedSet()[loadout.weapon];
    elGo.disabled = !ok;
    elGo.textContent = inMatchLoadout ? '应用配装' : '进入战场';
  }

  function renderWeaponDesc(k) {
    var w = EW.WEAPONS[k];
    var dps = Math.round(w.dmg * (w.pellets || 1) * w.rpm / 60);
    elWdesc.innerHTML = '<b>' + w.name + '</b>' +
      '　<span class="stat">单发 ' + w.dmg + '</span>' +
      ' · <span class="stat">射速 ' + w.rpm + '</span>' +
      ' · <span class="stat">弹匣 ' + w.mag + '</span>' +
      ' · <span class="stat">换弹 ' + w.reload + 's</span>' +
      ' · <span class="stat">理论 DPS ' + dps + '</span>' +
      (w.pellets > 1 ? ' · <span class="stat">' + w.pellets + ' 弹丸</span>' : '') +
      ' · <span class="stat">' + (w.cost === 0 ? '免费' : w.cost + ' 元') + '</span>' +
      '<br>' + w.desc;
  }

  function openLoadout(inMatch) {
    inMatchLoadout = !!inMatch;
    loadoutReturn = inMatch ? 'play' : 'menu';
    if (inMatch && g) {
      loadout.weapon = player.weapon;
      loadout.ammo = player.ammoElem;
      loadout.items = player.items.slice();
    }
    buildLoadoutUI();
    setState('loadout');
  }

  function applyLoadoutToUnit() {
    player.weapon = loadout.weapon;
    player.mag = EW.WEAPONS[player.weapon].mag;
    player.reloadT = 0;
    player.ammoElem = loadout.ammo;
    player.items = loadout.items.slice();
    player.itemCd = { w: 0, f: 0, e: 0, d: 0 };
    selItem = 0;
  }

  elGo.onclick = function () {
    clickSfx();
    if (inMatchLoadout) {
      if (netActive) netCmd({ cmd: 'buy', kind: 'loadout', dat: { weapon: loadout.weapon, ammo: loadout.ammo, items: loadout.items } });
      else applyLoadoutToUnit();
      setState('play');
      toastMsg('配装已更新');
    }
    else startMatch();
  };
  elBack.onclick = function () { clickSfx(); setState(inMatchLoadout ? loadoutReturn : 'menu'); };
  document.querySelectorAll('.mode-grid button').forEach(function (b) {
    b.onclick = function () { clickSfx(); mode = b.dataset.mode; openLoadout(false); };
  });
  document.getElementById('btnSettings').onclick = function () { clickSfx(); settingsReturn = 'menu'; openSettings(); };
  var _be = document.getElementById('btnEditor');
  if (_be) _be.onclick = function () { clickSfx(); window.open('editor.html', '_blank'); };
  var _bh = document.getElementById('btnChangelog');
  if (_bh) _bh.onclick = showChangelog;
  var _bhs = document.getElementById('btnHallSettings');
  if (_bhs) _bhs.onclick = function () { clickSfx(); settingsReturn = 'net'; openSettings(); };
  document.getElementById('again').onclick = function () { clickSfx(); g = null; M = null; setState('menu'); };
  document.getElementById('btnResume').onclick = function () { clickSfx(); setState('play'); };
  document.getElementById('btnShop').onclick = function () { clickSfx(); loadoutReturn = 'pause'; openLoadout(true); };
  document.getElementById('btnPauseSettings').onclick = function () { clickSfx(); settingsReturn = 'pause'; openSettings(); };
  document.getElementById('btnQuit').onclick = function () { clickSfx(); g = null; M = null; setState('menu'); };
  document.getElementById('setClose').onclick = function () { clickSfx(); setState(settingsReturn); };
  document.getElementById('setReset').onclick = function () { clickSfx(); SET.reset(); renderSettings(); };

  // ---------------- 商店（已并入配装界面） ----------------
  function openShop() { loadoutReturn = 'pause'; openLoadout(true); }

  // ---------------- 设置 ----------------
  function openSettings() {
    elSettingsBody.dataset.mode = 'settings';
    show(document.getElementById('setReset'), true);
    renderSettings();
    setState('settings');
  }

  function segRow(label, options, current, onPick) {
    var row = document.createElement('div');
    row.className = 'setRow';
    row.innerHTML = '<span class="lab">' + label + '</span>';
    var box = document.createElement('div');
    box.className = 'segs';
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.className = 'seg' + (String(current) === String(o.v) ? ' on' : '');
      b.textContent = o.n;
      b.onclick = function () { clickSfx(); onPick(o.v); };
      box.appendChild(b);
    });
    row.appendChild(box);
    return row;
  }

  function renderSettings() {
    var body = elSettingsBody;
    body.innerHTML = '';

    body.appendChild(segRow('伤害数字显示', [
      { n: '每次伤害', v: 'perHit' }, { n: '累计叠加', v: 'accum' }
    ], SD.dmgMode, function (v) { SD.dmgMode = v; SET.save(); renderSettings(); }));

    body.appendChild(segRow('详细信息（帧数 / 速度）', [
      { n: '开', v: '1' }, { n: '关', v: '0' }
    ], SD.showInfo ? '1' : '0', function (v) { SD.showInfo = v === '1'; SET.save(); renderSettings(); }));

    body.appendChild(segRow('帧率上限', [
      { n: '60', v: 60 }, { n: '120', v: 120 }, { n: '144', v: 144 },
      { n: '240', v: 240 }, { n: '不限', v: 0 }
    ], SD.fpsCap, function (v) { SD.fpsCap = Number(v); SET.save(); renderSettings(); }));

    var hdr = document.createElement('div');
    hdr.className = 'ttl';
    hdr.textContent = '按键绑定';
    body.appendChild(hdr);

    var KEYLABEL = {
      reload: '换弹', item1: '道具 1', item2: '道具 2', cycleItem: '切换道具',
      ks: '连杀技能', sprint: '疾跑', loadout: '配装界面', shop: '天赋商店', pause: '暂停'
    };
    Object.keys(KEYLABEL).forEach(function (action) {
      var row = document.createElement('div');
      row.className = 'setRow';
      var lab = document.createElement('span');
      lab.className = 'lab';
      lab.textContent = KEYLABEL[action];
      var btn = document.createElement('button');
      btn.className = 'keybtn' + (awaitingKey === action ? ' wait' : '');
      btn.textContent = awaitingKey === action ? '按任意键…' : SD.keys[action].toUpperCase();
      btn.onclick = function () { awaitingKey = action; clickSfx(); renderSettings(); };
      row.appendChild(lab); row.appendChild(btn);
      body.appendChild(row);
    });
  }

  // ---------------- 开局 ----------------
  function startMatch() {
    g = EW.createGame(mode, loadout);
    if (mode === 'range') {
      EW.WEAPON_ORDER.forEach(function (k) { g.unlocked[k] = true; });
      g.player.money = 99999;
      g.player.talents = { lifesteal: true, rubber: true, eagle: true, regenArmor: false, heavyArmor: false };
      g.player.armorMax = 100; g.player.armor = 100;
    }
    player = g.player;
    M = g.map;
    g.inputs[player.id] = { mx: 0, my: 0, aim: 0, shoot: false, throwElem: null };
    centerCam();
    startT = performance.now();
    toast = { text: '', t: 0 };
    dmgNums = []; accumMap = {};
    lastPos = { x: player.x, y: player.y };
    selItem = 0;
    setState('play');
  }

  function centerCam() {
    cam.x = clamp(player.x - VW / 2, 0, Math.max(0, M.w - VW));
    cam.y = clamp(player.y - VH / 2, 0, Math.max(0, M.h - VH));
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function toastMsg(t) { toast.text = t; toast.t = 2.2; }

  // ---------------- 输入 ----------------
  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if (awaitingKey) {
      e.preventDefault();
      if (k !== 'escape') { SD.keys[awaitingKey] = k; SET.save(); }
      awaitingKey = null;
      renderSettings();
      return;
    }
    keys[k] = true;

    if (state === 'play') {
      if (e.key === 'Tab') { e.preventDefault(); showScore = true; return; }
      if (e.key === 'F1') { e.preventDefault(); showField = !showField; return; }
      if (e.key === 'F2') { e.preventDefault(); toggleDebug(); return; }
    if (e.key === 'F3') { e.preventDefault(); toggleRange(); return; }
      var K = SD.keys;
      if (k === 'escape' || k === K.pause) { e.preventDefault(); openPause(); return; }
      if (k === K.reload) { if (!netCmd({ cmd: 'reload' })) player.reloadReq = true; return; }
      if (k === K.ks) {
        if (netActive) { netCmd({ cmd: 'ks', x: mouse.x, y: mouse.y }); return; }
        if (!EW.useKsItem(g, player, mouse.x, mouse.y)) toastMsg('没有可用的连杀技能');
        return;
      }
      if (k === K.shop) { openShop(); return; }
      if (k === K.cycleItem) { selItem = (selItem + 1) % 2; toastMsg('当前道具：' + ELEM_NAME[player.items[selItem]]); return; }
      if (k === K.loadout) {
        if (player.alive && player.outSpawn) { toastMsg('已离开出生区，配装已锁定'); return; }
        loadoutReturn = 'play';
        openLoadout(true);
        return;
      }
      if (k === K.item1) { throwItemSlot(0); return; }
      if (k === K.item2) { throwItemSlot(1); return; }
      if (k === 'm') { if (SFX) { ensureAudio(); toastMsg(SFX.toggle() ? '音效：开' : '音效：关'); } return; }
    } else if (state === 'pause' && k === 'escape') {
      setState('play');
    } else if (state === 'shop' && k === 'escape') {
      setState('pause');
    } else if (state === 'settings' && k === 'escape') {
      setState(settingsReturn);
    }
  });
  window.addEventListener('keyup', function (e) {
    keys[e.key.toLowerCase()] = false;
    if (e.key === 'Tab') showScore = false;
  });

  function openPause() {
    pauseReturn = 'play';
    document.getElementById('pauseSub').textContent =
      (M ? M.name : '') + '　' + g.score[0] + ' : ' + g.score[1] +
      '　连杀 ' + player.streak + '　资金 ' + Math.floor(player.money);
    setState('pause');
  }

  function throwItemSlot(slot) {
    if (state !== 'play' || !player.alive) return;
    var elem = player.items[slot];
    if (!elem) return;
    if (player.itemCd[elem] > 0) { toastMsg(EW.ITEMS[elem].name + ' 冷却中 ' + player.itemCd[elem].toFixed(1) + 's'); return; }
    g.inputs[player.id].throwElem = { slot: slot, x: mouse.x, y: mouse.y };
  }

  function toWorld(ev) {
    var r = canvas.getBoundingClientRect();
    var sx = (ev.clientX - r.left) * (VW / r.width);
    var sy = (ev.clientY - r.top) * (VH / r.height);
    mouse.sx = sx; mouse.sy = sy;
    mouse.x = sx + cam.x; mouse.y = sy + cam.y;
  }
  canvas.addEventListener('mousemove', toWorld);
  canvas.addEventListener('mousedown', function (e) {
    toWorld(e);
    if (e.button === 0) mouse.down = true;
    if (e.button === 2) throwItemSlot(selItem);
  });
  window.addEventListener('mouseup', function (e) { if (e.button === 0) mouse.down = false; });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---------------- 伤害数字（准星旁） ----------------
  var REACT_NAMES = { '超载爆炸': 1, '感电陷阱': 1, '三相共鸣': 1, '空袭': 1 };
  var dmgFeed = [];
  var accumMap = {};
  var killFeed = [];

  function addDmg(ev) {
    if (!player) return;
    if (ev.dstTeam === player.team) return;                       // 不显示打自己或队友
    var byMe = ev.mine || (ev.srcTeam === player.team);
    if (!byMe) return;
    var toMe = false;
    var react = REACT_NAMES[ev.how] ? ev.how : null;
    if (SD.dmgMode === 'accum') {
      var e2 = accumMap[ev.uid];
      if (e2) { e2.sum += ev.amt; e2.life = 1.2; e2.big = e2.big || ev.big; e2.react = react || e2.react; }
      else accumMap[ev.uid] = { sum: ev.amt, life: 1.2, big: ev.big, elem: ev.elem, react: react };
    } else {
      dmgFeed.push({ amt: ev.amt, life: 0.95, elem: ev.elem, big: ev.big, react: react });
      if (dmgFeed.length > 8) dmgFeed.shift();
    }
  }

  function addKillFx(ev) {
    killFeed.push({ victim: ev.victim, how: ev.how, money: ev.money, weapon: ev.weapon, life: 2.6 });
    if (killFeed.length > 3) killFeed.shift();
  }

  function updateDmgNums(dt) {
    for (var i = dmgFeed.length - 1; i >= 0; i--) {
      dmgFeed[i].life -= dt;
      if (dmgFeed[i].life <= 0) dmgFeed.splice(i, 1);
    }
    for (var k in accumMap) {
      accumMap[k].life -= dt;
      if (accumMap[k].life <= 0) delete accumMap[k];
    }
    for (var j = killFeed.length - 1; j >= 0; j--) {
      killFeed[j].life -= dt;
      if (killFeed[j].life <= 0) killFeed.splice(j, 1);
    }
  }

  function drawDmgNums() {
    var x0 = mouse.sx + 38, y0 = mouse.sy - 8;
    ctx.textAlign = 'left';

    var i = 0;
    for (var k in accumMap) {
      var e2 = accumMap[k];
      var a2 = Math.min(1, e2.life / 0.45);
      var c2 = ELEM_COLOR[e2.elem] || [255, 228, 140];
      var yy = y0 + i * 30;
      ctx.globalAlpha = a2;
      ctx.font = '800 ' + (e2.sum >= 80 ? 26 : e2.sum >= 30 ? 21 : 17) + 'px "Microsoft YaHei",sans-serif';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(e2.sum, x0, yy);
      ctx.fillStyle = 'rgba(' + c2[0] + ',' + c2[1] + ',' + c2[2] + ',1)';
      ctx.fillText(e2.sum, x0, yy);
      if (e2.react) {
        ctx.font = '700 12px "Microsoft YaHei",sans-serif';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(e2.react, x0, yy + 15);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(e2.react, x0, yy + 15);
      }
      ctx.globalAlpha = 1;
      i++;
    }

    for (var d = 0; d < dmgFeed.length; d++) {
      var it = dmgFeed[d];
      var al = Math.min(1, it.life / 0.3);
      var col = ELEM_COLOR[it.elem] || [255, 228, 140];
      var ty = y0 + (i + d) * 30 - (1 - al) * 8;
      ctx.globalAlpha = al;
      ctx.font = '800 ' + (it.big ? 24 : it.amt >= 30 ? 20 : 16) + 'px "Microsoft YaHei",sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(it.amt, x0, ty);
      ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',1)';
      ctx.fillText(it.amt, x0, ty);
      if (it.react) {
        ctx.font = '700 12px "Microsoft YaHei",sans-serif';
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(it.react, x0, ty + 14);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(it.react, x0, ty + 14);
      }
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
  }

  // 击杀反馈（技能栏上方）
  function drawKillFeed() {
    if (!killFeed.length) return;
    var baseY = VH - 250;
    ctx.textAlign = 'center';
    for (var i = 0; i < killFeed.length; i++) {
      var k = killFeed[i];
      var a = Math.min(1, k.life / 0.5);
      var y = baseY - i * 46;
      ctx.globalAlpha = a;
      var w = 250, x = VW / 2 - w / 2;
      ctx.fillStyle = 'rgba(10,13,20,0.9)';
      roundRect(ctx, x, y, w, 38, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,120,90,0.75)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, y, w, 38, 8); ctx.stroke();

      // 击杀图标
      ctx.fillStyle = 'rgba(255,90,80,0.95)';
      ctx.beginPath(); ctx.arc(x + 24, y + 19, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 19, y + 24); ctx.lineTo(x + 29, y + 14);
      ctx.moveTo(x + 19, y + 14); ctx.lineTo(x + 29, y + 24);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(235,242,252,0.98)';
      ctx.font = '600 14px "Microsoft YaHei",sans-serif';
      ctx.fillText('击杀 ' + k.victim, x + 44, y + 17);
      ctx.fillStyle = 'rgba(150,162,185,0.9)';
      ctx.font = '11px "Microsoft YaHei",sans-serif';
      ctx.fillText(k.how, x + 44, y + 31);

      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,207,107,0.98)';
      ctx.font = '700 15px "Microsoft YaHei",sans-serif';
      ctx.fillText('+¥' + k.money, x + w - 14, y + 24);
      ctx.textAlign = 'center';
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
  }

  // 小地图
  function drawMinimap() {
    var mw = 210, mh = 140;
    var mx = VW - mw - 18, my = 96;
    var sc = Math.min(mw / M.w, mh / M.h);
    var ox = mx + (mw - M.w * sc) / 2, oy = my + (mh - M.h * sc) / 2;
    ctx.fillStyle = 'rgba(8,11,17,0.85)';
    roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(70,82,110,0.8)';
    ctx.lineWidth = 1;
    roundRect(ctx, mx - 6, my - 6, mw + 12, mh + 12, 8); ctx.stroke();

    ctx.save();
    ctx.beginPath();
    roundRect(ctx, mx, my, mw, mh, 5); ctx.clip();

    // 掩体
    ctx.fillStyle = 'rgba(110,124,150,0.55)';
    for (var i = 0; i < M.covers.length; i++) {
      var c = M.covers[i];
      ctx.fillRect(ox + c[0] * sc, oy + c[1] * sc, Math.max(1, (c[2] - c[0]) * sc), Math.max(1, (c[3] - c[1]) * sc));
    }
    // 水坑
    ctx.fillStyle = 'rgba(70,150,215,0.5)';
    for (var p = 0; p < M.puddles.length; p++) {
      var pd = M.puddles[p];
      ctx.fillRect(ox + pd[0] * sc, oy + pd[1] * sc, (pd[2] - pd[0]) * sc, (pd[3] - pd[1]) * sc);
    }
    // 区域
    for (var z = 0; z < g.zones.length; z++) {
      var zn = g.zones[z];
      var zc = ELEM_COLOR[zn.elem];
      ctx.fillStyle = 'rgba(' + zc[0] + ',' + zc[1] + ',' + zc[2] + ',0.25)';
      ctx.beginPath(); ctx.arc(ox + zn.x * sc, oy + zn.y * sc, zn.r * sc, 0, Math.PI * 2); ctx.fill();
    }
    // 火药桶
    for (var b = 0; b < g.barrels.length; b++) {
      if (!g.barrels[b].alive) continue;
      ctx.fillStyle = 'rgba(215,130,70,0.9)';
      ctx.fillRect(ox + g.barrels[b].x * sc - 1.5, oy + g.barrels[b].y * sc - 1.5, 3, 3);
    }
    // 单位
    for (var u = 0; u < g.units.length; u++) {
      var un = g.units[u];
      if (!un.alive) continue;
      var ally = un.team === player.team;
      if (!ally && player.revealT <= 0 && !EW.canSee(g, player, un.x, un.y)) continue;
      ctx.fillStyle = ally ? 'rgba(90,230,210,0.95)' : 'rgba(255,90,100,0.95)';
      ctx.beginPath();
      ctx.arc(ox + un.x * sc, oy + un.y * sc, un === player ? 3.4 : 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // 视口框
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + cam.x * sc, oy + cam.y * sc, VW * sc, VH * sc);

    ctx.restore();
  }

  // ---------------- 绘制工具 ----------------
  var _rgbaCache = Object.create(null), _rgbaCount = 0;
  function rgba(c, a) {
    if (!c) c = [200, 210, 230];
    var al = (typeof a === 'number' && isFinite(a)) ? a : 1;
    if (al < 0) al = 0; else if (al > 1) al = 1;
    al = Math.round(al * 100) / 100;
    var key = (c[0] | 0) + '|' + (c[1] | 0) + '|' + (c[2] | 0) + '|' + al;
    var hit = _rgbaCache[key];
    if (hit !== undefined) return hit;
    if (_rgbaCount > 3000) { _rgbaCache = Object.create(null); _rgbaCount = 0; }
    hit = 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + al + ')';
    _rgbaCache[key] = hit;
    _rgbaCount++;
    return hit;
  }
  function roundRect(c2, x, y, w, h, r) {
    c2.beginPath();
    c2.moveTo(x + r, y);
    c2.arcTo(x + w, y, x + w, y + h, r);
    c2.arcTo(x + w, y + h, x, y + h, r);
    c2.arcTo(x, y + h, x, y, r);
    c2.arcTo(x, y, x + w, y, r);
    c2.closePath();
  }
  function onScreen(x, y, pad) {
    pad = pad || 80;
    return x > cam.x - pad && x < cam.x + VW + pad && y > cam.y - pad && y < cam.y + VH + pad;
  }

  // ---------------- 世界绘制 ----------------
  function drawFloor() {
    ctx.fillStyle = '#141924';
    ctx.fillRect(cam.x, cam.y, VW, VH);
    ctx.strokeStyle = 'rgba(46,53,71,0.55)';
    ctx.lineWidth = 1;
    for (var x = Math.floor(cam.x / 90) * 90; x < cam.x + VW; x += 90) {
      ctx.beginPath(); ctx.moveTo(x, cam.y); ctx.lineTo(x, cam.y + VH); ctx.stroke();
    }
    for (var y = Math.floor(cam.y / 90) * 90; y < cam.y + VH; y += 90) {
      ctx.beginPath(); ctx.moveTo(cam.x, y); ctx.lineTo(cam.x + VW, y); ctx.stroke();
    }
    // 水坑
    for (var p = 0; p < M.puddles.length; p++) {
      var pd = M.puddles[p];
      if (!onScreen((pd[0] + pd[2]) / 2, (pd[1] + pd[3]) / 2, 200)) continue;
      var grad = ctx.createLinearGradient(pd[0], pd[1], pd[2], pd[3]);
      grad.addColorStop(0, 'rgba(50,120,190,0.35)');
      grad.addColorStop(0.5, 'rgba(70,150,215,0.28)');
      grad.addColorStop(1, 'rgba(40,100,165,0.35)');
      ctx.fillStyle = grad;
      ctx.fillRect(pd[0], pd[1], pd[2] - pd[0], pd[3] - pd[1]);
      ctx.strokeStyle = 'rgba(110,190,240,0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(pd[0] + 1, pd[1] + 1, pd[2] - pd[0] - 2, pd[3] - pd[1] - 2);
      ctx.strokeStyle = 'rgba(160,220,255,0.18)';
      for (var wav = 0; wav < 3; wav++) {
        var wy = pd[1] + (pd[3] - pd[1]) * (0.3 + wav * 0.22) + Math.sin(g.t * 1.6 + wav) * 2;
        ctx.beginPath();
        ctx.moveTo(pd[0] + 6, wy);
        ctx.lineTo(pd[2] - 6, wy + Math.sin(g.t * 2 + wav * 2) * 3);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(80,92,120,0.4)';
    ctx.setLineDash([12, 14]);
    ctx.beginPath(); ctx.moveTo(M.w / 2, 0); ctx.lineTo(M.w / 2, M.h); ctx.stroke();
    ctx.setLineDash([]);
    for (var t = 0; t < 2; t++) {
      var z = M.spawnZones[t];
      ctx.fillStyle = t === 0 ? 'rgba(80,220,200,0.05)' : 'rgba(255,90,100,0.05)';
      ctx.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
    }
    ctx.strokeStyle = 'rgba(90,102,130,0.6)';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, M.w, M.h);
  }

  function drawField() {
    if (!showField || diagNoField) return;
    var f = g.field;
    var i0 = Math.max(0, Math.floor(cam.x / EW.CELL) - 1);
    var i1 = Math.min(M.cols - 1, Math.floor((cam.x + VW) / EW.CELL) + 1);
    var j0 = Math.max(0, Math.floor(cam.y / EW.CELL) - 1);
    var j1 = Math.min(M.rows - 1, Math.floor((cam.y + VH) / EW.CELL) + 1);
    for (var j = j0; j <= j1; j++) {
      for (var i = i0; i <= i1; i++) {
        var idx = j * M.cols + i;
        var k = f.kind[idx];
        if (!k) continue;
        var c = EW.KIND_COLOR[k];
        if (!c) continue;
        var a = f.inten[idx] * (k >= EW.K.VAPOR ? 0.62 : 0.42);
        ctx.fillStyle = rgba(c, a);
        ctx.fillRect(i * EW.CELL + 0.5, j * EW.CELL + 0.5, EW.CELL - 1, EW.CELL - 1);
      }
    }
  }

  function drawZones() {
    for (var i = 0; i < g.zones.length; i++) {
      var z = g.zones[i];
      if (!onScreen(z.x, z.y, z.r + 60)) continue;
      var col = ELEM_COLOR[z.elem];
      var pr = (z.maxFuel > 0) ? Math.max(0.15, z.fuel / z.maxFuel) : 1;
      if (!isFinite(pr)) pr = 1;
      var grad = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
      grad.addColorStop(0, rgba(col, 0.20 * pr + 0.05));
      grad.addColorStop(0.7, rgba(col, 0.10 * pr + 0.02));
      grad.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(col, 0.5 * pr + 0.15);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawTraps() {
    for (var i = 0; i < g.traps.length; i++) {
      var t = g.traps[i];
      if (!onScreen(t.x, t.y, t.r + 40)) continue;
      var a = (t.maxLife > 0) ? t.life / t.maxLife : 1;
      if (!isFinite(a)) a = 1;
      ctx.strokeStyle = rgba([170, 110, 255], 0.35 + 0.4 * a);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = rgba([150, 90, 250], 0.10 + 0.08 * a);
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawCovers() {
    for (var i = 0; i < M.covers.length; i++) {
      var c = M.covers[i];
      if (!onScreen((c[0] + c[2]) / 2, (c[1] + c[3]) / 2, 140)) continue;
      var x = c[0], y = c[1], w = c[2] - c[0], h = c[3] - c[1];
      ctx.fillStyle = 'rgba(6,8,12,0.55)';
      ctx.fillRect(x + 5, y + 7, w, h);
      var grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, '#5b6479');
      grad.addColorStop(1, '#3d4557');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(160,172,198,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
  }

  function drawEarthWalls() {
    for (var i = 0; i < g.walls.length; i++) {
      var wl = g.walls[i];
      if (!onScreen(wl.cx, wl.cy, 160)) continue;
      var x = wl.rect[0], y = wl.rect[1], w = wl.w, h = wl.h;
      var hpR = Math.max(0, wl.hp / wl.maxHp);
      var grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, wl.flash > 0 ? '#a8823f' : '#7a5f36');
      grad.addColorStop(1, wl.flash > 0 ? '#6f5327' : '#4f3d22');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(190,160,100,0.75)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      // 裂纹
      ctx.strokeStyle = 'rgba(30,22,10,0.55)';
      ctx.lineWidth = 1.5;
      var n = Math.floor((1 - hpR) * 5) + 1;
      for (var c = 0; c < n; c++) {
        ctx.beginPath();
        ctx.moveTo(x + w * (0.2 + 0.15 * c), y + 4);
        ctx.lineTo(x + w * (0.35 + 0.12 * c), y + h - 4);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y - 8, w, 4);
      ctx.fillStyle = 'rgba(220,180,110,0.95)';
      ctx.fillRect(x, y - 8, w * hpR, 4);
    }
  }

  function drawBarrels() {
    for (var i = 0; i < g.barrels.length; i++) {
      var b = g.barrels[i];
      if (!b.alive || !onScreen(b.x, b.y, 60)) continue;
      var hpRatio = b.hp / b.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(b.x + 3, b.y + 6, b.r, b.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a4a2a';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c2703d';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,190,120,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(b.x - 16, b.y - b.r - 10, 32, 4);
      ctx.fillStyle = hpRatio > 0.5 ? 'rgba(255,190,120,0.95)' : 'rgba(255,90,90,0.95)';
      ctx.fillRect(b.x - 16, b.y - b.r - 10, 32 * hpRatio, 4);
    }
  }

  function drawBullets() {
    for (var i = 0; i < g.bullets.length; i++) {
      var b = g.bullets[i];
      if (!onScreen(b.x, b.y, 40)) continue;
      var col = ELEM_COLOR[b.elem] || [255, 255, 255];
      var tx = b.x - b.vx * 0.018, ty = b.y - b.vy * 0.018;
      ctx.strokeStyle = rgba(col, 0.9);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  function drawGrenades() {
    for (var i = 0; i < g.grenades.length; i++) {
      var gr = g.grenades[i];
      if (!onScreen(gr.x, gr.y, 90)) continue;
      var col = gr.bomb ? [255, 240, 170] : ELEM_COLOR[gr.elem];
      var p = gr.t / gr.dur;
      var arc = Math.sin(p * Math.PI) * (gr.bomb ? 90 : 46);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(gr.x, gr.y, gr.bomb ? 12 : 7, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(col, 1);
      ctx.beginPath(); ctx.arc(gr.x, gr.y - arc, gr.bomb ? 12 : 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(col, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(gr.tx, gr.ty, gr.bomb ? 40 : 18, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawUnit(u, always) {
    if (!u.alive) return;
    var isAlly = u.team === player.team;
    if (!always && !isAlly) {
      var revealed = player.revealT > 0;
      if (!revealed && !EW.canSee(g, player, u.x, u.y)) return;
    }
    var col = isAlly ? [70, 220, 200] : [255, 86, 96];
    var phasing = u.phaseT > 0;

    if (phasing) {
      ctx.strokeStyle = 'rgba(160,220,255,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 9, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (u.protT > 0) {
      ctx.strokeStyle = 'rgba(150,220,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 12 + Math.sin(g.t * 8) * 2, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = rgba(col, 0.5);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(u.x, u.y);
    ctx.lineTo(u.x + Math.cos(u.aim) * 30, u.y + Math.sin(u.aim) * 30);
    ctx.stroke();

    ctx.globalAlpha = phasing ? 0.5 : 1;
    ctx.fillStyle = rgba(col, 0.95);
    ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;

    var bars = [['w', u.status.w], ['f', u.status.f], ['e', u.status.e]];
    for (var i = 0; i < 3; i++) {
      var el = bars[i][0], v = bars[i][1];
      if (v < 2) continue;
      var a0 = -Math.PI / 2 + i * 0.55 - 0.25;
      ctx.strokeStyle = rgba(ELEM_COLOR[el], 0.9);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.r + 8, a0, a0 + 0.5 * (v / 100) + 0.02);
      ctx.stroke();
    }

    var hpw = 44;
    var hpbY = u.y - u.r - 18;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(u.x - hpw / 2, hpbY, hpw, 5);
    ctx.fillStyle = u.hp > u.maxHp * 0.4 ? 'rgba(120,230,140,0.95)' : 'rgba(255,90,90,0.95)';
    ctx.fillRect(u.x - hpw / 2, hpbY, hpw * Math.max(0, u.hp / u.maxHp), 5);
    if (u.armorMax > 0) {
      ctx.fillStyle = 'rgba(90,140,215,1)';
      ctx.fillRect(u.x - hpw / 2, hpbY - 4, hpw * Math.max(0, u.armor / u.armorMax), 3);
      ctx.strokeStyle = 'rgba(190,220,255,0.85)';
      ctx.lineWidth = 1;
      ctx.strokeRect(u.x - hpw / 2 + 0.5, hpbY - 3.5, hpw - 1, 2);
    }
    if (u.shield > 0) {
      ctx.fillStyle = 'rgba(255,215,110,0.95)';
      ctx.fillRect(u.x - hpw / 2, hpbY + 5, hpw * Math.min(1, u.shield / 800), 2.5);
    }
    if (u.isDummy) {
      ctx.textAlign = 'center';
      ctx.font = '700 14px "Microsoft YaHei",sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      var dtxt = Math.ceil(u.hp) + ' / ' + u.maxHp + (u.armorMax > 0 ? '　甲 ' + Math.ceil(u.armor) : '');
      ctx.strokeText(dtxt, u.x, u.y - u.r - 28);
      ctx.fillStyle = 'rgba(255,230,160,0.98)';
      ctx.fillText(dtxt, u.x, u.y - u.r - 28);
      ctx.textAlign = 'left';
    }

    if (!isAlly) {
      ctx.fillStyle = 'rgba(255,150,150,0.9)';
      ctx.font = '11px "Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(u.name, u.x, u.y - u.r - 24);
      ctx.textAlign = 'left';
    }
    if (u.stun > 0) {
      ctx.strokeStyle = 'rgba(200,160,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 14, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawFx() {
    for (var i = 0; i < g.fx.length; i++) {
      var f = g.fx[i];
      if (!onScreen(f.x, f.y, f.r + 40)) continue;
      var p = f.life / f.max;
      if (f.type === 'boom') {
        ctx.fillStyle = rgba([255, 200, 120], 0.55 * p);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.25 - 0.45 * p), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = rgba([255, 120, 60], 0.85 * p);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.4 - 0.6 * p), 0, Math.PI * 2); ctx.stroke();
      } else if (f.type === 'tri') {
        ctx.strokeStyle = rgba([255, 245, 180], 0.9 * p);
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.3 - 0.5 * p), 0, Math.PI * 2); ctx.stroke();
      } else if (f.type === 'slash') {
        var a0 = f.ang - 0.75, a1 = f.ang + 0.75;
        var rr = f.r * (1.15 - 0.3 * (1 - p));
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.arc(f.x, f.y, rr, a0, a1);
        ctx.closePath();
        var sc = ELEM_COLOR[f.elem] || [215, 235, 255];
        ctx.fillStyle = rgba(sc, 0.34 * p);
        ctx.fill();
        ctx.strokeStyle = rgba([255, 255, 255], 0.85 * p);
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (f.type === 'vapor') {
        ctx.fillStyle = rgba([225, 245, 255], 0.22 * p);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.4 - 0.5 * p), 0, Math.PI * 2); ctx.fill();
      } else if (f.type === 'shock') {
        ctx.strokeStyle = rgba([190, 150, 255], 0.9 * p);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.2 - 0.3 * p), 0, Math.PI * 2); ctx.stroke();
      } else if (f.type === 'heal' || f.type === 'phase') {
        ctx.strokeStyle = rgba([120, 255, 190], 0.85 * p);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - p) + 12, 0, Math.PI * 2); ctx.stroke();
      } else if (f.type === 'spark') {
        var col = ELEM_COLOR[f.elem] || [255, 255, 255];
        ctx.fillStyle = rgba(col, 0.8 * p);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.6 + 0.6 * (1 - p)), 0, Math.PI * 2); ctx.fill();
      } else if (f.type === 'land') {
        var c2 = ELEM_COLOR[f.elem] || [255, 255, 255];
        ctx.strokeStyle = rgba(c2, 0.8 * p);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.1 - 0.6 * p), 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  function drawFogs() {
    for (var i = 0; i < g.fogs.length; i++) {
      var f = g.fogs[i];
      if (!onScreen(f.x, f.y, f.r + 40)) continue;
      var a = 0.86 * Math.min(1, Math.max(0, (isFinite(f.life) ? f.life : 0) / 0.9));
      if (!isFinite(a)) a = 0;
      var grad = ctx.createRadialGradient(f.x, f.y, f.r * 0.2, f.x, f.y, f.r);
      grad.addColorStop(0, 'rgba(226,242,255,' + (a * 0.96) + ')');
      grad.addColorStop(0.62, 'rgba(206,228,246,' + (a * 0.8) + ')');
      grad.addColorStop(1, 'rgba(200,220,240,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // 把坐标推出掩体（客户端预测用，和服务端同一套规则）
  // 线段是否被任意掩体/土墙挡住
  function segBlocked(x1, y1, x2, y2) {
    var i;
    for (i = 0; i < M.covers.length; i++) if (segRect(x1, y1, x2, y2, M.covers[i])) return true;
    for (i = 0; i < g.walls.length; i++) {
      var w = g.walls[i];
      if (segRect(x1, y1, x2, y2, [w.cx - w.w / 2, w.cy - w.h / 2, w.cx + w.w / 2, w.cy + w.h / 2])) return true;
    }
    return false;
  }

  function segRect(x1, y1, x2, y2, r) {
    // 两端都在同一侧 → 不可能相交
    if ((x1 < r[0] && x2 < r[0]) || (x1 > r[2] && x2 > r[2]) ||
        (y1 < r[1] && y2 < r[1]) || (y1 > r[3] && y2 > r[3])) return false;
    // 有一端在矩形内 → 相交
    if (x1 > r[0] && x1 < r[2] && y1 > r[1] && y1 < r[3]) return true;
    if (x2 > r[0] && x2 < r[2] && y2 > r[1] && y2 < r[3]) return true;
    var dx = x2 - x1, dy = y2 - y1, t0 = 0, t1 = 1, p, q, t;
    var edges = [[-dx, x1 - r[0]], [dx, r[2] - x1], [-dy, y1 - r[1]], [dy, r[3] - y1]];
    for (var i = 0; i < 4; i++) {
      p = edges[i][0]; q = edges[i][1];
      if (Math.abs(p) < 1e-9) { if (q < 0) return false; continue; }
      t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }

  function pushOut(x, y, r, out) {
    var i, c, dl, dr, dtp, db, m;
    x = clamp(x, r, M.w - r);
    y = clamp(y, r, M.h - r);
    for (i = 0; i < M.covers.length; i++) {
      c = M.covers[i];
      if (x > c[0] - r && x < c[2] + r && y > c[1] - r && y < c[3] + r) {
        dl = Math.abs(x - (c[0] - r)); dr = Math.abs(c[2] + r - x);
        dtp = Math.abs(y - (c[1] - r)); db = Math.abs(c[3] + r - y);
        m = Math.min(dl, dr, dtp, db);
        if (m === dl) x = c[0] - r; else if (m === dr) x = c[2] + r;
        else if (m === dtp) y = c[1] - r; else y = c[3] + r;
      }
    }
    for (i = 0; i < g.walls.length; i++) {
      var w = g.walls[i];
      var x0 = w.cx - w.w / 2, x1 = w.cx + w.w / 2, y0 = w.cy - w.h / 2, y1 = w.cy + w.h / 2;
      if (x > x0 - r && x < x1 + r && y > y0 - r && y < y1 + r) {
        dl = Math.abs(x - (x0 - r)); dr = Math.abs(x1 + r - x);
        dtp = Math.abs(y - (y0 - r)); db = Math.abs(y1 + r - y);
        m = Math.min(dl, dr, dtp, db);
        if (m === dl) x = x0 - r; else if (m === dr) x = x1 + r;
        else if (m === dtp) y = y0 - r; else y = y1 + r;
      }
    }
    out.x = x; out.y = y;
  }

  var vpSmooth = null;
  function smoothVision(src) {
    if (!src || src.length < 3) { vpSmooth = null; return null; }
    if (!vpSmooth || vpSmooth.length !== src.length) {
      vpSmooth = [];
      for (var i = 0; i < src.length; i++) vpSmooth.push([src[i][0], src[i][1]]);
      return vpSmooth;
    }
    // 玩家瞬移（复活/被击退）时整体重置，避免雾被拉成一条线
    var jumpX = src[0][0] - vpSmooth[0][0];
    var jumpY = src[0][1] - vpSmooth[0][1];
    if (Math.abs(jumpX) + Math.abs(jumpY) > 160) {
      for (var q = 0; q < src.length; q++) { vpSmooth[q][0] = src[q][0]; vpSmooth[q][1] = src[q][1]; }
      return vpSmooth;
    }
    // 顶点 0（玩家自己）不平滑，否则雾会拖在身后
    vpSmooth[0][0] = src[0][0]; vpSmooth[0][1] = src[0][1];
    var k = 0.42;
    for (var j = 1; j < src.length; j++) {
      vpSmooth[j][0] += (src[j][0] - vpSmooth[j][0]) * k;
      vpSmooth[j][1] += (src[j][1] - vpSmooth[j][1]) * k;
    }
    return vpSmooth;
  }
  function drawFogOfWar() {
    if (player.revealT > 0) return;
    if (diagNoFog) return;
    var poly = smoothVision(g.vision[player.id]);
    var rearPoly = g.visionR && g.visionR[player.id];
    var hasPoly = poly && poly.length > 2;
    var hasRear = rearPoly && rearPoly.length > 2;

    // 不再用离屏画布 + 整屏贴图：直接一个 even-odd 路径填出"全屏减去视锥"
    if (hasPoly || hasRear) {
      ctx.save();
      ctx.translate(-cam.x, -cam.y);
      ctx.beginPath();
      ctx.rect(cam.x - 8, cam.y - 8, VW + 16, VH + 16);
      if (hasPoly) {
        ctx.moveTo(poly[0][0], poly[0][1]);
        for (var i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
        ctx.closePath();
      }
      if (hasRear) {
        ctx.moveTo(rearPoly[0][0], rearPoly[0][1]);
        for (var r = 1; r < rearPoly.length; r++) ctx.lineTo(rearPoly[r][0], rearPoly[r][1]);
        ctx.closePath();
      }
      ctx.fillStyle = 'rgba(5,7,11,0.72)';
      ctx.fill('evenodd');

      // 身周柔光
      var rg = ctx.createRadialGradient(player.x, player.y, 20, player.x, player.y, 150);
      rg.addColorStop(0, 'rgba(255,240,210,0.06)');
      rg.addColorStop(1, 'rgba(255,240,210,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(player.x, player.y, 150, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    if (hasPoly) {
      ctx.save();
      ctx.translate(-cam.x, -cam.y);
      ctx.beginPath();
      ctx.moveTo(poly[0][0], poly[0][1]);
      for (var j = 1; j < poly.length; j++) ctx.lineTo(poly[j][0], poly[j][1]);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,228,175,0.045)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,222,160,0.16)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(10,13,20,0.84)';
    roundRect(ctx, x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(70,82,110,0.8)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 10); ctx.stroke();
  }
  function bar(x, y, w, h, v, col) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, x, y, w, h, 4); ctx.fill();
    ctx.fillStyle = col;
    roundRect(ctx, x, y, Math.max(2, w * Math.min(1, Math.max(0, v))), h, 4); ctx.fill();
  }

  var KS_LABEL = { phase: '穿行', reveal: '全图视野', bomb: '空袭', fear: '无畏战士' };

  function drawHUD() {
    var tw = 340;
    ctx.fillStyle = 'rgba(10,13,20,0.8)';
    roundRect(ctx, VW / 2 - tw / 2, 12, tw, 46, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(70,82,110,0.8)';
    roundRect(ctx, VW / 2 - tw / 2, 12, tw, 46, 10); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = '600 25px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(90,230,210,0.95)';
    ctx.fillText(String(g.score[0]), VW / 2 - 68, 44);
    ctx.fillStyle = 'rgba(150,160,180,0.9)';
    ctx.font = '600 18px "Microsoft YaHei",sans-serif';
    ctx.fillText(':', VW / 2, 43);
    ctx.fillStyle = 'rgba(255,110,120,0.95)';
    ctx.font = '600 25px "Microsoft YaHei",sans-serif';
    ctx.fillText(String(g.score[1]), VW / 2 + 68, 44);
    ctx.fillStyle = 'rgba(130,142,165,0.85)';
    ctx.font = '11px "Microsoft YaHei",sans-serif';
    ctx.fillText(M.name + ' · 目标 ' + M.killTarget, VW / 2, 70);
    ctx.textAlign = 'left';

    // 击杀播报
    ctx.font = '13px "Microsoft YaHei",sans-serif';
    for (var i = 0; i < g.killLog.length; i++) {
      var kl = g.killLog[i];
      var txt = kl.killer + '  ▸  ' + kl.victim + '  (' + kl.how + ')';
      var w2 = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(ctx, 18, 18 + i * 24, w2 + 18, 21, 5); ctx.fill();
      ctx.fillStyle = kl.killer === player.name ? 'rgba(120,240,200,0.95)'
        : (kl.killer === '环境' ? 'rgba(220,200,120,0.95)' : 'rgba(255,140,140,0.95)');
      ctx.fillText(txt, 27, 33 + i * 24);
    }

    // 连杀 + 资金
    var sy = 196;
    ctx.fillStyle = 'rgba(10,13,20,0.8)';
    roundRect(ctx, 18, sy, 250, 66, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,210,120,0.95)';
    ctx.font = '600 13px "Microsoft YaHei",sans-serif';
    ctx.fillText('连杀 ' + player.streak, 30, sy + 20);
    ctx.fillStyle = 'rgba(60,255,150,0.98)';
    ctx.textAlign = 'right';
    ctx.fillText('¥' + Math.floor(player.money), 254, sy + 20);
    ctx.textAlign = 'left';
    var tiers = [5, 9, 13, 20];
    var nextT = tiers.filter(function (t) { return t > player.streak; })[0] || 20;
    ctx.fillStyle = 'rgba(140,152,175,0.9)';
    ctx.font = '11px "Microsoft YaHei",sans-serif';
    ctx.fillText('下个奖励 ' + nextT + ' 杀 · ' + ({ 5: '穿行', 9: '视野', 13: '空袭', 20: '无畏战士' }[nextT]), 30, sy + 38);
    bar(30, sy + 46, 224, 6, player.streak / nextT, 'rgba(255,200,110,0.85)');

    // 左下状态
    var px = 22, py = VH - 172;
    panel(px, py, 330, 150);
    ctx.fillStyle = 'rgba(230,238,250,0.9)';
    ctx.font = '600 12px "Microsoft YaHei",sans-serif';
    ctx.fillText('生命', px + 14, py + 22);
    var hbX = px + 52, hbY = py + 12, hbW = 172, hbH = 12;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, hbX, hbY, hbW, hbH, 4); ctx.fill();
    ctx.fillStyle = player.hp > player.maxHp * 0.4 ? 'rgba(110,225,150,0.95)' : 'rgba(255,90,90,0.95)';
    roundRect(ctx, hbX, hbY, hbW * Math.max(0, player.hp / player.maxHp), hbH, 4); ctx.fill();
    if (player.armorMax > 0) {
      ctx.fillStyle = 'rgba(90,140,215,1)';
      ctx.fillRect(hbX, hbY, hbW * Math.max(0, player.armor / player.armorMax), 6);
      ctx.strokeStyle = 'rgba(190,220,255,0.95)';
      ctx.lineWidth = 1;
      ctx.strokeRect(hbX + 0.5, hbY + 0.5, hbW - 1, 5);
    }
    if (player.shield > 0) {
      ctx.fillStyle = 'rgba(255,215,110,0.95)';
      ctx.fillRect(hbX, hbY + hbH - 4, hbW * Math.min(1, player.shield / 800), 4);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(200,210,228,0.9)';
    ctx.fillText(Math.ceil(player.hp) + (player.armorMax > 0 ? ' +' + Math.ceil(player.armor) : ''), px + 312, py + 22);
    ctx.textAlign = 'left';

    ctx.fillStyle = 'rgba(230,238,250,0.9)';
    ctx.fillText(EW.WEAPONS[player.weapon].name, px + 14, py + 44);
    ctx.fillStyle = 'rgba(150,162,185,0.95)';
    ctx.fillText(player.reloadT > 0 ? '换弹中…' : (player.mag + ' / ' + EW.WEAPONS[player.weapon].mag), px + 300, py + 44);

    if (player.fearT > 0) {
      ctx.fillStyle = 'rgba(255,160,90,0.98)';
      ctx.font = '700 12px "Microsoft YaHei",sans-serif';
      ctx.fillText('无畏 ' + player.fearT.toFixed(1) + 's', px + 228, py + 62);
    }

    // 体力
    ctx.fillStyle = 'rgba(160,220,255,0.85)';
    ctx.font = '11px "Microsoft YaHei",sans-serif';
    ctx.fillText('体力', px + 14, py + 62);
    bar(px + 52, py + 54, 160, 6, player.stamina / CFG.staminaMax,
      player.sprinting ? 'rgba(120,200,255,0.95)' : 'rgba(90,140,190,0.8)');

    var els = [['w', '潮湿'], ['f', '燃烧'], ['e', '触电']];
    for (var e = 0; e < 3; e++) {
      var key = els[e][0], col = ELEM_COLOR[key];
      var by = py + 74 + e * 22;
      ctx.fillStyle = rgba(col, 0.9);
      ctx.fillRect(px + 14, by, 8, 8);
      ctx.fillStyle = 'rgba(170,182,205,0.95)';
      ctx.font = '11px "Microsoft YaHei",sans-serif';
      ctx.fillText(els[e][1], px + 28, by + 8);
      bar(px + 66, by, 240, 8, player.status[key] / 100, rgba(col, 0.9));
      if (player.status[key] >= CFG.statusThreshold) {
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1;
        roundRect(ctx, px + 66, by, 240, 8, 4); ctx.stroke();
      }
    }

    // 道具
    var ix = VW / 2 - 200, iy = VH - 128;
    panel(ix, iy, 400, 106);
    ctx.fillStyle = 'rgba(180,192,215,0.9)';
    ctx.font = '600 11px "Microsoft YaHei",sans-serif';
    ctx.fillText('道具（CD 制）· ' + SD.keys.cycleItem.toUpperCase() + ' 切换 · 右键投掷选中', ix + 14, iy + 20);

    for (var s = 0; s < 2; s++) {
      var ek = player.items[s];
      var cx2 = ix + 58 + s * 170, cy2 = iy + 62;
      if (!ek) {
        ctx.strokeStyle = 'rgba(90,100,120,0.5)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(cx2, cy2, 23, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
      var cd = player.itemCd[ek] || 0;
      var total = CFG.itemCd * (EW.ITEMS[ek].cd / 8);
      var ready = cd <= 0;
      var col3 = ELEM_COLOR[ek];
      var selected = selItem === s;

      ctx.fillStyle = rgba(col3, ready ? 0.95 : 0.25);
      ctx.beginPath(); ctx.arc(cx2, cy2, 23, 0, Math.PI * 2); ctx.fill();
      if (selected) {
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx2, cy2, 27, 0, Math.PI * 2); ctx.stroke();
      }
      if (!ready) {
        ctx.strokeStyle = rgba(col3, 0.85);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx2, cy2, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cd / total));
        ctx.stroke();
      }
      ctx.fillStyle = ready ? 'rgba(16,20,28,0.95)' : 'rgba(220,228,242,0.85)';
      ctx.font = '600 13px "Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ELEM_NAME[ek], cx2, cy2 + 5);
      ctx.textAlign = 'left';

      ctx.fillStyle = ready ? 'rgba(235,242,252,0.95)' : 'rgba(140,152,175,0.9)';
      ctx.font = '600 11px "Microsoft YaHei",sans-serif';
      ctx.fillText(EW.ITEMS[ek].name, cx2 + 36, cy2 - 4);
      ctx.fillStyle = 'rgba(150,162,185,0.9)';
      ctx.fillText(ready ? (s === 0 ? SD.keys.item1 : SD.keys.item2).toUpperCase() + ' 就绪' : cd.toFixed(1) + 's', cx2 + 36, cy2 + 12);
    }

    // 连杀技能
    if (player.ksItem) {
      var label = KS_LABEL[player.ksItem] || player.ksItem;
      ctx.fillStyle = 'rgba(10,13,20,0.9)';
      roundRect(ctx, VW / 2 - 130, VH - 182, 260, 40, 9); ctx.fill();
      ctx.strokeStyle = 'rgba(255,210,120,0.9)';
      roundRect(ctx, VW / 2 - 130, VH - 182, 260, 40, 9); ctx.stroke();
      ctx.fillStyle = 'rgba(255,225,150,0.98)';
      ctx.font = '600 14px "Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('按 ' + SD.keys.ks.toUpperCase() + ' 释放『' + label + '』', VW / 2, VH - 156);
      ctx.textAlign = 'left';
    }
    if (player.revealT > 0) {
      ctx.fillStyle = 'rgba(120,200,255,0.95)';
      ctx.font = '600 13px "Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('全图视野 ' + player.revealT.toFixed(1) + 's', VW / 2, 96);
      ctx.textAlign = 'left';
    }
    if (player.phaseT > 0) {
      ctx.fillStyle = 'rgba(150,220,255,0.95)';
      ctx.font = '600 13px "Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('穿行 ' + player.phaseT.toFixed(1) + 's（子弹仍会被墙挡住）', VW / 2, 116);
      ctx.textAlign = 'left';
    }

    // 右上提示
    ctx.fillStyle = 'rgba(150,162,185,0.75)';
    ctx.font = '11px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Tab 战绩 · ' + SD.keys.pause.toUpperCase() + ' 暂停 · F2 调参 · M 静音', VW - 20, 24);
    ctx.textAlign = 'left';

    // 详细信息
    if (SD.showInfo) {
      ctx.fillStyle = 'rgba(10,13,20,0.75)';
      roundRect(ctx, VW - 190, 34, 170, 52, 8); ctx.fill();
      ctx.fillStyle = 'rgba(140,230,200,0.95)';
      ctx.font = '600 12px Consolas,monospace';
      ctx.fillText('FPS  ' + Math.round(fpsAvg), VW - 178, 54);
      ctx.fillStyle = 'rgba(180,200,230,0.95)';
      ctx.fillText('渲染 ' + renderMs.toFixed(1) + 'ms  最坏帧 ' + Math.round(frameJitter) + 'ms', VW - 178, 74);
    }
    if (fatalMsg) {
      ctx.fillStyle = 'rgba(120,20,26,0.88)';
      roundRect(ctx, 16, VH - 76, Math.min(VW - 32, 760), 52, 8); ctx.fill();
      ctx.fillStyle = 'rgba(255,214,214,0.98)';
      ctx.font = '12px Consolas,monospace';
      ctx.fillText('渲染异常 x' + fatalCount + ': ' + fatalMsg.slice(0, 96), 28, VH - 52);
      ctx.fillStyle = 'rgba(255,180,180,0.8)';
      ctx.fillText('（已跳过该帧，游戏继续运行；请把这行报给开发者）', 28, VH - 34);
    }

    if (debugOn) {
      var lines = [
        '对局时间 ' + g.t.toFixed(1) + 's',
        '蒸发 ' + g.stats.vapor + ' 超载 ' + g.stats.overload + ' 感电 ' + g.stats.shock + ' 三相 ' + g.stats.tri,
        '区域 ' + g.zones.length + ' 雾 ' + g.fogs.length + ' 墙 ' + g.walls.length,
        '存活 ' + g.units.filter(function (u) { return u.alive; }).length + ' / ' + g.units.length
      ];
      ctx.fillStyle = 'rgba(10,13,20,0.8)';
      roundRect(ctx, 18, 270, 250, 76, 8); ctx.fill();
      ctx.fillStyle = 'rgba(170,185,210,0.95)';
      ctx.font = '11px Consolas,monospace';
      for (var li = 0; li < lines.length; li++) ctx.fillText(lines[li], 30, 288 + li * 16);
    }

    if (player.alive && !player.outSpawn) {
      ctx.fillStyle = 'rgba(120,230,210,0.75)';
      ctx.font = '12px "Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('出生房间内 · ' + SD.keys.loadout.toUpperCase() + ' 改配装 · ' +
        SD.keys.shop.toUpperCase() + ' 开商店 · 离开即锁定', VW / 2, VH - 206);
      ctx.textAlign = 'left';
    }

    if (toast.t > 0) {
      ctx.globalAlpha = Math.min(1, toast.t);
      ctx.font = '600 13px "Microsoft YaHei",sans-serif';
      var ttw = ctx.measureText(toast.text).width;
      ctx.fillStyle = 'rgba(10,13,20,0.9)';
      roundRect(ctx, VW / 2 - ttw / 2 - 16, VH - 262, ttw + 32, 34, 8); ctx.fill();
      ctx.fillStyle = 'rgba(255,220,160,0.98)';
      ctx.textAlign = 'center';
      ctx.fillText(toast.text, VW / 2, VH - 240);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    // 准星 + 换弹环形读条
    var cxr = mouse.sx, cyr = mouse.sy;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cxr, cyr, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cxr - 15, cyr); ctx.lineTo(cxr - 5, cyr);
    ctx.moveTo(cxr + 5, cyr); ctx.lineTo(cxr + 15, cyr);
    ctx.moveTo(cxr, cyr - 15); ctx.lineTo(cxr, cyr - 5);
    ctx.moveTo(cxr, cyr + 5); ctx.lineTo(cxr, cyr + 15);
    ctx.stroke();
    var ac = ELEM_COLOR[player.ammoElem];
    ctx.strokeStyle = rgba(ac, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cxr, cyr, 13, 0, Math.PI * 2); ctx.stroke();

    if (player.reloadT > 0) {
      var w = EW.WEAPONS[player.weapon];
      var pr2 = 1 - player.reloadT / w.reload;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(cxr, cyr, 21, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,230,255,0.95)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cxr, cyr, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr2); ctx.stroke();
      ctx.fillStyle = 'rgba(180,230,255,0.95)';
      ctx.font = '600 11px "Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(player.reloadT.toFixed(1) + 's', cxr, cyr + 36);
      ctx.textAlign = 'left';
    }

    if (!player.alive && g.winner < 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = 'rgba(255,110,110,0.95)';
      ctx.font = '600 42px "Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('阵亡', VW / 2, VH / 2 - 10);
      ctx.fillStyle = 'rgba(220,228,242,0.9)';
      ctx.font = '16px "Microsoft YaHei",sans-serif';
      ctx.fillText(Math.ceil(Math.max(0, player.respawnT)) + ' 秒后重生（连杀已清零，技能保留）', VW / 2, VH / 2 + 28);
      ctx.textAlign = 'left';
    }

    var el2 = (performance.now() - startT) / 1000;
    if (el2 < 8) {
      var a2 = el2 > 5 ? (8 - el2) / 3 : 1;
      ctx.globalAlpha = a2;
      ctx.fillStyle = 'rgba(10,13,20,0.82)';
      roundRect(ctx, VW / 2 - 340, 100, 680, 66, 12); ctx.fill();
      ctx.fillStyle = 'rgba(235,242,252,0.95)';
      ctx.font = '600 16px "Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(M.name + ' · 目标 ' + M.killTarget + ' 人头 · 手枪开局，击杀赚 300/500 到商店解锁武器', VW / 2, 126);
      ctx.font = '12px "Microsoft YaHei",sans-serif';
      ctx.fillStyle = 'rgba(170,182,205,0.95)';
      ctx.fillText('WASD 移动 · 左键射击 · R 换弹 · Shift 疾跑 · G/H 投掷 · 右键投掷选中 · Q 切换道具 · V 技能', VW / 2, 150);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }

  // ---------------- 战绩 ----------------
  function boardRows() {
    // 联机：以服务端下发的 board 为准（包含全部玩家和 AI）
    if (netActive && g.board && g.board.length) {
      var live = {};
      for (var i = 0; i < g.units.length; i++) live[g.units[i].id] = g.units[i];
      return g.board.map(function (b) {
        var u = live[b.id];
        return {
          id: b.id, team: b.tm, name: b.n,
          kills: b.k | 0, deaths: b.d | 0, dmg: b.dm || 0, streak: b.sk || 0,
          money: b.mo, isPlayer: b.id === Net.myId,
          alive: !!b.al, weapon: b.wp,
          ammoElem: u ? u.ammoElem : null,
          status: u ? u.status : { w: 0, f: 0, e: 0 },
          phaseT: u ? u.phaseT : 0
        };
      });
    }
    return g.units;
  }

  function drawScoreboard() {
    if (!showScore) return;
    ctx.fillStyle = 'rgba(4,6,10,0.86)';
    ctx.fillRect(0, 0, VW, VH);

    var list = boardRows();
    var rows = Math.max(1, list.length / 2);
    var w = 940, h = 160 + rows * 30 * 2 + 40, x = (VW - w) / 2, y = (VH - h) / 2;
    panel(x, y, w, h);
    ctx.fillStyle = 'rgba(235,242,252,0.95)';
    ctx.font = '600 20px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('战绩  ' + g.score[0] + ' : ' + g.score[1] + '   目标 ' + M.killTarget, VW / 2, y + 34);
    ctx.textAlign = 'left';

    var cols = [x + 30, x + 200, x + 270, x + 340, x + 440, x + 530, x + 640, x + 790];
    ctx.font = '600 12px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(140,152,175,0.9)';
    ['玩家', '击杀', '死亡', '伤害', '连杀', '资金', '状态', '配装'].forEach(function (t, i) {
      ctx.fillText(t, cols[i], y + 66);
    });

    function row(u, ry, teamCol) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      roundRect(ctx, x + 18, ry - 16, w - 36, 26, 5); ctx.fill();
      ctx.fillStyle = teamCol;
      ctx.fillRect(x + 22, ry - 13, 4, 20);
      ctx.fillStyle = u.isPlayer ? 'rgba(255,255,255,0.98)' : 'rgba(210,220,236,0.9)';
      ctx.font = '13px "Microsoft YaHei",sans-serif';
      ctx.fillText(u.name || 'AI', cols[0] + 10, ry + 3);
      ctx.fillStyle = 'rgba(210,220,236,0.9)';
      ctx.fillText(String(u.kills || 0), cols[1], ry + 3);
      ctx.fillText(String(u.deaths || 0), cols[2], ry + 3);
      ctx.fillText(String(Math.round(u.dmg || 0)), cols[3], ry + 3);
      ctx.fillStyle = (u.streak || 0) >= 5 ? 'rgba(255,210,120,0.95)' : 'rgba(210,220,236,0.9)';
      ctx.fillText(String(u.streak || 0), cols[4], ry + 3);
      ctx.fillStyle = 'rgba(255,207,107,0.9)';
      ctx.fillText(u.money === undefined ? '—' : String(Math.floor(u.money)), cols[5], ry + 3);
      ctx.fillStyle = 'rgba(210,220,236,0.9)';
      var st = [];
      if (u.status && u.status.w >= CFG.statusThreshold) st.push('潮湿');
      if (u.status && u.status.f >= CFG.statusThreshold) st.push('燃烧');
      if (u.status && u.status.e >= CFG.statusThreshold) st.push('触电');
      if (u.phaseT > 0) st.push('穿行');
      if (!u.alive) st.push('阵亡');
      ctx.fillText(st.join(' ') || '—', cols[6], ry + 3);
      var wn = EW.WEAPONS[u.weapon] ? EW.WEAPONS[u.weapon].name : '—';
      ctx.fillText(wn + (u.ammoElem ? '·' + ELEM_NAME[u.ammoElem] : ''), cols[7], ry + 3);
    }

    var ry = y + 100;
    list.filter(function (u) { return u.team === 0; }).forEach(function (u) {
      row(u, ry, 'rgba(90,230,210,0.95)'); ry += 30;
    });
    ry += 14;
    ctx.fillStyle = 'rgba(140,152,175,0.5)';
    ctx.fillRect(x + 18, ry - 20, w - 36, 1);
    ry += 12;
    list.filter(function (u) { return u.team === 1; }).forEach(function (u) {
      row(u, ry, 'rgba(255,110,120,0.95)'); ry += 30;
    });
  }

  // ---------------- 调试面板 ----------------
  var debugOn = false, debugEl = null;
  var DEFAULTS_CFG = JSON.parse(JSON.stringify(CFG));
  var SLIDERS = [
    ['unitHp', '最大生命', 40, 400, 10], ['unitSpeed', '移动速度', 60, 400, 5],
    ['dmgMult', '全局伤害倍率', 0.2, 4, 0.1], ['theta', '浓度阈值', 5, 80, 1],
    ['zoneR', '手雷区域半径', 60, 400, 5], ['zoneFuel', '区域燃料', 20, 400, 5],
    ['zoneDecay', '区域自然衰减', 0, 60, 0.5], ['statusGain', '区域附着/秒', 0, 150, 1],
    ['statusThreshold', '附着触发阈值', 10, 90, 1], ['bulletStatus', '子弹附着', 0, 80, 1],
    ['fogDur', '雾持续时间', 0.5, 12, 0.1], ['visionRange', '视野距离', 200, 1100, 10],
    ['itemCd', '道具基础 CD', 1, 25, 0.5], ['respawn', '复活时间', 1, 12, 0.5],
    ['spawnProt', '出生保护', 0, 15, 0.5], ['aiErr', 'AI 瞄准误差', 0, 0.4, 0.01],
    ['streakBombR', '空袭半径', 80, 500, 10], ['shockStun', '麻痹时长', 0, 1.5, 0.02],
    ['shockCd', '麻痹冷却', 0, 4, 0.1], ['talentCost', '天赋价格', 200, 4000, 50]
  ];

  function buildDebug() {
    debugEl = document.createElement('div');
    debugEl.style.cssText = [
      'position:fixed', 'right:10px', 'top:10px', 'width:290px', 'max-height:92vh',
      'overflow-y:auto', 'background:rgba(10,13,20,.94)', 'color:#dfe6f2',
      'font:12px/1.5 "Microsoft YaHei",sans-serif', 'padding:12px',
      'border:1px solid #2a3242', 'border-radius:10px', 'display:none',
      'z-index:50', 'box-shadow:0 12px 40px rgba(0,0,0,.6)'
    ].join(';');
    var head = document.createElement('div');
    head.style.cssText = 'font-weight:700;font-size:13px;margin-bottom:8px;color:#8fe3d4';
    head.textContent = '调试参数（F2 关闭）';
    debugEl.appendChild(head);
    SLIDERS.forEach(function (s) {
      var key = s[0], label = s[1], min = s[2], max = s[3], step = s[4];
      var row = document.createElement('div');
      row.style.cssText = 'margin:7px 0';
      var lab = document.createElement('div');
      lab.style.cssText = 'display:flex;justify-content:space-between;color:#a8b4c8';
      var n = document.createElement('span'); n.textContent = label;
      var v = document.createElement('span');
      v.style.cssText = 'color:#ffd88a;font-weight:600'; v.textContent = CFG[key];
      lab.appendChild(n); lab.appendChild(v);
      var input = document.createElement('input');
      input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = CFG[key];
      input.style.cssText = 'width:100%;accent-color:#5ad2c0;margin-top:2px';
      input.addEventListener('input', function () {
        CFG[key] = parseFloat(input.value);
        v.textContent = input.value;
        if (key === 'unitHp' && g) g.units.forEach(function (u) { u.maxHp = CFG.unitHp; if (u.hp > u.maxHp) u.hp = u.maxHp; });
      });
      row.appendChild(lab); row.appendChild(input);
      debugEl.appendChild(row);
    });
    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:8px;margin-top:10px';
    var b1 = document.createElement('button');
    b1.textContent = '恢复默认';
    b1.style.cssText = 'flex:1;padding:6px;background:#1c2434;color:#cfd8e8;border:1px solid #2f3a4e;border-radius:6px;cursor:pointer';
    b1.onclick = function () {
      Object.keys(DEFAULTS_CFG).forEach(function (k) { CFG[k] = DEFAULTS_CFG[k]; });
      if (g) g.units.forEach(function (u) { u.maxHp = CFG.unitHp; if (u.hp > u.maxHp) u.hp = u.maxHp; });
      debugEl.remove(); debugEl = null; debugOn = true; toggleDebug();
    };
    var b2 = document.createElement('button');
    b2.textContent = '关闭';
    b2.style.cssText = b1.style.cssText;
    b2.onclick = function () { debugEl.style.display = 'none'; debugOn = false; };
    btns.appendChild(b1); btns.appendChild(b2);
    debugEl.appendChild(btns);
    document.body.appendChild(debugEl);
  }

  function toggleDebug() {
    if (!debugEl) buildDebug();
    debugOn = !debugOn;
    debugEl.style.display = debugOn ? 'block' : 'none';
  }

  // ---------------- 靶场面板 ----------------
  var rangeEl = null, rangeOn = false;

  function buildRangePanel() {
    rangeEl = document.createElement('div');
    rangeEl.style.cssText = [
      'position:fixed', 'left:10px', 'top:120px', 'width:260px',
      'background:rgba(10,13,20,.94)', 'color:#dfe6f2',
      'font:12px/1.5 "Microsoft YaHei",sans-serif', 'padding:12px',
      'border:1px solid #2a3242', 'border-radius:10px', 'display:none',
      'z-index:50', 'box-shadow:0 12px 40px rgba(0,0,0,.6)'
    ].join(';');

    function slider(label, min, max, step, get, set) {
      var row = document.createElement('div');
      row.style.cssText = 'margin:8px 0';
      var lab = document.createElement('div');
      lab.style.cssText = 'display:flex;justify-content:space-between;color:#a8b4c8';
      var n = document.createElement('span'); n.textContent = label;
      var v = document.createElement('span');
      v.style.cssText = 'color:#ffd88a;font-weight:600';
      lab.appendChild(n); lab.appendChild(v);
      var inp = document.createElement('input');
      inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
      inp.style.cssText = 'width:100%;accent-color:#ff9a5c;margin-top:2px';
      function sync() { v.textContent = get(); inp.value = get(); }
      inp.addEventListener('input', function () { set(parseFloat(inp.value)); v.textContent = get(); });
      row.appendChild(lab); row.appendChild(inp);
      row._sync = sync;
      return row;
    }

    var head = document.createElement('div');
    head.style.cssText = 'font-weight:700;font-size:13px;margin-bottom:6px;color:#ffb06b';
    head.textContent = '靶场控制（F3 关闭）';
    rangeEl.appendChild(head);

    var rows = [];
    rows.push(slider('靶子距离', 120, 1200, 10,
      function () { return g && g.dummy ? Math.round(g.dummy.x - player.x) : 0; },
      function (v) { if (g && g.dummy) g.dummy.x = player.x + v; }));
    rows.push(slider('靶子高低（Y 偏移）', -400, 400, 10,
      function () { return g && g.dummy ? Math.round(g.dummy.y - player.y) : 0; },
      function (v) { if (g && g.dummy) g.dummy.y = player.y + v; }));
    rows.push(slider('靶子护甲', 0, 300, 10,
      function () { return g && g.dummy ? Math.round(g.dummy.armor) : 0; },
      function (v) { if (g && g.dummy) { g.dummy.armorMax = v; g.dummy.armor = v; } }));
    rows.push(slider('靶子生命上限', 500, 20000, 500,
      function () { return g && g.dummy ? Math.round(g.dummy.maxHp) : 0; },
      function (v) { if (g && g.dummy) { g.dummy.maxHp = v; g.dummy.hp = v; } }));

    rows.forEach(function (r) {
      rangeEl.appendChild(r);
      var b = document.createElement('button');
      b.textContent = '应用';
      b.style.cssText = 'width:100%;margin:-4px 0 8px;padding:4px;background:#1c2434;color:#cfd8e8;border:1px solid #2f3a4e;border-radius:6px;cursor:pointer;font-size:11px';
      b.onclick = function () { if (r._sync) r._sync(); };
      rangeEl.appendChild(b);
    });

    var reset = document.createElement('button');
    reset.textContent = '重置靶子（满血 + 归位）';
    reset.style.cssText = 'width:100%;padding:7px;background:linear-gradient(180deg,#7a4a2a,#5a3520);color:#ffdcc0;border:1px solid #a06a3c;border-radius:6px;cursor:pointer;font-size:12px';
    reset.onclick = function () {
      if (!g || !g.dummy) return;
      var d = g.dummy;
      d.alive = true; d.hp = d.maxHp; d.armor = d.armorMax;
      d.x = player.x + 400;
      d.y = player.y;
      d.status.w = d.status.f = d.status.e = 0;
      rows.forEach(function (r) { if (r._sync) r._sync(); });
    };
    rangeEl.appendChild(reset);

    var stat = document.createElement('div');
    stat.style.cssText = 'margin-top:8px;color:#8fe3d4;font-size:11px';
    stat.textContent = '提示：伤害数字会显示在准星右侧';
    rangeEl.appendChild(stat);

    document.body.appendChild(rangeEl);
  }

  function toggleRange() {
    if (mode !== 'range' || !g) { toastMsg('只有在靶场才能打开调试靶子'); return; }
    if (!rangeEl) buildRangePanel();
    rangeOn = !rangeOn;
    rangeEl.style.display = rangeOn ? 'block' : 'none';
    if (rangeOn) {
      var rows = rangeEl.querySelectorAll('input[type=range]');
      // 同步一次当前值
      rangeEl.querySelectorAll('button').forEach(function (b) {
        if (b.textContent === '应用') b.click();
      });
    }
  }

  // ---------------- 联机 ----------------
  var netActive = false, netPred = { x: 0, y: 0 }, netPush = { x: 0, y: 0 }, netReady = false, netBakeT = 0;
  var netPendingItem = null;
  var netBuf = [];
  var netSnapPending = null;
  var autoReady = new URLSearchParams(location.search).get('ready') === '1';
  var autoReadyDone = false;
  var applyMs = 0, parseMs = 0, netMs = 0;

  function netCmd(o) {
    if (!netActive) return false;
    var m = { t: 'cmd', cmd: o.cmd };
    if (o.kind) m.kind = o.kind;
    if (o.key) m.key = o.key;
    if (o.dat) m.dat = o.dat;
    if (o.x !== undefined) { m.x = o.x; m.y = o.y; }
    Net.send(m);
    return true;
  }

  function startNet(opts) {
    mode = opts.mode || 'small';
    g = EW.createGame(mode);
    player = g.player;
    M = g.map;
    g.inputs[player.id] = { mx: 0, my: 0, aim: 0, shoot: false, throwElem: null };
    centerCam();
    startT = performance.now();
    netActive = true; netReady = false;
    toast = { text: '连接中…', t: 3 };
    setState('play');
    if (!window.Net) return;
    Net.connect({
      mode: mode, room: opts.room, name: opts.name,
      handlers: {
        onJoined: function (m) {
          if (m.mode && m.mode !== mode && EW.MAPS[m.mode]) {
            mode = m.mode;
            g = EW.createGame(mode);
            player = g.player;
            M = g.map;
            g.inputs[player.id] = { mx: 0, my: 0, aim: 0, shoot: false, throwElem: null };
            centerCam();
            netReady = false;
          }
          var u = g.units.filter(function (x) { return x.id === m.id; })[0];
          if (u) { player = u; g.player = u; }
          player.team = m.team;
          renderLobby({ code: m.code });
          showLobby(true);
        },
        onLobby: function (m) {
          renderLobby(m); showLobby(true);
          if (autoReady && !autoReadyDone && Net.mySlot >= 0) { autoReadyDone = true; setTimeout(function () { Net.ready(); }, 250); }
        },
        onStart: function (m) {
          if (m && m.you != null && m.you >= 0) Net.myId = m.you;
          if (m && m.team != null) player.team = m.team;
          var u = g.units.filter(function (x) { return x.id === Net.myId; })[0];
          if (u) { player = u; g.player = u; }
          showLobby(false);
          stopRoomPoll();
          ui.classList.add('hidden');
          toastMsg('对局开始');
        },
        onSnap: function (s) { netSnapPending = s; },
        onEnd: function (m) {
          netActive = false;
          elEndTitle.textContent = (m.winner === player.team) ? '胜利' : '失败';
          elEndTitle.style.color = (m.winner === player.team) ? '#5ee6cf' : '#ff6b74';
          elEndScore.textContent = m.score[0] + ' : ' + m.score[1] + '　' + M.name;
          ui.classList.remove('hidden');
          PANELS.forEach(function (p) { show(p, p === elEnd); });
          state = 'end';
        },
        onError: function (msg) { toastMsg(msg); },
        onToast: function (t) { toastMsg(t.msg); },
        onKicked: function () { netActive = false; showLobby(false); toastMsg('你被房主移出了房间'); setState('menu'); },
        onClose: function () {
          if (!netActive) return;
          netActive = false;
          toastMsg('与服务器断开');
          setState('menu');
        }
      }
    });
  }

  function applySnap(s) {
    if (!g) return;
    lastSnapWall = performance.now();
    netWarned = false;
    if (s.you && s.you.id !== undefined && Net.myId !== s.you.id) Net.myId = s.you.id;
    if (s.you) {
      if (!netReady) { netPred.x = s.you.x; netPred.y = s.you.y; netReady = true; }
      else {
        // 标准预测回滚：从服务器位置出发，重放所有未确认输入
        // 这样不再需要"每帧往回拉"，也就没有橡皮筋抖动
        if (s.you.ack !== undefined) {
          while (netBuf.length && netBuf[0].seq <= s.you.ack) netBuf.shift();
          netPred.x = s.you.x;
          netPred.y = s.you.y;
          for (var ri = 0; ri < netBuf.length; ri++) {
            var rb = netBuf[ri];
            var rsp = CFG.unitSpeed * (rb.sp ? CFG.sprintMul : 1);
            netPred.x += rb.mx * rsp / 30;
            netPred.y += rb.my * rsp / 30;
            netPush.x = netPred.x; netPush.y = netPred.y;
            pushOut(netPred.x, netPred.y, player.r || 13, netPush);
            netPred.x = netPush.x; netPred.y = netPush.y;
          }
          if (player.alive) { player.x = netPred.x; player.y = netPred.y; }
        } else {
          var dx = netPred.x - s.you.x, dy = netPred.y - s.you.y;
          var err = Math.sqrt(dx * dx + dy * dy);
          if (err > 60 || (err > 6 && segBlocked(netPred.x, netPred.y, s.you.x, s.you.y))) {
            netPred.x = s.you.x; netPred.y = s.you.y;
          } else if (err > 5) { netPred.x += dx * -0.22; netPred.y += dy * -0.22; }
        }
      }
      player.hp = s.you.hp;
      player.armor = s.you.armor;
      player.shield = s.you.shield;
      player.mag = s.you.mag;
      player.reloadT = s.you.reloadT;
      player.money = s.you.money;
      player.streak = s.you.streak;
      player.ksItem = s.you.ksItem;
      player.fearT = s.you.fearT;
      player.revealT = s.you.revealT;
      player.stamina = s.you.stamina;
      if (s.you.itemCd) player.itemCd = s.you.itemCd;
      if (s.you.items) player.items = s.you.items;
      if (s.you.unlocked) g.unlocked = s.you.unlocked;
      if (s.you.talents) player.talents = s.you.talents;
      if (s.you.weapon) player.weapon = s.you.weapon;
      if (s.you.ammoElem) player.ammoElem = s.you.ammoElem;
      if (s.you.maxHp) { player.maxHp = s.you.maxHp; }
      player.alive = s.you.alive !== false;
      player.respawnT = s.you.respawnT || 0;
    }

    var byId = {};
    for (var i = 0; i < g.units.length; i++) byId[g.units[i].id] = g.units[i];
    var meRef = byId[Net.myId] || player;
    var arr = [];
    (s.units || []).forEach(function (su) {
      var u = byId[su.id];
      if (!u) {
        u = {
          id: su.id, r: 13, status: { w: 0, f: 0, e: 0 }, alive: true, maxHp: 200,
          armor: 0, armorMax: 0, shield: 0, stun: 0, phaseT: 0, fearT: 0, revealT: 0,
          x: su.x, y: su.y, aim: su.a || 0,
          items: ['w', 'f'], itemCd: { w: 0, f: 0, e: 0, d: 0 },
          talents: {}, unlocked: { pistol: true }, money: 0, streak: 0, ksItem: null,
          stamina: 100, weapon: 'pistol', ammoElem: 'w', mag: 0, reloadT: 0,
          respawnT: 0, dmg: 0, kills: 0, deaths: 0, slowT: 0, outSpawn: false,
          isPlayer: false, name: su.n || 'AI'
        };
      }
      u.team = su.tm;
      u.name = su.n;
      u.weapon = su.wp;
      u.tx = su.x; u.ty = su.y;
      u.aim = su.a;
      u.hp = su.hp;
      u.armor = su.ar;
      u.armorMax = su.ar > 0 ? Math.max(u.armorMax || 0, su.ar) : 0;
      if (su.st) { u.status.w = su.st[0]; u.status.f = su.st[1]; u.status.e = su.st[2]; }
      u.alive = true;
      arr.push(u);
    });
    g.units = arr;
    var meNow = null;
    for (var k = 0; k < arr.length; k++) { if (arr[k].id === Net.myId) { meNow = arr[k]; break; } }
    if (meNow) { player = meNow; g.player = meNow; } else { player = meRef; }

    g.zones = (s.zones || []).map(function (z) { return { elem: z.e, x: z.x, y: z.y, r: z.r, fuel: z.f, maxFuel: CFG.zoneFuel }; });
    g.walls = (s.walls || []).map(function (w) {
      return {
        cx: w.x, cy: w.y, w: w.w, h: w.h, hp: w.hp,
        rect: [w.x - w.w / 2, w.y - w.h / 2, w.x + w.w / 2, w.y + w.h / 2], mudR: CFG.mudR
      };
    });
    g.barrels = (s.barrels || []).map(function (b) { return { x: b.x, y: b.y, hp: b.hp, maxHp: 80, alive: b.hp > 0 }; });
    g.bullets = (s.bullets || []).map(function (b) {
      return { x: b.x, y: b.y, vx: b.vx, vy: b.vy, elem: b.e, life: 1 };
    });
    var oldGr = {};
    for (var gi = 0; gi < g.grenades.length; gi++) {
      var og = g.grenades[gi];
      oldGr[Math.round(og.tx) + ':' + Math.round(og.ty)] = og;
    }
    g.grenades = (s.grenades || []).map(function (gr) {
      var key = Math.round(gr.tx) + ':' + Math.round(gr.ty);
      var prev = oldGr[key];
      var dist = Math.sqrt(Math.pow(gr.tx - gr.x, 2) + Math.pow(gr.ty - gr.y, 2));
      var dur = 0.5 + dist / 1400;
      var t = gr.p;
      // 本地已经推进得差不多就沿用本地的，避免 15Hz 回跳
      if (prev && Math.abs(prev.t - t) < 0.2) t = Math.max(prev.t, t);
      return {
        x: gr.x, y: gr.y, tx: gr.tx, ty: gr.ty, elem: gr.e,
        t: t, dur: dur, bomb: gr.bomb,
        px: gr.x, py: gr.y
      };
    });
    g.fogs = (s.fogs || []).map(function (f) { return { x: f.x, y: f.y, r: f.r, life: f.l, maxLife: f.m }; });
    g.traps = (s.traps || []).map(function (t) { return { x: t.x, y: t.y, r: t.r, life: t.l, maxLife: t.m }; });
    if (s.board) g.board = s.board;
    if (s.score) g.score = s.score;

    (s.events || []).forEach(function (ev) {
      if (ev.t === 'dmg') addDmg(ev);
      else if (ev.t === 'killfx') addKillFx(ev);
      if (ev.x !== undefined) spawnFxFromEvent(ev);
      if (SFX && ev.t !== 'killfx') SFX.play(ev);
    });
  }

  function spawnFxFromEvent(ev) {
    if (!g) return;
    var f = null;
    if (ev.t === 'boom') f = { type: 'boom', r: (ev.size === 2 ? 240 : 90), life: 0.45 };
    else if (ev.t === 'vapor') f = { type: 'vapor', r: 70, life: 0.55 };
    else if (ev.t === 'shock') f = { type: 'shock', r: 70, life: 0.45 };
    else if (ev.t === 'tri') f = { type: 'tri', r: 100, life: 0.8 };
    else if (ev.t === 'hit') f = { type: 'spark', r: 20, life: 0.22, elem: ev.elem };
    else if (ev.t === 'land') f = { type: 'land', r: 60, life: 0.45, elem: ev.elem };
    else if (ev.t === 'heal' || ev.t === 'phase') f = { type: 'heal', r: 50, life: 0.6 };
    if (!f) return;
    f.x = ev.x; f.y = ev.y; f.max = f.life;
    if (g.fx.length > 120) g.fx.shift();
    g.fx.push(f);
  }

  function netFrame(dt) {
    if (!window.Net) return;
    // 把快照应用固定在帧的开头
    if (netSnapPending) {
      var _a0 = performance.now();
      applySnap(netSnapPending);
      applyMs = applyMs * 0.9 + (performance.now() - _a0) * 0.1;
      netSnapPending = null;
    }
    var mvx = 0, mvy = 0;
    if (keys['a']) mvx -= 1;
    if (keys['d']) mvx += 1;
    if (keys['w']) mvy -= 1;
    if (keys['s']) mvy += 1;
    var len = Math.sqrt(mvx * mvx + mvy * mvy);
    if (len > 1) { mvx /= len; mvy /= len; }

    if (!g.inputs[player.id]) {
      g.inputs[player.id] = { mx: 0, my: 0, aim: 0, shoot: false, throwElem: null };
    }
    var inp = g.inputs[player.id];
    inp.mx = mvx; inp.my = mvy;
    inp.aim = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    inp.shoot = mouse.down && player.alive;
    inp.sprint = !!keys[SD.keys.sprint];

    if (player.alive && netReady) {
      // 体力不足时必须降速，否则预测速度和服务端不一致 → 持续抖动
      var canSprint = inp.sprint && (player.stamina === undefined || player.stamina > 1);
      var sp = CFG.unitSpeed * (canSprint ? CFG.sprintMul : 1);
      netPred.x += mvx * sp * dt;
      netPred.y += mvy * sp * dt;
      // 预测也要做碰撞，否则会穿进墙里再被服务器拽回来 → 鬼畜
      netPush.x = netPred.x; netPush.y = netPred.y;
      pushOut(netPred.x, netPred.y, player.r || 13, netPush);
      netPred.x = netPush.x; netPred.y = netPush.y;
      player.x = netPred.x;
      player.y = netPred.y;
      var sp2 = Math.sqrt(mvx * mvx + mvy * mvy) * sp;
      speedAvg = speedAvg * 0.9 + sp2 * 0.1;
    }

    for (var i = 0; i < g.units.length; i++) {
      var u = g.units[i];
      if (u.id === Net.myId) { u.x = player.x; u.y = player.y; continue; }
      if (u.tx === undefined) continue;
      u.x += (u.tx - u.x) * Math.min(1, dt * 22);
      u.y += (u.ty - u.y) * Math.min(1, dt * 22);
    }

    // 手雷进度本地推进（服务端 15Hz，否则抛物线一跳一跳）
    for (var gn = 0; gn < g.grenades.length; gn++) {
      var gg2 = g.grenades[gn];
      if (!(gg2.dur > 0)) gg2.dur = 1;
      gg2.t = Math.min(gg2.dur, gg2.t + dt);
      var prog = gg2.t / gg2.dur;
      if (gg2.px !== undefined) {
        gg2.x = gg2.px + (gg2.tx - gg2.px) * prog;
        gg2.y = gg2.py + (gg2.ty - gg2.py) * prog;
      }
    }

    // 本地特效衰减
    for (var fi = g.fx.length - 1; fi >= 0; fi--) {
      g.fx[fi].life -= dt;
      if (g.fx[fi].life <= 0) g.fx.splice(fi, 1);
    }

    // 子弹本地外推（服务端 15Hz，这里补到 60Hz 才不卡顿）
    for (var bi = g.bullets.length - 1; bi >= 0; bi--) {
      var bb = g.bullets[bi];
      bb.x += bb.vx * dt;
      bb.y += bb.vy * dt;
      bb.life -= dt;
      if (bb.x < -60 || bb.y < -60 || bb.x > M.w + 60 || bb.y > M.h + 60 || bb.life <= 0) g.bullets.splice(bi, 1);
    }

    var _vt0 = performance.now();
    g.vision[player.id] = EW.computeVision(player);
    g.visionR[player.id] = EW.computeRear ? EW.computeRear(player) : null;
    visionMs = visionMs * 0.9 + (performance.now() - _vt0) * 0.1;
    g.t += dt;

    // 元素地面网格：客户端本地烘焙（纯视觉，不影响判定）
    netBakeT += dt;
    if (netBakeT > 0.06) { netBakeT = 0; if (EW.bakeVisual) EW.bakeVisual(g); }
    if (SFX) SFX.setListener(player.x, player.y);

    if (inp.throwElem) { netPendingItem = inp.throwElem; inp.throwElem = null; }
    var _sentSeq = Net.input(dt, { mx: mvx, my: mvy, aim: inp.aim, shoot: inp.shoot, sprint: inp.sprint, item: netPendingItem });
    if (_sentSeq) {
      netPendingItem = null;
      netBuf.push({ seq: _sentSeq, mx: mvx, my: mvy, sp: canSprint ? 1 : 0 });
      if (netBuf.length > 60) netBuf.shift();
    }

    if (!netWarned && lastSnapWall && performance.now() - lastSnapWall > 3000) {
      netWarned = true;
      toastMsg('服务器 3 秒没有回应，可能已断线');
    }
    updateDmgNums(dt);
    if (toast.t > 0) toast.t -= dt;
  }

  // ---------------- 联机大厅 ----------------
  var roomTimer = null;
  var openHall = null;

  function stopRoomPoll() {
    if (roomTimer) { clearInterval(roomTimer); roomTimer = null; }
  }

  function renderRooms(list) {
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

  function refreshRooms() {
    if (location.protocol === 'file:') {
      var box = document.getElementById('roomList');
      if (box) box.innerHTML = '<div style="color:#ffb0a0;font-size:13px;padding:12px 4px">' +
        '联机需要通过服务器打开（http://...），当前是本地文件</div>';
      return;
    }
    fetch('/api/rooms').then(function (r) { return r.json(); })
      .then(renderRooms)
      .catch(function () { });
  }

  (function () {
    var el = document.getElementById('netpanel');
    openHall = function () {
      setState('net'); show(el, true);
      refreshRooms();
      stopRoomPoll();
      roomTimer = setInterval(refreshRooms, 2500);
    };
    var btn = document.getElementById('btnNet');
    if (btn) btn.onclick = function () { clickSfx(); openHall(); };
    if (new URLSearchParams(location.search).get('hall') === '1') setTimeout(openHall, 0);
    var back = document.getElementById('netBack');
    if (back) back.onclick = function () { clickSfx(); stopRoomPoll(); setState('menu'); };
    var rf = document.getElementById('netRefresh');
    if (rf) rf.onclick = function () { clickSfx(); refreshRooms(); };
    var go = document.getElementById('netGo');
    if (go) go.onclick = function () {
      var name = (document.getElementById('netName').value || '玩家').slice(0, 10);
      var room = (document.getElementById('netRoom').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      var md = document.getElementById('netMode').value;
      stopRoomPoll();
      startNet({ mode: md, room: room, name: name });
    };
  })();

  // ---------------- 房间大厅 ----------------
  var lobbyState = { code: '', players: [], canStart: false, me: -1, host: false, allReady: false };

  function renderLobby(m) {
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

  function showLobby(on) {
    var el = document.getElementById('lobby');
    if (el) el.style.display = on ? '' : 'none';
    if (on) ui.classList.remove('hidden');
  }

  // ---------------- 主循环 ----------------
  var last = performance.now();
  var prevFrame = 0;

  function frame(now) {
    var cap = SD.fpsCap ? 1000 / SD.fpsCap : 0;
    if (cap && now - prevFrame < cap - 1) { requestAnimationFrame(frame); return; }
    prevFrame = now;

    var rawDt = (now - last) / 1000;
    var dt = Math.min(0.05, rawDt);
    last = now;
    if (dt > 0) fpsAvg = fpsAvg * 0.9 + (1 / dt) * 0.1;
    // 帧间隔抖动：每秒统计一次最坏帧
    jitterT += dt;
    if (rawDt > frameWorst) frameWorst = rawDt;
    if (jitterT >= 1) { frameJitter = frameJitter * 0.6 + frameWorst * 1000 * 0.4; frameWorst = 0; jitterT = 0; }

    if (state === 'play' && g) {
      mouse.x = mouse.sx + cam.x;
      mouse.y = mouse.sy + cam.y;

      if (netActive) {
        try { netFrame(dt); } catch (e2) { fatalCount++; fatalMsg = String(e2); console.error('[net]', e2); }
      } else if (g.winner < 0) {
        var inp = g.inputs[player.id];
        var mvx = 0, mvy = 0;
        if (keys['a']) mvx -= 1;
        if (keys['d']) mvx += 1;
        if (keys['w']) mvy -= 1;
        if (keys['s']) mvy += 1;
        inp.mx = mvx; inp.my = mvy;
        inp.sprint = !!keys[SD.keys.sprint];
        inp.aim = Math.atan2(mouse.y - player.y, mouse.x - player.x);
        inp.shoot = mouse.down && player.alive;
        EW.step(g, dt);

        for (var si = 0; si < g.sfx.length; si++) {
          var ev = g.sfx[si];
          if (ev.t === 'dmg') addDmg(ev);
          else if (ev.t === 'killfx') addKillFx(ev);
          if (SFX && ev.t !== 'killfx') SFX.play(ev);
        }
        g.sfx.length = 0;
        if (SFX) SFX.setListener(player.x, player.y);

        var dx = player.x - lastPos.x, dy = player.y - lastPos.y;
        speedAvg = speedAvg * 0.85 + (Math.sqrt(dx * dx + dy * dy) / dt) * 0.15;
        lastPos.x = player.x; lastPos.y = player.y;
      } else if (state === 'play') {
        state = 'end';
        elEndTitle.textContent = g.winner === player.team ? '胜利' : '失败';
        elEndTitle.style.color = g.winner === player.team ? '#5ee6cf' : '#ff6b74';
        elEndScore.textContent = g.score[0] + ' : ' + g.score[1] + '　' + M.name;
        ui.classList.remove('hidden');
        PANELS.forEach(function (p) { show(p, p === elEnd); });
      }

      updateDmgNums(dt);
      if (toast.t > 0) toast.t -= dt;
      cam.x += (clamp(player.x - VW / 2, 0, Math.max(0, M.w - VW)) - cam.x) * Math.min(1, dt * 10);
      cam.y += (clamp(player.y - VH / 2, 0, Math.max(0, M.h - VH)) - cam.y) * Math.min(1, dt * 10);
    }

    var _rt0 = performance.now();
    try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VW, VH);
    if (g && state !== 'menu') {
      ctx.save();
      ctx.translate(-cam.x, -cam.y);
      drawFloor();
      drawField();
      drawZones();
      drawTraps();
      drawEarthWalls();
      drawCovers();
      drawBarrels();
      drawBullets();
      drawGrenades();
      drawFx();
      for (var i = 0; i < g.units.length; i++) {
        if (g.units[i] !== player) drawUnit(g.units[i], g.units[i].team === player.team);
      }
      if (player.alive) drawUnit(player, true);
      drawFogs();
      ctx.restore();
      drawFogOfWar();
      drawDmgNums();
      drawHUD();
      drawMinimap();
      drawKillFeed();
      drawScoreboard();
    }
    } catch (err) {
      fatalCount++;
      if (fatalMsg !== String(err)) { fatalMsg = String(err); console.error('[render]', err); }
    }
    renderMs = renderMs * 0.85 + (performance.now() - _rt0) * 0.15;
    requestAnimationFrame(frame);
  }

  // ---------------- 启动 ----------------
  document.getElementById('ver').textContent = EW.VERSION;
  var _ver2 = document.getElementById('ver2');
  if (_ver2) _ver2.textContent = EW.VERSION;

  // 载入编辑器保存的自定义地图
  try {
    var rawMap = localStorage.getItem('elementswar.map');
    if (rawMap) {
      var mdef = JSON.parse(rawMap);
      mdef.key = 'custom';
      mdef.name = mdef.name || '自定义地图';
      EW.buildCustomMap(mdef);
      var mb = document.createElement('button');
      mb.dataset.mode = 'custom';
      mb.innerHTML = '自定义<span>' + mdef.name + '</span>';
      var modesBox = document.querySelector('.modes');
      modesBox.appendChild(mb);
      mb.onclick = function () { clickSfx(); mode = 'custom'; openLoadout(false); };
    }
  } catch (e) { }
  setState('menu');

  var qsp = new URLSearchParams(location.search);
  // 联机开关：服务器版本把他设成 false，整个联机入口消失
  var NET_ENABLED = window.NET_ENABLED !== false;

  if (!NET_ENABLED) {
    var _bn = document.getElementById('btnNet');
    if (_bn) _bn.style.display = 'none';
    var _np = document.getElementById('netpanel');
    if (_np) _np.remove();
    var _lb = document.getElementById('lobby');
    if (_lb) _lb.remove();
    if (qsp.get('net') === '1' || qsp.get('hall') === '1') {
      qsp.delete('net'); qsp.delete('hall');
      history.replaceState(null, '', location.pathname + '?' + qsp.toString() + location.hash);
    }
  }

  if (NET_ENABLED && qsp.get('net') === '1') {
    startNet({
      mode: qsp.get('mode') || 'small',
      room: (qsp.get('room') || '').toUpperCase(),
      name: qsp.get('name') || '玩家'
    });
  }

  var hash = location.hash;
  if (hash.indexOf('debug') >= 0) setTimeout(toggleDebug, 60);
  var pm = /play=(\w+)/.exec(hash);
  var fmm = /ff=(\d+)/.exec(hash);
  var lm = /loadout=(\w+)/.exec(hash);
  if (lm) { mode = lm[1]; openLoadout(false); }
  if (pm || fmm) {
    mode = pm ? pm[1] : 'large';
    startMatch();
    if (fmm) {
      var secs = Math.min(60, parseInt(fmm[1], 10));
      for (var i = 0; i < secs * 60; i++) EW.step(g, 1 / 60);
      centerCam();
    }
  }
  if (hash.indexOf('score') >= 0) showScore = true;
  var panelm = /panel=(\w+)/.exec(hash);
  if (panelm) {
    setTimeout(function () {
      if (panelm[1] === 'settings') openSettings();
      else if (panelm[1] === 'shop' && g) openShop();
      else if (panelm[1] === 'pause' && g) openPause();
      else if (panelm[1] === 'changelog') showChangelog();
    }, 120);
  }

  requestAnimationFrame(frame);
})();

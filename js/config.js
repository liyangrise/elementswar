/* ElementsWar - 配表运行时覆盖
 * config.html 保存的数值存在 localStorage，这里在 core.js 之后、main.js 之前应用。
 * 想恢复出厂设置：?balance=off  或清空 localStorage 里的 elementswar.balance
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.EW) return;

  var QS = new URLSearchParams(location.search);
  if (QS.get('balance') === 'off') return;

  var KEY = 'elementswar.balance';
  var raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { return; }
  if (!raw) return;

  var data;
  try { data = JSON.parse(raw); } catch (e) { return; }
  if (!data || typeof data !== 'object') return;

  var EW = window.EW;
  var applied = 0;

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  // 1) CFG
  if (data.cfg && EW.CFG) {
    for (var k in data.cfg) {
      if (!(k in EW.CFG)) continue;
      var v = data.cfg[k];
      if (typeof EW.CFG[k] === 'boolean') { EW.CFG[k] = !!v; applied++; }
      else if (num(v) !== null) { EW.CFG[k] = num(v); applied++; }
    }
  }

  // 2) 武器
  if (data.weapons && EW.WEAPONS) {
    for (var w in data.weapons) {
      var wp = EW.WEAPONS[w];
      if (!wp) continue;
      for (var f in data.weapons[w]) {
        if (typeof wp[f] === 'boolean') { wp[f] = !!data.weapons[w][f]; applied++; }
        else if (num(data.weapons[w][f]) !== null && (typeof wp[f] === 'number' || wp[f] === undefined)) {
          wp[f] = num(data.weapons[w][f]); applied++;
        }
      }
    }
  }

  // 3) 道具 CD
  if (data.items && EW.ITEMS) {
    for (var it in data.items) {
      if (!EW.ITEMS[it]) continue;
      if (num(data.items[it].cd) !== null) { EW.ITEMS[it].cd = num(data.items[it].cd); applied++; }
    }
  }

  // 4) 天赋 / 防具价格
  [['talents', EW.TALENTS], ['armors', EW.ARMORS]].forEach(function (pair) {
    var src = data[pair[0]];
    var list = pair[1];
    if (!src || !list) return;
    list.forEach(function (t) {
      if (src[t.k] && num(src[t.k].cost) !== null) { t.cost = num(src[t.k].cost); applied++; }
    });
  });

  // 5) 地图目标击杀
  if (data.maps && EW.MAPS) {
    for (var m in data.maps) {
      if (!EW.MAPS[m]) continue;
      if (num(data.maps[m].killTarget) !== null) { EW.MAPS[m].killTarget = num(data.maps[m].killTarget); applied++; }
    }
  }

  window.__BALANCE_APPLIED = applied;
  if (applied) console.log('[配表] 已应用 ' + applied + ' 项覆盖');
})();

/* ElementsWar - 用户设置（localStorage 持久化） */
(function (root) {
  'use strict';

  var KEY = 'elementswar.settings.v1';

  var DEFAULTS = {
    dmgMode: 'perHit',        // perHit | accum
    showInfo: true,           // 显示帧数 / 速度
    fpsCap: 240,              // 0 = 不限制
    keys: {
      reload: 'r',
      item1: 'g',
      item2: 'h',
      cycleItem: 'q',
      ks: 'v',
      sprint: 'shift',
      loadout: 'b',
      shop: 't',
      pause: 'escape'
    }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var data = clone(DEFAULTS);

  try {
    var raw = root.localStorage && root.localStorage.getItem(KEY);
    if (raw) {
      var saved = JSON.parse(raw);
      Object.keys(DEFAULTS).forEach(function (k) {
        if (k === 'keys') return;
        if (saved[k] !== undefined) data[k] = saved[k];
      });
      if (saved.keys) Object.keys(DEFAULTS.keys).forEach(function (k) {
        if (typeof saved.keys[k] === 'string') data.keys[k] = saved.keys[k];
      });
    }
  } catch (e) { /* 隐私模式下忽略 */ }

  function save() {
    try { root.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { }
  }

  root.SETTINGS = {
    data: data,
    DEFAULTS: clone(DEFAULTS),
    save: save,
    reset: function () {
      var d = clone(DEFAULTS);
      Object.keys(d).forEach(function (k) { data[k] = d[k]; });
      save();
    },
    key: function (action) { return data.keys[action]; }
  };
})(typeof window !== 'undefined' ? window : globalThis);

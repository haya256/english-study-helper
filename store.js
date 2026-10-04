// 端末内（localStorage）への保存。メインページと翻訳ページで共有する
(function (root) {
  'use strict';

  const KEY = 'esh:v1';
  const defaults = { source: '', sentences: [], settings: { rate: 0.9, voiceURI: '', translateMode: 'para' } };

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.sentences)) return { ...defaults, ...s, settings: { ...defaults.settings, ...s.settings } };
    } catch (e) { /* 保存できない環境では毎回まっさらな状態で始める */ }
    return JSON.parse(JSON.stringify(defaults));
  }

  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 保存できなくても動作は続ける */ }
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) { /* 消せなくても続ける */ }
  }

  root.Store = { load, save, clear };
})(self);

// 端末内（localStorage）への保存。メインページと翻訳ページで共有する
(function (root) {
  'use strict';

  const KEY = 'esh:v1';
  const defaults = { source: '', sentences: [], settings: { rate: 0.5, rateJa: 1.5, volume: 1, volumeJa: 1, voiceURI: '', voiceJaURI: '', translateMode: 'para', silenceSec: 5, hand: 'right', playAllCounts: [1, 0, 0] } };

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.sentences)) {
        const settings = { ...defaults.settings, ...s.settings };
        // 以前の「全部読む」の設定（英語／日本語／両方）を、英語→日本語→英語の回数に置き換える
        if (settings.playAllLang) {
          if (!(s.settings && s.settings.playAllCounts)) settings.playAllCounts = { en: [1, 0, 0], ja: [0, 1, 0], both: [1, 1, 0] }[settings.playAllLang] || [1, 0, 0];
          delete settings.playAllLang;
        }
        settings.playAllCounts = [...settings.playAllCounts]; // 初期値の配列を書き換えないようコピーする
        return { ...defaults, ...s, settings };
      }
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

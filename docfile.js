// 文章1つをファイル（JSON）に書き出す・読み込む。別の端末やブラウザへ移すために使う
(function (root) {
  'use strict';

  const APP = 'english-study-helper';
  const VERSION = 1;
  const MAX_SENTENCES = 1000;
  const MAX_CHARS = 20000;

  // 戻り値: ファイルに書く文字列。設定は端末ごとのものなので入れない
  function toText(name, doc) {
    return JSON.stringify({
      app: APP,
      version: VERSION,
      name: name || '',
      source: doc.source || '',
      sentences: doc.sentences.map((s) => ({ en: s.en, para: s.para, ja: s.ja || '', best: s.best, marked: Boolean(s.marked) })),
      pos: doc.pos || 0,
    }, null, 1);
  }

  // 戻り値: { name, source, sentences, pos }。この形のファイルでなければ例外を投げる（message は画面に出す文）
  function fromText(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('このアプリで保存したファイルではありません'); }
    if (!data || data.app !== APP || !Array.isArray(data.sentences)) throw new Error('このアプリで保存したファイルではありません');
    if (data.version > VERSION) throw new Error('新しい版のアプリで保存したファイルです。ページを読み込み直してから試してください');
    const source = typeof data.source === 'string' ? data.source : '';
    if (source.length > MAX_CHARS || data.sentences.length > MAX_SENTENCES) throw new Error('文章が長すぎて読み込めません');
    const sentences = data.sentences
      .filter((s) => s && typeof s.en === 'string' && s.en.trim())
      .map((s) => ({
        en: s.en,
        para: Number.isFinite(s.para) ? s.para : 0,
        ja: typeof s.ja === 'string' ? s.ja : '',
        jaManual: false,
        best: Number.isFinite(s.best) ? s.best : null,
        marked: Boolean(s.marked),
      }));
    if (!sentences.length && !source.trim()) throw new Error('ファイルに英文が入っていません');
    const pos = Number.isInteger(data.pos) && data.pos >= 0 && data.pos < sentences.length ? data.pos : 0;
    return { name: typeof data.name === 'string' ? data.name.trim() : '', source, sentences, pos };
  }

  // ファイル名に使えない文字を除いて、長すぎないようにする
  function fileName(title) {
    const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'document';
    return base + '.json';
  }

  const api = { toText, fromText, fileName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DocFile = api;
})(typeof self !== 'undefined' ? self : this);

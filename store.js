// 端末内（localStorage）への保存。メインページと翻訳ページで共有する
// 文章（英文と訳のまとまり）を複数持てる。目次と設定は1つのキーに、文章の中身は文章ごとのキーに入れる
(function (root) {
  'use strict';

  const OLD_KEY = 'esh:v1';
  const INDEX_KEY = 'esh:v2';
  const DOC_PREFIX = 'esh:v2:doc:';
  const defaultSettings = { rate: 0.5, rateJa: 1.5, volume: 1, volumeJa: 1, voiceURI: '', voiceJaURI: '', translateMode: 'para', silenceSec: 5, hand: 'right', playAllCounts: [1, 0, 0] };
  const emptyDoc = () => ({ source: '', sentences: [], pos: 0 });

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function fixSettings(saved) {
    const settings = { ...defaultSettings, ...saved };
    // 以前の「全部読む」の設定（英語／日本語／両方）を、英語→日本語→英語の回数に置き換える
    if (settings.playAllLang) {
      if (!(saved && saved.playAllCounts)) settings.playAllCounts = { en: [1, 0, 0], ja: [0, 1, 0], both: [1, 1, 0] }[settings.playAllLang] || [1, 0, 0];
      delete settings.playAllLang;
    }
    settings.playAllCounts = [...settings.playAllCounts]; // 初期値の配列を書き換えないようコピーする
    return settings;
  }

  // 目次を読む。なければ、前の形（文章1つ）から引っ越すか、空の文章を1つ作る
  function index() {
    const idx = read(INDEX_KEY);
    if (idx && Array.isArray(idx.docs) && idx.docs.length) return idx;
    const now = Date.now();
    const id = newId();
    const old = read(OLD_KEY);
    const fresh = { currentId: id, docs: [{ id, name: '', createdAt: now, updatedAt: now }], settings: {} };
    if (old && Array.isArray(old.sentences)) {
      fresh.settings = old.settings || {};
      if (!write(DOC_PREFIX + id, { source: old.source || '', sentences: old.sentences, pos: 0 })) return fresh;
      if (write(INDEX_KEY, fresh)) {
        try { localStorage.removeItem(OLD_KEY); } catch (e) { /* 消せなくても続ける */ }
      }
      return fresh;
    }
    write(DOC_PREFIX + id, emptyDoc());
    write(INDEX_KEY, fresh);
    return fresh;
  }

  // 今の文章の中身と、共通の設定を返す
  function load() {
    const idx = index();
    const docId = idx.docs.some((d) => d.id === idx.currentId) ? idx.currentId : idx.docs[0].id;
    const doc = read(DOC_PREFIX + docId);
    const body = doc && Array.isArray(doc.sentences) ? { ...emptyDoc(), ...doc } : emptyDoc();
    return { docId, ...body, settings: fixSettings(idx.settings) };
  }

  // 設定は目次に、中身は今の文章に書く。容量がいっぱいなどで書けなかったら false を返す
  function save(state) {
    const idx = index();
    const meta = idx.docs.find((d) => d.id === state.docId);
    if (!meta) return false;
    meta.updatedAt = Date.now();
    idx.currentId = state.docId;
    idx.settings = state.settings;
    const ok = write(DOC_PREFIX + state.docId, { source: state.source, sentences: state.sentences, pos: state.pos || 0 });
    return write(INDEX_KEY, idx) && ok;
  }

  // 最近使った順。一覧に出すための文の数と英文の書き出しもつける
  function listDocs() {
    const idx = index();
    return idx.docs
      .map((d) => {
        const doc = read(DOC_PREFIX + d.id) || emptyDoc();
        return { ...d, count: (doc.sentences || []).length, source: doc.source || '', current: d.id === idx.currentId };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function createDoc() {
    const idx = index();
    const now = Date.now();
    const id = newId();
    idx.docs.push({ id, name: '', createdAt: now, updatedAt: now });
    idx.currentId = id;
    write(DOC_PREFIX + id, emptyDoc());
    write(INDEX_KEY, idx);
    return id;
  }

  function openDoc(id) {
    const idx = index();
    if (!idx.docs.some((d) => d.id === id)) return;
    idx.currentId = id;
    write(INDEX_KEY, idx);
  }

  function renameDoc(id, name) {
    const idx = index();
    const meta = idx.docs.find((d) => d.id === id);
    if (!meta) return;
    meta.name = name;
    write(INDEX_KEY, idx);
  }

  // 消したのが今の文章なら、最近使った別の文章を開く。最後の1つを消したら空の文章を作る
  function deleteDoc(id) {
    const idx = index();
    idx.docs = idx.docs.filter((d) => d.id !== id);
    try { localStorage.removeItem(DOC_PREFIX + id); } catch (e) { /* 消せなくても続ける */ }
    if (!idx.docs.length) {
      const now = Date.now();
      const nid = newId();
      idx.docs.push({ id: nid, name: '', createdAt: now, updatedAt: now });
      write(DOC_PREFIX + nid, emptyDoc());
    }
    if (!idx.docs.some((d) => d.id === idx.currentId)) {
      idx.currentId = [...idx.docs].sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
    }
    write(INDEX_KEY, idx);
  }

  // 名前が空なら英文の書き出しを、英文もなければ「新しい文章」を名前として出す
  function displayName(name, source) {
    if (name && name.trim()) return name.trim();
    const head = (source || '').replace(/\s+/g, ' ').trim();
    if (!head) return '新しい文章';
    return head.length > 30 ? head.slice(0, 30) + '…' : head;
  }

  function docName(id) {
    const meta = index().docs.find((d) => d.id === id);
    return meta ? meta.name : '';
  }

  function clear() {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('esh:')).forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* 消せなくても続ける */ }
  }

  root.Store = { load, save, clear, listDocs, createDoc, openDoc, renameDoc, deleteDoc, displayName, docName };
})(self);

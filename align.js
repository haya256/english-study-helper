// 手で貼り付けた訳を各文に割り当てる。
// 改行の有無によらず「。」などで区切り、数が合えば順番に入れる。
(function (root) {
  'use strict';

  function splitJa(text) {
    return (text.match(/[^。！？!?]+[。！？!?」』）)]*/g) || []).map((t) => t.trim()).filter(Boolean);
  }

  function nonEmpty(list) {
    return list.map((t) => t.trim()).filter(Boolean);
  }

  // 戻り値: 文と同じ長さの訳の配列（割り当てられなかった文は ''）。1つも割り当てられないときは null
  function parseTranslations(text, sentences) {
    const n = sentences.length;
    const lines = nonEmpty(text.split(/\r?\n/));
    // 1行が1文
    if (lines.length === n) return lines;
    // 「。」で分けた数が文の数と同じ
    const all = splitJa(lines.join(''));
    if (all.length === n) return all;
    // 段落ごとに「。」で分けて、数が合う段落だけ割り当てる
    const paraIdx = new Map();
    sentences.forEach((s, i) => {
      if (!paraIdx.has(s.para)) paraIdx.set(s.para, []);
      paraIdx.get(s.para).push(i);
    });
    const groups = [...paraIdx.values()];
    // 翻訳で段落の間の空行が消えることがあるので、空行で分けて合わなければ1行を1段落とみなす
    let blocks = nonEmpty(text.split(/\r?\n\s*\r?\n/));
    if (blocks.length !== groups.length) blocks = lines;
    if (blocks.length !== groups.length) return null;
    const out = Array(n).fill('');
    let count = 0;
    groups.forEach((idxs, k) => {
      const parts = idxs.length === 1 ? [blocks[k].replace(/\s*\r?\n\s*/g, '')] : splitJa(blocks[k].replace(/\s*\r?\n\s*/g, ''));
      if (parts.length !== idxs.length) return;
      idxs.forEach((i, j) => { out[i] = parts[j]; count++; });
    });
    return count ? out : null;
  }

  const api = { splitJa, parseTranslations };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Align = api;
})(typeof self !== 'undefined' ? self : this);

// 英文テキストを段落・文に分割する
(function (root) {
  'use strict';

  // 後ろにどんな語が来ても文末とみなさない略語
  const NEVER_END = new Set([
    'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'mt',
    'e.g', 'i.e', 'cf', 'fig', 'approx', 'dept', 'gen', 'gov', 'rev', 'sgt', 'capt', 'lt', 'col',
  ]);
  // 次の語が小文字で始まるときだけ文末とみなさない略語
  const SOFT_END = new Set([
    'etc', 'a.m', 'p.m', 'u.s', 'u.k', 'u.s.a', 'inc', 'ltd', 'co', 'corp', 'jan', 'feb', 'mar', 'apr',
    'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  ]);

  // OCR や貼り付けで入った改行を整える。空行は段落の区切りとして残す
  function toParagraphs(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').replace(/[ \t ]+/g, ' ').trim())
      .filter(Boolean);
  }

  function lastWord(s) {
    const m = s.match(/([A-Za-z][A-Za-z.]*)\.$/);
    return m ? m[1].toLowerCase() : '';
  }

  function splitParagraph(p) {
    const out = [];
    // 文末記号（閉じ引用符・括弧を含む）の後に空白がある位置を候補にする
    const re = /[.!?]+["'”’)\]]*(?=\s+)/g;
    let start = 0;
    let m;
    while ((m = re.exec(p)) !== null) {
      const end = m.index + m[0].length;
      const chunk = p.slice(start, end);
      const rest = p.slice(end).trimStart();
      const next = rest.charAt(0);
      if (m[0].charAt(0) === '.' && m[0].length === 1) {
        const w = lastWord(chunk);
        if (NEVER_END.has(w)) continue;
        if (SOFT_END.has(w) && /[a-z0-9]/.test(next)) continue;
        if (w === 'no' && /\d/.test(next)) continue; // No. 5
        // 「J. K. Rowling」のような頭文字
        if (/(^|[\s(])[A-Z]\.$/.test(chunk) && /[A-Z]/.test(next)) continue;
      }
      // 次が小文字なら文の途中とみなす（例: "Wow!" she said.）
      if (/[a-z]/.test(next)) continue;
      out.push(chunk.trim());
      start = end;
    }
    const tail = p.slice(start).trim();
    if (tail) out.push(tail);
    return out;
  }

  // 一文の上限。句読点のない文章が一文になると、発音比較（単語数の2乗に比例）が重くなるため
  const MAX_SENTENCE_CHARS = 400;

  // 長すぎる文を ; : → , → 空白 の順で区切って、上限以下のかたまりにする
  function splitLong(sentence, max) {
    if (sentence.length <= max) return [sentence];
    // 区切り記号は前のかたまりに残す（古い Safari は正規表現の後読みが使えないので、目印の文字に置き換えてから分ける）
    for (const re of [/([;:])\s+/g, /(,)\s+/g, /()\s+/g]) {
      const pieces = sentence.replace(re, '$1\u0000').split('\u0000');
      if (pieces.length < 2) continue;
      const out = [];
      let cur = '';
      pieces.forEach((piece) => {
        const next = cur ? cur + ' ' + piece : piece;
        if (next.length > max && cur) { out.push(cur); cur = piece; } else cur = next;
      });
      if (cur) out.push(cur);
      return out.flatMap((c) => splitLong(c, max));
    }
    // 空白すらない場合は文字数で切る
    const out = [];
    for (let k = 0; k < sentence.length; k += max) out.push(sentence.slice(k, k + max));
    return out;
  }

  // 戻り値: [{ en, para }] — para は段落の番号
  function splitSentences(text) {
    const result = [];
    toParagraphs(text).forEach((p, para) => {
      splitParagraph(p).forEach((sentence) => {
        splitLong(sentence, MAX_SENTENCE_CHARS).forEach((en) => result.push({ en, para }));
      });
    });
    return result;
  }

  const api = { splitSentences, toParagraphs, MAX_SENTENCE_CHARS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Splitter = api;
})(typeof self !== 'undefined' ? self : this);

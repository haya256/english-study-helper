// 元の英文と音声認識の結果を比べる。
// 短縮形（I've / I have）や数字（3 / three）などの表記の違いは、比べる前にそろえる。
(function (root) {
  'use strict';

  // 's / 'd を「is・has」「had・would」の区別なしにまとめてよい主語
  const SUBJECTS = new Set([
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'that', 'this', 'there', 'here',
    'what', 'who', 'where', 'when', 'why', 'how', 'everyone', 'everybody', 'someone',
    'somebody', 'nobody', 'nothing', 'something', 'everything',
  ]);

  const IRREGULAR_NT = { "can't": ['can', 'not'], "won't": ['will', 'not'], "shan't": ['shall', 'not'], "ain't": ['am', 'not'] };
  const SUFFIX = { "'m": 'am', "'re": 'are', "'ve": 'have', "'ll": 'will' };
  const SPELLING = { ok: 'okay', alright: 'all right', 'til': 'until', till: 'until', cannot: 'can not' };

  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const ORDINAL = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };

  function under1000(n) {
    const w = [];
    if (n >= 100) { w.push(ONES[Math.floor(n / 100)], 'hundred'); n %= 100; }
    if (n >= 20) { w.push(TENS[Math.floor(n / 10)]); n %= 10; if (n) w.push(ONES[n]); }
    else if (n > 0 || w.length === 0) w.push(ONES[n]);
    return w;
  }

  function numberToWords(n) {
    if (n === 0) return ['zero'];
    const w = [];
    [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']].forEach(([v, name]) => {
      if (n >= v) { w.push(...under1000(Math.floor(n / v)), name); n %= v; }
    });
    if (n > 0) w.push(...under1000(n));
    return w;
  }

  function toOrdinal(words) {
    const w = words.slice();
    const last = w.pop();
    let o;
    if (ORDINAL[last]) o = ORDINAL[last];
    else if (last.endsWith('y')) o = last.slice(0, -1) + 'ieth';
    else o = last + 'th';
    w.push(o);
    return w;
  }

  // 数字を含むトークンを単語の列にする。数字でなければ null
  function numberTokens(tok) {
    let m;
    if ((m = tok.match(/^\$(\d+)$/))) {
      const n = Number(m[1]);
      return [...numberToWords(n), n === 1 ? 'dollar' : 'dollars'];
    }
    if ((m = tok.match(/^(\d+)%$/))) return [...numberToWords(Number(m[1])), 'percent'];
    if ((m = tok.match(/^(\d+)(st|nd|rd|th)$/))) return toOrdinal(numberToWords(Number(m[1])));
    if ((m = tok.match(/^(\d+)\.(\d+)$/))) return [...numberToWords(Number(m[1])), 'point', ...m[2].split('').map((d) => ONES[d])];
    if (/^\d+$/.test(tok) && tok.length <= 12) return numberToWords(Number(tok));
    return null;
  }

  // 表示用の単語に分ける
  function displayWords(text) {
    return String(text || '').trim().split(/\s+/).filter(Boolean);
  }

  // 1 語を比較用のトークン列にする
  function wordToTokens(word) {
    let w = word.normalize('NFKC').toLowerCase()
      .replace(/[‘’`´]/g, "'")
      .replace(/(\d),(?=\d{3})/g, '$1');
    if (w === '&') return ['and'];
    w =w.replace(/^[^a-z0-9$']+|[^a-z0-9%']+$/g, '').replace(/^'+|'+$/g, '');
    if (!w) return [];
    const parts = w.split(/[-–—/&]+/).filter(Boolean);
    const out = [];
    parts.forEach((p, i) => {
      if (i > 0 && /[&]/.test(w)) out.push('and');
      p = p.replace(/[^a-z0-9$%'.]/g, '').replace(/\.(?!\d)/g, '');
      if (!p) return;
      const num = numberTokens(p);
      if (num) { out.push(...num); return; }
      if (SPELLING[p]) { out.push(...SPELLING[p].split(' ')); return; }
      if (IRREGULAR_NT[p]) { out.push(...IRREGULAR_NT[p]); return; }
      if (p.endsWith("n't")) { out.push(p.slice(0, -3), 'not'); return; }
      if (p === "let's") { out.push('let', 'us'); return; }
      const sm = p.match(/^(.+)('m|'re|'ve|'ll)$/);
      if (sm) { out.push(sm[1], SUFFIX[sm[2]]); return; }
      const sd = p.match(/^(.+)'(s|d)$/);
      if (sd && SUBJECTS.has(sd[1])) { out.push(sd[1], "'" + sd[2]); return; }
      out.push(p);
    });
    return out;
  }

  // 文を比較用のトークン列にする。各トークンは元の単語の番号 src を持つ
  function tokenize(text) {
    const words = displayWords(text);
    const toks = [];
    words.forEach((word, src) => {
      wordToTokens(word).forEach((t) => toks.push({ t, src }));
    });
    // 主語の後の is/has → 's、had/would → 'd にそろえる（he's は is と has のどちらにもなるため）
    for (let i = 1; i < toks.length; i++) {
      if (!SUBJECTS.has(toks[i - 1].t)) continue;
      if (toks[i].t === 'is' || toks[i].t === 'has') toks[i].t = "'s";
      else if (toks[i].t === 'had' || toks[i].t === 'would') toks[i].t = "'d";
    }
    return { words, toks };
  }

  // 単語単位の LCS。一致したトークンの組 [i, j] を返す
  function lcs(a, b) {
    const n = a.length, m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i].t === b[j].t ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const pairs = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i].t === b[j].t) { pairs.push([i, j]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    return pairs;
  }

  // 1 語の中で一致したトークンの割合から状態を決める
  function wordStatus(words, toks, matched) {
    return words.map((word, idx) => {
      const mine = toks.map((t, k) => (t.src === idx ? k : -1)).filter((k) => k >= 0);
      if (mine.length === 0) return { word, status: 'ignored' };
      const hit = mine.filter((k) => matched.has(k)).length;
      return { word, status: hit === mine.length ? 'ok' : hit === 0 ? 'miss' : 'partial' };
    });
  }

  // 戻り値: { score: 0〜100, ref: [{word,status}], hyp: [{word,status}] }
  // ref の status は ok / partial / miss、hyp の status は ok / partial / extra
  function compare(reference, spoken) {
    const R = tokenize(reference);
    const H = tokenize(spoken);
    const pairs = lcs(R.toks, H.toks);
    const rm = new Set(pairs.map((p) => p[0]));
    const hm = new Set(pairs.map((p) => p[1]));
    const score = R.toks.length ? Math.round((pairs.length / R.toks.length) * 100) : 0;
    const ref = wordStatus(R.words, R.toks, rm);
    const hyp = wordStatus(H.words, H.toks, hm).map((w) => (w.status === 'miss' ? { word: w.word, status: 'extra' } : w));
    return { score, ref, hyp };
  }

  const api = { compare, tokenize, numberToWords };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Compare = api;
})(typeof self !== 'undefined' ? self : this);

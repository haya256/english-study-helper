// 翻訳ページ。英文だけを並べて Safari に「英語のページ」と判断させ、
// Safari の翻訳で日本語に置き換わった文を各文の訳として保存する。
(function () {
  'use strict';

  const JA_RE = /[぀-ヿ㐀-鿿]/;
  const areaEl = document.getElementById('translate-area');
  const statusEl = document.getElementById('status');
  let state = Store.load();
  document.documentElement.dataset.hand = state.settings.hand;

  function render() {
    areaEl.textContent = '';
    if (state.settings.translateMode === 'line') {
      state.sentences.forEach((s, i) => {
        const p = document.createElement('p');
        p.dataset.i = i;
        p.textContent = s.en;
        areaEl.appendChild(p);
      });
    } else {
      // 段落ごとにまとめて、Safari が前後の文脈を使って訳せるようにする
      const byPara = new Map();
      state.sentences.forEach((s, i) => {
        if (!byPara.has(s.para)) byPara.set(s.para, []);
        byPara.get(s.para).push(i);
      });
      byPara.forEach((idxs, para) => {
        const p = document.createElement('p');
        p.dataset.para = para;
        idxs.forEach((i, k) => {
          if (k) p.appendChild(document.createTextNode(' '));
          const span = document.createElement('span');
          span.dataset.i = i;
          span.textContent = state.sentences[i].en;
          p.appendChild(span);
        });
        areaEl.appendChild(p);
      });
    }
  }

  function setTranslation(i, text) {
    const s = state.sentences[i];
    if (!s || s.jaManual || !text || !JA_RE.test(text) || text === s.ja) return false;
    s.ja = text;
    return true;
  }

  function capture() {
    // 他のページで書き換えられていても上書きしないよう、取り込む直前に読み直す
    const fresh = Store.load();
    if (fresh.docId !== state.docId || fresh.sentences.length !== state.sentences.length) return;
    state = fresh;
    let changed = false;
    areaEl.querySelectorAll('[data-i]').forEach((el) => {
      if (setTranslation(Number(el.dataset.i), el.textContent.trim())) changed = true;
    });
    // Safari が段落の中の区切り（span）を消してしまった場合は、「。」で分けて数が合えば割り当てる
    areaEl.querySelectorAll('p[data-para]').forEach((p) => {
      const idxs = state.sentences.map((s, i) => (String(s.para) === p.dataset.para ? i : -1)).filter((i) => i >= 0);
      if (p.querySelectorAll('[data-i]').length === idxs.length) return;
      const text = p.textContent.trim();
      if (!JA_RE.test(text)) return;
      const parts = (text.match(/[^。！？!?]+[。！？!?]*/g) || []).map((t) => t.trim()).filter(Boolean);
      if (parts.length !== idxs.length) return;
      idxs.forEach((i, k) => { if (setTranslation(i, parts[k])) changed = true; });
    });
    if (changed) Store.save(state);
    const done = state.sentences.filter((s) => s.ja).length;
    statusEl.textContent = `${done} / ${state.sentences.length}`;
  }

  let timer = null;
  render();
  capture();
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(capture, 500); })
    .observe(areaEl, { subtree: true, childList: true, characterData: true });
})();

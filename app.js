(function () {
  'use strict';

  const STORAGE_KEY = 'esh:v1';
  const JA_RE = /[぀-ヿ㐀-鿿]/;
  const $ = (sel) => document.querySelector(sel);

  // ---------- 状態と保存 ----------
  const defaults = { source: '', sentences: [], settings: { rate: 0.9, voiceURI: '', translateMode: 'para' } };
  let state = load();

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (s && Array.isArray(s.sentences)) return { ...defaults, ...s, settings: { ...defaults.settings, ...s.settings } };
    } catch (e) { /* 保存できない環境では毎回まっさらな状態で始める */ }
    return JSON.parse(JSON.stringify(defaults));
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 保存できなくても動作は続ける */ }
  }
  let saveTimer = null;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); }

  // ---------- 入力と分割 ----------
  const sourceEl = $('#source');
  sourceEl.value = state.source;
  sourceEl.addEventListener('input', () => { state.source = sourceEl.value; saveSoon(); });

  $('#btn-split').addEventListener('click', () => {
    // 同じ英文の訳とベストスコアは引き継ぐ
    const prev = new Map(state.sentences.map((s) => [s.en, s]));
    state.sentences = Splitter.splitSentences(sourceEl.value).map(({ en, para }) => {
      const p = prev.get(en);
      return { en, para, ja: p ? p.ja : '', jaManual: p ? p.jaManual : false, best: p ? p.best : null };
    });
    save();
    renderSentences();
    renderTranslateArea();
    if (state.sentences.length) {
      $('#input-panel').open = false;
      $('#sentences-section').scrollIntoView({ behavior: 'smooth' });
    }
  });

  $('#btn-clear-source').addEventListener('click', () => {
    sourceEl.value = '';
    state.source = '';
    save();
    sourceEl.focus();
  });

  // 写真は画面に出すだけ。iOS のテキスト認識表示で文字を選んでコピーしてもらう
  let photoUrl = null;
  $('#photo').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(file);
    $('#photo-img').src = photoUrl;
    $('#photo-view').hidden = false;
    e.target.value = '';
  });
  $('#btn-photo-close').addEventListener('click', () => {
    $('#photo-view').hidden = true;
    $('#photo-img').removeAttribute('src');
    if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = null; }
  });

  // ---------- 文のカード ----------
  const listEl = $('#sentences');
  const tpl = $('#tpl-sentence');

  function cardAt(i) { return listEl.children[i]; }

  function renderSentences() {
    stopSpeaking();
    stopRecognition();
    listEl.textContent = '';
    state.sentences.forEach((s, i) => {
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.querySelector('.en').textContent = s.en;
      const ja = li.querySelector('.ja');
      ja.value = s.ja || '';
      ja.addEventListener('input', () => {
        s.ja = ja.value;
        s.jaManual = ja.value.trim() !== '';
        saveSoon();
      });
      li.querySelector('.btn-speak').addEventListener('click', () => toggleSpeak(i));
      li.querySelector('.btn-mic').addEventListener('click', () => toggleRecognition(i));
      li.querySelector('.btn-type').addEventListener('click', () => {
        const box = li.querySelector('.type-box');
        box.hidden = !box.hidden;
        if (!box.hidden) li.querySelector('.type-input').focus();
      });
      li.querySelector('.btn-type-check').addEventListener('click', () => {
        const text = li.querySelector('.type-input').value.trim();
        if (text) showResult(i, Compare.compare(s.en, text));
      });
      if (s.best != null) setScoreText(li, null, s.best);
      listEl.appendChild(li);
    });
    $('#sentences-section').hidden = state.sentences.length === 0;
  }

  function wordSpans(container, words) {
    container.textContent = '';
    words.forEach((w, k) => {
      if (k) container.appendChild(document.createTextNode(' '));
      const span = document.createElement('span');
      span.className = 'w ' + w.status;
      span.textContent = w.word;
      container.appendChild(span);
    });
  }

  function setScoreText(li, score, best) {
    const result = li.querySelector('.result');
    const el = li.querySelector('.score');
    result.hidden = false;
    if (score == null) {
      el.className = 'score';
      el.textContent = `ベスト ${best}%`;
      return;
    }
    el.className = 'score ' + (score >= 90 ? 'good' : score >= 70 ? 'fair' : 'poor');
    el.textContent = `${score}%` + (best != null ? `（ベスト ${best}%）` : '');
  }

  function showResult(i, r, note) {
    const s = state.sentences[i];
    const li = cardAt(i);
    if (!li) return;
    s.best = s.best == null ? r.score : Math.max(s.best, r.score);
    save();
    setScoreText(li, r.score, s.best);
    wordSpans(li.querySelector('.ref'), r.ref);
    const heard = li.querySelector('.heard');
    heard.textContent = '聞き取り: ';
    const span = document.createElement('span');
    span.lang = 'en';
    wordSpans(span, r.hyp);
    heard.appendChild(span);
    if (note) heard.appendChild(document.createTextNode(' ' + note));
  }

  function showMessage(i, text) {
    const li = cardAt(i);
    if (!li) return;
    li.querySelector('.result').hidden = false;
    li.querySelector('.ref').textContent = '';
    li.querySelector('.heard').textContent = text;
  }

  // ---------- 読み上げ ----------
  const synth = window.speechSynthesis;
  let speakingIdx = null;
  let playAll = false;

  function englishVoices() {
    return synth ? synth.getVoices().filter((v) => /^en[-_]/i.test(v.lang)) : [];
  }
  function currentVoice() {
    const voices = englishVoices();
    return voices.find((v) => v.voiceURI === state.settings.voiceURI)
      || voices.find((v) => /samantha/i.test(v.name))
      || voices.find((v) => /en[-_]US/i.test(v.lang))
      || voices[0] || null;
  }

  function markSpeaking(i, on) {
    const li = cardAt(i);
    if (!li) return;
    li.classList.toggle('speaking', on);
    li.querySelector('.btn-speak').classList.toggle('active', on);
  }

  function stopSpeaking() {
    playAll = false;
    if (speakingIdx != null) markSpeaking(speakingIdx, false);
    speakingIdx = null;
    if (synth) synth.cancel();
    $('#btn-play-all').textContent = '▶ 全部読む';
  }

  function speak(i, onDone) {
    if (!synth) { alert('この端末では読み上げが使えません'); return; }
    // 前の発話の onend が cancel() で呼ばれても続きを再生しないよう、先に null にする
    if (speakingIdx != null) markSpeaking(speakingIdx, false);
    speakingIdx = null;
    // iOS では cancel() の直後に speak() すると無音になることがあるので、話している時だけ止める
    if (synth.speaking || synth.pending) synth.cancel();
    const u = new SpeechSynthesisUtterance(state.sentences[i].en);
    const v = currentVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    u.rate = Number(state.settings.rate);
    u.onend = u.onerror = () => {
      if (speakingIdx !== i) return;
      markSpeaking(i, false);
      speakingIdx = null;
      if (onDone) onDone();
    };
    speakingIdx = i;
    markSpeaking(i, true);
    synth.speak(u);
  }

  function toggleSpeak(i) {
    if (speakingIdx === i) { stopSpeaking(); return; }
    stopRecognition();
    playAll = false;
    $('#btn-play-all').textContent = '▶ 全部読む';
    speak(i);
  }

  $('#btn-play-all').addEventListener('click', () => {
    if (playAll) { stopSpeaking(); return; }
    stopRecognition();
    playAll = true;
    $('#btn-play-all').textContent = '■ 止める';
    const next = (i) => {
      if (!playAll || i >= state.sentences.length) { stopSpeaking(); return; }
      cardAt(i).scrollIntoView({ behavior: 'smooth', block: 'center' });
      speak(i, () => next(i + 1));
    };
    next(0);
  });

  // ---------- 発音チェック（音声認識） ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let recIdx = null;

  function setMicButton(i, on) {
    const li = cardAt(i);
    if (!li) return;
    const b = li.querySelector('.btn-mic');
    b.classList.toggle('recording', on);
    b.textContent = on ? '■ 終わる' : '🎤 話す';
  }

  function stopRecognition() {
    if (rec) { try { rec.abort(); } catch (e) { /* すでに止まっている */ } }
  }

  function toggleRecognition(i) {
    if (rec) {
      const same = recIdx === i;
      if (same) { rec.stop(); return; }
      stopRecognition();
    }
    if (!SR) {
      showMessage(i, 'この環境では音声認識が使えません。「⌨ 入力」を押して、キーボードの🎙（音声入力）で話してください。');
      cardAt(i).querySelector('.type-box').hidden = false;
      return;
    }
    stopSpeaking();
    startRecognition(i);
  }

  function startRecognition(i) {
    const r = new SR();
    r.lang = 'en-US';
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 3;

    let finals = [];   // 確定した部分ごとの候補 [[alt, alt, ...], ...]
    let interim = '';
    let errorText = '';
    let silenceTimer = null;
    const hardStop = setTimeout(() => r.stop(), 20000);
    const bumpSilence = () => { clearTimeout(silenceTimer); silenceTimer = setTimeout(() => r.stop(), 2000); };

    r.onresult = (e) => {
      interim = '';
      for (let k = e.resultIndex; k < e.results.length; k++) {
        const res = e.results[k];
        if (res.isFinal) finals[k] = Array.from(res).map((a) => a.transcript);
        else interim += res[0].transcript;
      }
      const sofar = finals.filter(Boolean).map((alts) => alts[0]).join(' ') + ' ' + interim;
      showMessage(i, '聞き取り中… ' + sofar.trim());
      bumpSilence();
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        errorText = 'マイクか音声認識が許可されていません。「設定」アプリ → Safari → マイク、と「設定」→ Siri（音声入力）を確認してください。';
      } else if (e.error === 'no-speech') {
        errorText = '声が聞き取れませんでした。もう一度どうぞ。';
      } else if (e.error !== 'aborted') {
        errorText = '音声認識でエラーが起きました（' + e.error + '）。';
      }
    };
    r.onend = () => {
      clearTimeout(hardStop);
      clearTimeout(silenceTimer);
      if (rec === r) { rec = null; recIdx = null; }
      setMicButton(i, false);
      // 候補が複数あれば、一番点数が高い組み合わせを採用する
      const parts = finals.filter(Boolean);
      if (interim) parts.push([interim]);
      if (parts.length === 0) {
        if (errorText) showMessage(i, errorText);
        else if (cardAt(i)) cardAt(i).querySelector('.result').hidden = state.sentences[i].best == null;
        return;
      }
      const base = parts.map((alts) => alts[0]);
      let best = Compare.compare(state.sentences[i].en, base.join(' '));
      parts.forEach((alts, k) => {
        alts.slice(1).forEach((alt) => {
          const trial = base.slice();
          trial[k] = alt;
          const r2 = Compare.compare(state.sentences[i].en, trial.join(' '));
          if (r2.score > best.score) best = r2;
        });
      });
      showResult(i, best);
    };

    rec = r;
    recIdx = i;
    setMicButton(i, true);
    showMessage(i, '話してください…');
    try { r.start(); } catch (e) {
      rec = null; recIdx = null;
      setMicButton(i, false);
      showMessage(i, '音声認識を開始できませんでした。');
    }
  }

  // ---------- Safari の翻訳から訳を取り込む ----------
  const areaEl = $('#translate-area');
  let observer = null;

  function renderTranslateArea() {
    if (observer) observer.disconnect();
    areaEl.textContent = '';
    const byPara = new Map();
    state.sentences.forEach((s, i) => {
      if (!byPara.has(s.para)) byPara.set(s.para, []);
      byPara.get(s.para).push(i);
    });
    if (state.settings.translateMode === 'line') {
      state.sentences.forEach((s, i) => {
        const p = document.createElement('p');
        p.dataset.i = i;
        p.textContent = s.en;
        areaEl.appendChild(p);
      });
    } else {
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
    $('#translate-panel').hidden = state.sentences.length === 0;
    observer = new MutationObserver(captureSoon);
    observer.observe(areaEl, { subtree: true, childList: true, characterData: true });
  }

  let captureTimer = null;
  function captureSoon() { clearTimeout(captureTimer); captureTimer = setTimeout(captureTranslations, 500); }

  function setAutoTranslation(i, text) {
    const s = state.sentences[i];
    if (!s || s.jaManual || !text || !JA_RE.test(text) || text === s.ja) return false;
    s.ja = text;
    const li = cardAt(i);
    if (li) li.querySelector('.ja').value = text;
    return true;
  }

  function captureTranslations() {
    let changed = false;
    areaEl.querySelectorAll('[data-i]').forEach((el) => {
      if (setAutoTranslation(Number(el.dataset.i), el.textContent.trim())) changed = true;
    });
    // Safari が段落の中の区切り（span）を消してしまった場合は、「。」で分けて数が合えば割り当てる
    areaEl.querySelectorAll('p[data-para]').forEach((p) => {
      const idxs = state.sentences.map((s, i) => (String(s.para) === p.dataset.para ? i : -1)).filter((i) => i >= 0);
      if (p.querySelectorAll('[data-i]').length === idxs.length) return;
      const text = p.textContent.trim();
      if (!JA_RE.test(text)) return;
      const parts = (text.match(/[^。！？!?]+[。！？!?]*/g) || []).map((t) => t.trim()).filter(Boolean);
      if (parts.length !== idxs.length) return;
      idxs.forEach((i, k) => { if (setAutoTranslation(i, parts[k])) changed = true; });
    });
    if (changed) save();
  }

  // ---------- 設定 ----------
  const rateEl = $('#rate');
  const rateLabel = $('#rate-label');
  rateEl.value = state.settings.rate;
  rateLabel.textContent = `×${Number(state.settings.rate).toFixed(2)}`;
  rateEl.addEventListener('input', () => {
    state.settings.rate = Number(rateEl.value);
    rateLabel.textContent = `×${state.settings.rate.toFixed(2)}`;
    saveSoon();
  });

  const voiceEl = $('#voice');
  function renderVoices() {
    const voices = englishVoices().sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
    const cur = currentVoice();
    voiceEl.textContent = '';
    if (voices.length === 0) {
      voiceEl.appendChild(new Option('（標準）', ''));
      return;
    }
    voices.forEach((v) => voiceEl.appendChild(new Option(`${v.name} (${v.lang})`, v.voiceURI, false, cur && v.voiceURI === cur.voiceURI)));
  }
  voiceEl.addEventListener('change', () => { state.settings.voiceURI = voiceEl.value; save(); });
  if (synth) {
    renderVoices();
    synth.addEventListener('voiceschanged', renderVoices);
  }

  const modeEl = $('#translate-mode');
  modeEl.value = state.settings.translateMode;
  modeEl.addEventListener('change', () => {
    state.settings.translateMode = modeEl.value;
    save();
    renderTranslateArea();
  });

  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('入力した英文・訳・スコアをすべて消します。よろしいですか？')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* 消せなくても再読み込みする */ }
    location.reload();
  });

  // ---------- 起動 ----------
  renderSentences();
  renderTranslateArea();
  if (state.sentences.length) $('#input-panel').open = false;
})();

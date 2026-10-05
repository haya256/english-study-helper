(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  // ---------- 状態と保存 ----------
  let state = Store.load();
  document.documentElement.dataset.hand = state.settings.hand; // 画面が一瞬逆側に描かれないよう最初に反映する
  function save() { clearTimeout(saveTimer); Store.save(state); }
  let saveTimer = null;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); }

  // ---------- 入力と分割 ----------
  // 長すぎる入力は、保存容量や画面の文の数で破綻しないよう、分割の前に止める
  const MAX_CHARS = 20000;
  const MAX_SENTENCES = 1000;
  const sourceEl = $('#source');
  const countEl = $('#source-count');
  sourceEl.value = state.source;
  sourceEl.addEventListener('input', () => { state.source = sourceEl.value; updateCount(); saveSoon(); });

  function updateCount(message) {
    const n = sourceEl.value.length;
    const over = n > MAX_CHARS;
    countEl.textContent = message || `${n.toLocaleString()} / ${MAX_CHARS.toLocaleString()} 文字` +
      (over ? '（多すぎます。減らしてください）' : '');
    countEl.classList.toggle('over', over || Boolean(message));
  }
  updateCount();

  $('#btn-split').addEventListener('click', () => {
    if (sourceEl.value.length > MAX_CHARS) { updateCount(); sourceEl.focus(); return; }
    const parts = Splitter.splitSentences(sourceEl.value);
    if (parts.length > MAX_SENTENCES) {
      updateCount(`文が ${parts.length.toLocaleString()} 個あります。${MAX_SENTENCES.toLocaleString()} 個以下になるよう減らしてください`);
      return;
    }
    // 同じ英文の訳とベストスコアは引き継ぐ
    const prev = new Map(state.sentences.map((s) => [s.en, s]));
    state.sentences = parts.map(({ en, para }) => {
      const p = prev.get(en);
      return { en, para, ja: p ? p.ja : '', jaManual: p ? p.jaManual : false, best: p ? p.best : null };
    });
    save();
    renderSentences();
    if (state.sentences.length) {
      $('#input-panel').open = false;
      $('#translate-panel').scrollIntoView({ behavior: 'smooth' });
    }
  });

  $('#btn-clear-source').addEventListener('click', () => {
    sourceEl.value = '';
    state.source = '';
    updateCount();
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

  // 翻訳のしかたは i ボタンで開閉する
  $('#btn-translate-help').addEventListener('click', (e) => {
    const help = $('#translate-help');
    help.hidden = !help.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!help.hidden));
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
      // 訳はふだん普通の文として表示し、✎ を押したときだけ入力欄にする
      const ja = li.querySelector('.ja');
      renderJa(li, s);
      ja.addEventListener('input', () => {
        s.ja = ja.value;
        s.jaManual = ja.value.trim() !== '';
        fitHeight(ja);
        saveSoon();
      });
      li.querySelector('.btn-ja-edit').addEventListener('click', () => {
        li.querySelector('.ja-view').hidden = true;
        li.querySelector('.ja-edit').hidden = false;
        ja.value = s.ja || '';
        fitHeight(ja);
        ja.focus();
      });
      li.querySelector('.btn-ja-done').addEventListener('click', () => {
        save();
        renderJa(li, s);
      });
      li.querySelector('.btn-speak').addEventListener('click', () => toggleSpeak(i));
      li.querySelector('.btn-ja-speak').addEventListener('click', () => toggleSpeak(i, 'ja'));
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
    $('#translate-panel').hidden = state.sentences.length === 0;
  }

  function renderJa(li, s) {
    const text = (s.ja || '').trim();
    const p = li.querySelector('.ja-text');
    p.textContent = text || '訳なし';
    p.classList.toggle('empty', !text);
    li.querySelector('.btn-ja-edit').textContent = text ? '✎' : '✎ 訳を入力';
    li.querySelector('.btn-ja-speak').hidden = !text;
    li.querySelector('.ja-view').hidden = false;
    li.querySelector('.ja-edit').hidden = true;
  }

  function fitHeight(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
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
  // 英文（lang='en'）と訳（lang='ja'）を読み上げる。今読んでいるものは { i, lang } で持つ
  const synth = window.speechSynthesis;
  let speaking = null;
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
  function japaneseVoices() {
    return synth ? synth.getVoices().filter((v) => /^ja[-_]/i.test(v.lang)) : [];
  }
  function japaneseVoice() {
    const voices = japaneseVoices();
    return voices.find((v) => v.voiceURI === state.settings.voiceJaURI)
      || voices.find((v) => /kyoko/i.test(v.name))
      || voices.find((v) => v.default)
      || voices[0] || null;
  }

  function isSpeaking(i, lang) { return speaking && speaking.i === i && speaking.lang === lang; }

  function markSpeaking(sp, on) {
    const li = sp && cardAt(sp.i);
    if (!li) return;
    if (sp.lang === 'en') li.classList.toggle('speaking', on);
    li.querySelector(sp.lang === 'en' ? '.btn-speak' : '.btn-ja-speak').classList.toggle('active', on);
  }

  function stopSpeaking() {
    playAll = false;
    markSpeaking(speaking, false);
    speaking = null;
    if (synth) synth.cancel();
    $('#btn-play-all').textContent = '▶ 全部読む';
  }

  function speak(i, onDone, lang = 'en') {
    if (!synth) { alert('この端末では読み上げが使えません'); return; }
    // 前の発話の onend が cancel() で呼ばれても続きを再生しないよう、先に null にする
    markSpeaking(speaking, false);
    speaking = null;
    // iOS では cancel() の直後に speak() すると無音になることがあるので、話している時だけ止める
    if (synth.speaking || synth.pending) synth.cancel();
    const s = state.sentences[i];
    const u = new SpeechSynthesisUtterance(lang === 'en' ? s.en : s.ja);
    if (lang === 'en') {
      const v = currentVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.rate = Number(state.settings.rate);
      u.volume = Number(state.settings.volume);
    } else {
      const v = japaneseVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'ja-JP';
      u.rate = Number(state.settings.rateJa);
      u.volume = Number(state.settings.volumeJa);
    }
    const me = { i, lang };
    u.onend = u.onerror = () => {
      if (speaking !== me) return;
      markSpeaking(me, false);
      speaking = null;
      if (onDone) onDone();
    };
    speaking = me;
    markSpeaking(me, true);
    synth.speak(u);
  }

  function toggleSpeak(i, lang = 'en') {
    if (isSpeaking(i, lang)) { stopSpeaking(); return; }
    stopRecognition();
    playAll = false;
    $('#btn-play-all').textContent = '▶ 全部読む';
    speak(i, null, lang);
  }

  $('#btn-play-all').addEventListener('click', () => {
    if (playAll) { stopSpeaking(); return; }
    stopRecognition();
    playAll = true;
    $('#btn-play-all').textContent = '■ 止める';
    // 1文ごとに「英語→日本語→英語」をそれぞれ設定の回数だけ読む。訳がない文の日本語は飛ばす
    const counts = state.settings.playAllCounts;
    if (counts.every((n) => n === 0)) {
      stopSpeaking();
      alert('設定の「全部読む」の読み方で、どれかを1回以上にしてください');
      return;
    }
    const queue = [];
    state.sentences.forEach((s, i) => ['en', 'ja', 'en'].forEach((lang, k) => {
      if (lang === 'ja' && !(s.ja && s.ja.trim())) return;
      for (let n = 0; n < counts[k]; n++) queue.push({ i, lang });
    }));
    if (queue.length === 0) {
      stopSpeaking();
      alert('読み上げる訳がありません。② で訳をつけてください');
      return;
    }
    const next = (k) => {
      if (!playAll || k >= queue.length) { stopSpeaking(); return; }
      const { i, lang } = queue[k];
      if (k === 0 || queue[k - 1].i !== i) cardAt(i).scrollIntoView({ behavior: 'smooth', block: 'center' });
      speak(i, () => next(k + 1), lang);
    };
    next(0);
  });

  // ---------- 発音チェック（音声認識） ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;   // 聞き取り中のセッション { i, finish, abort }

  // 話し終えてから判定までの待ち時間（設定で変更できる。0 は ■ を押すまで待つ）
  const silenceMs = () => Number(state.settings.silenceSec) * 1000;
  const FIRST_SILENCE_MS = 10000; // 最初に何も聞こえないまま待つ時間
  const DONE_MS = 800;           // 文の最後まで言えたら、この時間待って判定する
  const MAX_MS = 60000;

  function setMicButton(i, on) {
    const li = cardAt(i);
    if (!li) return;
    const b = li.querySelector('.btn-mic');
    b.classList.toggle('recording', on);
    b.textContent = on ? '■ 終わる' : '🎤 話す';
  }

  function stopRecognition() {
    if (rec) rec.abort();
  }

  function toggleRecognition(i) {
    if (rec) {
      if (rec.i === i) { rec.finish(); return; }
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

  // ブラウザは息継ぎ程度の間でも認識を終えてしまうことがあるので、
  // こちらが「終わり」と決めるまでは認識を再開し、聞き取った内容をつなげていく
  function startRecognition(i) {
    const ref = state.sentences[i].en;
    const committed = [];  // 確定した部分ごとの候補 [[alt, alt, ...], ...]（再開をまたいで保持）
    let current = [];      // 今の認識インスタンスで確定した部分
    let interim = '';
    let errorText = '';
    let finished = false;
    let aborted = false;
    let r = null;
    let silenceTimer = null;
    const hardStop = setTimeout(finish, MAX_MS);

    const session = { i, finish, abort };
    rec = session;

    function transcript() {
      return committed.concat(current.filter(Boolean)).map((alts) => alts[0]).concat(interim).join(' ').trim();
    }
    function waitSilence(ms) { clearTimeout(silenceTimer); silenceTimer = setTimeout(finish, ms); }
    function clearTimers() { clearTimeout(silenceTimer); clearTimeout(hardStop); }
    function commit() {
      committed.push(...current.filter(Boolean));
      if (interim.trim()) committed.push([interim]);
      current = [];
      interim = '';
    }
    function cleanup() {
      clearTimers();
      if (rec === session) rec = null;
      setMicButton(i, false);
    }

    function finish() {
      if (finished) return;
      finished = true;
      clearTimers();
      if (r) { try { r.stop(); } catch (e) { done(); } } else done();
      // stop() の後に onend が来ない環境に備えて、少し待っても終わらなければ打ち切る
      setTimeout(() => {
        if (isDone || aborted) return;
        try { r.abort(); } catch (e) { /* すでに止まっている */ }
        commit();
        done();
      }, 2000);
    }
    function abort() {
      if (aborted) return;
      aborted = finished = true;
      if (r) { try { r.abort(); } catch (e) { /* すでに止まっている */ } }
      cleanup();
    }

    function spawn() {
      r = new SR();
      r.lang = 'en-US';
      r.interimResults = true;
      r.continuous = true;
      r.maxAlternatives = 3;

      r.onresult = (e) => {
        interim = '';
        for (let k = e.resultIndex; k < e.results.length; k++) {
          const res = e.results[k];
          if (res.isFinal) current[k] = Array.from(res).map((a) => a.transcript);
          else interim += res[0].transcript;
        }
        const text = transcript();
        if (!text) return;
        showMessage(i, '聞き取り中… ' + text);
        // 文の最後まで正しく言えていれば早めに判定する
        if (Compare.compare(ref, text).score === 100) waitSilence(DONE_MS);
        else if (silenceMs() > 0) waitSilence(silenceMs());
        else clearTimeout(silenceTimer);
      };
      r.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
          errorText = 'マイクか音声認識が許可されていません。「設定」アプリ → Safari → マイク、と「設定」→ Siri（音声入力）を確認してください。';
          finished = true;
        } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
          errorText = '音声認識でエラーが起きました（' + e.error + '）。';
          finished = true;
        }
      };
      r.onend = () => {
        commit();
        if (aborted) return;
        if (!finished) {
          try { spawn(); r.start(); return; } catch (e) { finished = true; }
        }
        done();
      };
    }

    let isDone = false;
    function done() {
      if (isDone) return;
      isDone = true;
      cleanup();
      if (committed.length === 0) {
        showMessage(i, errorText || '声が聞き取れませんでした。もう一度どうぞ。');
        return;
      }
      // 候補が複数あれば、一番点数が高い組み合わせを採用する
      const base = committed.map((alts) => alts[0]);
      let best = Compare.compare(ref, base.join(' '));
      committed.forEach((alts, k) => {
        alts.slice(1).forEach((alt) => {
          const trial = base.slice();
          trial[k] = alt;
          const r2 = Compare.compare(ref, trial.join(' '));
          if (r2.score > best.score) best = r2;
        });
      });
      showResult(i, best);
    }

    setMicButton(i, true);
    showMessage(i, silenceMs() > 0
      ? '話してください…（言い終えて少し黙るか、■ を押すと判定します）'
      : '話してください…（言い終えたら ■ を押してください）');
    if (silenceMs() > 0) waitSilence(FIRST_SILENCE_MS);
    try { spawn(); r.start(); } catch (e) {
      finished = true;
      cleanup();
      showMessage(i, '音声認識を開始できませんでした。');
    }
  }

  // ---------- 設定 ----------
  // 左右設定：ボタンを寄せる側。見た目は style.css の html[data-hand] で切り替える
  const handButtons = document.querySelectorAll('.hand-switch button');
  function applyHand() {
    document.documentElement.dataset.hand = state.settings.hand;
    handButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hand === state.settings.hand)));
  }
  handButtons.forEach((b) => b.addEventListener('click', () => {
    state.settings.hand = b.dataset.hand;
    applyHand();
    save();
  }));
  applyHand();

  // 設定は ⚙️ ボタンから開くシートに入れる。外側（暗いところ）を押しても閉じる
  const settingsSheet = $('#settings-panel');
  $('#btn-settings').addEventListener('click', () => settingsSheet.showModal());
  $('#btn-settings-close').addEventListener('click', () => settingsSheet.close());
  settingsSheet.addEventListener('click', (e) => {
    if (e.target !== settingsSheet) return;
    const r = settingsSheet.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) settingsSheet.close();
  });

  // 読み上げの速さと音量は英語と日本語で別々に持つ。声によって大きさが違うので音量で揃えられるようにする
  const sliders = [
    ['#rate', '#rate-label', 'rate', (v) => `×${v.toFixed(2)}`],
    ['#rate-ja', '#rate-ja-label', 'rateJa', (v) => `×${v.toFixed(2)}`],
    ['#volume', '#volume-label', 'volume', (v) => `${Math.round(v * 100)}%`],
    ['#volume-ja', '#volume-ja-label', 'volumeJa', (v) => `${Math.round(v * 100)}%`],
  ];
  sliders.forEach(([input, label, key, format]) => {
    const el = $(input);
    const labelEl = $(label);
    el.value = state.settings[key];
    labelEl.textContent = format(Number(state.settings[key]));
    el.addEventListener('input', () => {
      state.settings[key] = Number(el.value);
      labelEl.textContent = format(state.settings[key]);
      saveSoon();
    });
  });

  // 声の選択は英語と日本語で別々に持つ
  const voiceSelects = [
    [$('#voice'), englishVoices, currentVoice, 'voiceURI'],
    [$('#voice-ja'), japaneseVoices, japaneseVoice, 'voiceJaURI'],
  ];
  function renderVoices() {
    voiceSelects.forEach(([el, list, current]) => {
      const voices = list().sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
      const cur = current();
      el.textContent = '';
      if (voices.length === 0) {
        el.appendChild(new Option('（標準）', ''));
        return;
      }
      voices.forEach((v) => el.appendChild(new Option(`${v.name} (${v.lang})`, v.voiceURI, false, cur && v.voiceURI === cur.voiceURI)));
    });
  }
  voiceSelects.forEach(([el, , , key]) => el.addEventListener('change', () => { state.settings[key] = el.value; save(); }));
  if (synth) {
    renderVoices();
    synth.addEventListener('voiceschanged', renderVoices);
  }

  const silenceEl = $('#silence');
  silenceEl.value = String(state.settings.silenceSec);
  silenceEl.addEventListener('change', () => { state.settings.silenceSec = Number(silenceEl.value); save(); });

  document.querySelectorAll('.play-count').forEach((el, k) => {
    for (let n = 0; n <= 5; n++) el.appendChild(new Option(`${n}回`, String(n)));
    el.value = String(state.settings.playAllCounts[k]);
    el.addEventListener('change', () => { state.settings.playAllCounts[k] = Number(el.value); save(); });
  });

  const modeEl = $('#translate-mode');
  modeEl.value = state.settings.translateMode;
  modeEl.addEventListener('change', () => {
    state.settings.translateMode = modeEl.value;
    save();
  });

  function resetAll() {
    if (!confirm('入力した英文・訳・スコアをすべて消します。よろしいですか？')) return;
    // 再読み込み時の pagehide で今の状態が書き戻されないよう、保存を止めてから消す
    clearTimeout(saveTimer);
    window.removeEventListener('pagehide', save);
    Store.clear();
    location.reload();
  }
  $('#btn-reset').addEventListener('click', resetAll);
  $('#btn-reset-top').addEventListener('click', resetAll);

  // ---------- 起動 ----------
  renderSentences();
  if (state.sentences.length) $('#input-panel').open = false;

  // 翻訳ページへ移る前に保存し、戻ってきたら翻訳ページで入った訳を読み込む
  window.addEventListener('pagehide', save);
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    const fresh = Store.load();
    if (fresh.sentences.length !== state.sentences.length) { state = fresh; renderSentences(); return; }
    fresh.sentences.forEach((s, i) => {
      state.sentences[i].ja = s.ja;
      state.sentences[i].jaManual = s.jaManual;
      const li = cardAt(i);
      if (li) renderJa(li, state.sentences[i]);
    });
  });
})();

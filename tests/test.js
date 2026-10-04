// node tests/test.js で実行する
const assert = require('assert');
const { splitSentences } = require('../splitter.js');
const { compare } = require('../compare.js');

let failed = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
const en = (t) => splitSentences(t).map((s) => s.en);

// --- 分割 ---
test('基本の分割', () => assert.deepStrictEqual(en('I like cats. Do you? Yes!'), ['I like cats.', 'Do you?', 'Yes!']));
test('敬称で切らない', () => assert.deepStrictEqual(en('Mr. Smith met Dr. Brown. They talked.'), ['Mr. Smith met Dr. Brown.', 'They talked.']));
test('e.g. で切らない', () => assert.deepStrictEqual(en('Use fruit, e.g. apples. Good.'), ['Use fruit, e.g. apples.', 'Good.']));
test('小数で切らない', () => assert.deepStrictEqual(en('It costs 3.5 dollars. Cheap.'), ['It costs 3.5 dollars.', 'Cheap.']));
test('頭文字で切らない', () => assert.deepStrictEqual(en('J. K. Rowling wrote it. Wow.'), ['J. K. Rowling wrote it.', 'Wow.']));
test('引用符の中の文末', () => assert.deepStrictEqual(en('"Wow!" she said. "Really?" He nodded.'), ['"Wow!" she said.', '"Really?"', 'He nodded.']));
test('文末の U.S.', () => assert.deepStrictEqual(en('He moved to the U.S. She stayed.'), ['He moved to the U.S.', 'She stayed.']));
test('行の途中の改行をつなぐ', () => assert.deepStrictEqual(en('This is a\nlong sentence.\n\nNew para.'), ['This is a long sentence.', 'New para.']));
test('No. 5 で切らない', () => assert.deepStrictEqual(en('Room No. 5 is free. I said no. Then left.'), ['Room No. 5 is free.', 'I said no.', 'Then left.']));
test('段落の番号', () => assert.deepStrictEqual(splitSentences('A b. C d.\n\nE f.').map((s) => s.para), [0, 0, 1]));

test('長すぎる文はカンマで分ける', () => {
  const clause = 'this clause has quite a few words in it to make it long';
  const long = Array(12).fill(clause).join(', ') + '.';
  const out = en(long);
  assert.ok(out.length > 1);
  assert.ok(out.every((t) => t.length <= 400));
  assert.strictEqual(out.join(' ').replace(/\s+/g, ' '), long);
});
test('句読点のない長文は単語の切れ目で分ける', () => {
  const long = Array(300).fill('word').join(' ');
  const out = en(long);
  assert.ok(out.every((t) => t.length <= 400 && !/^ | $/.test(t)));
  assert.strictEqual(out.join(' '), long);
});
test('空白のない長い文字列は文字数で分ける', () => {
  const out = en('x'.repeat(1000));
  assert.deepStrictEqual(out.map((t) => t.length), [400, 400, 200]);
});

// --- 比較 ---
const score = (a, b) => compare(a, b).score;
test('完全一致', () => assert.strictEqual(score('I like cats.', 'i like cats'), 100));
test("I've = I have", () => assert.strictEqual(score("I've got it.", 'I have got it'), 100));
test("don't = do not", () => assert.strictEqual(score("I don't know.", 'I do not know'), 100));
test("can't = cannot", () => assert.strictEqual(score("I can't swim.", 'I cannot swim'), 100));
test("won't = will not", () => assert.strictEqual(score("It won't work.", 'it will not work'), 100));
test("he's = he is", () => assert.strictEqual(score("He's tall.", 'he is tall'), 100));
test("he's = he has", () => assert.strictEqual(score("He's gone.", 'he has gone'), 100));
test("he isn't = he's not", () => assert.strictEqual(score("He isn't here.", "he's not here"), 100));
test("I'd = I would", () => assert.strictEqual(score("I'd like tea.", 'I would like tea'), 100));
test("let's = let us", () => assert.strictEqual(score("Let's go.", 'let us go'), 100));
test('曲線アポストロフィ', () => assert.strictEqual(score('I’m fine.', "I'm fine"), 100));
test('数字 = 英単語', () => assert.strictEqual(score('I have 3 cats.', 'I have three cats'), 100));
test('大きな数字', () => assert.strictEqual(score('It is 1,250 km.', 'it is one thousand two hundred fifty km'), 100));
test('パーセント', () => assert.strictEqual(score('Up 10%.', 'up ten percent'), 100));
test('序数', () => assert.strictEqual(score('The 21st century.', 'the twenty first century'), 100));
test('ハイフン', () => assert.strictEqual(score('A well-known fact.', 'a well known fact'), 100));
test('ok = okay', () => assert.strictEqual(score("It's OK.", "it's okay"), 100));
test('所有格は is にしない', () => assert.notStrictEqual(score("John's book.", 'John is book'), 100));
test('抜けた語', () => {
  const r = compare('I like big cats.', 'I like cats');
  assert.strictEqual(r.score, 75);
  assert.deepStrictEqual(r.ref.map((w) => w.status), ['ok', 'ok', 'miss', 'ok']);
});
test('余分な語', () => {
  const r = compare('I like cats.', 'I really like cats');
  assert.strictEqual(r.score, 100);
  assert.deepStrictEqual(r.hyp.map((w) => w.status), ['ok', 'extra', 'ok', 'ok']);
});
test('言い間違い', () => assert.strictEqual(score('I like cats.', 'I like hats'), 67));
test('空の発話', () => assert.strictEqual(score('Hello.', ''), 0));

if (failed) { console.log(`\n${failed} 件失敗`); process.exit(1); }
console.log('\nすべて成功');

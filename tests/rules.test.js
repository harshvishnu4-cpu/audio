// The "Read-Aloud Scoring Rules" doc, one test per rule. Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../public/js/scoring.js');

const P1 = 'Every morning my grandmother and I go for a walk in the park. We look at the birds, the trees and the flowers. On the way home, we buy fresh fruit from the market.';

// engine-style words: "word" or { w, conf, gap }
function heard(items, { dur = 0.28, gap = 0.06 } = {}) {
  let t = 0.2; const out = [];
  items.forEach((it, k) => {
    const o = typeof it === 'string' ? { w: it } : it;
    if (k) t += o.gap ?? gap;
    out.push({ word: o.w, conf: o.conf ?? 0.98, start: +t.toFixed(2), end: +(t + dur).toFixed(2) });
    t += dur;
  });
  return out;
}
const say = text => S.tokenize(text).map(t => t.n);
const word = (r, n) => r.words.find(w => w.n === n);
const swap = (arr, from, to) => arr.map(w => (w === from ? to : w));

// ---------- count as an error ----------
test('error: skipping a word costs one', () => {
  const r = S.analyse({ text: P1, primary: heard(say(P1).filter(w => w !== 'fresh')) });
  assert.deepEqual([word(r, 'fresh').rule, word(r, 'fresh').outcome, word(r, 'fresh').cost], ['skip', 'error', 1]);
  assert.equal(r.counts.errorCost, 1);
});

test('error: stopping before the end — every unread word counts as skipped', () => {
  const all = say(P1), r = S.analyse({ text: P1, primary: heard(all.slice(0, all.length - 4)) });
  const tail = r.words.slice(-4);
  assert.ok(tail.every(w => w.rule === 'stopped-early' && w.cost === 1));
  assert.equal(r.counts.errorCost, 4);
});

test('error: adding a word', () => {
  const s = say(P1); s.splice(s.indexOf('trees'), 0, 'very');
  const r = S.analyse({ text: P1, primary: heard(s) });
  const x = r.extras.find(e => e.word === 'very');
  assert.deepEqual([x.kind, x.rule, x.outcome, x.cost], ['added', 'added', 'error', 1]);
});

test('error: a look-alike swap both passes heard ("horse" for "house") is an error, not an accent tip', () => {
  const text = 'The house is near the river.';
  const said = heard(swap(say(text), 'house', 'horse'));
  const r = S.analyse({ text, primary: said, open: said });
  assert.equal(word(r, 'house').status, 'change');
  assert.equal(word(r, 'house').rule, 'similar-word');
  assert.equal(word(r, 'house').cost, 1);
});

test('error: changing the word order is one error, not two', () => {
  const text = 'It was a sunny day in the park.';
  const r = S.analyse({ text, primary: heard(['was', 'it', 'a', 'sunny', 'day', 'in', 'the', 'park']) });
  assert.equal(word(r, 'it').rule, 'order');
  assert.equal(r.counts.errorCost, 1);
});

test('error: dropping a word ending and adding one', () => {
  const r1 = S.analyse({ text: P1, primary: heard(swap(say(P1), 'flowers', 'flower')) });
  assert.equal(word(r1, 'flowers').rule, 'dropped-ending');
  const r2 = S.analyse({ text: P1, primary: heard(swap(say(P1), 'fresh', 'freshest')) });
  assert.deepEqual([word(r2, 'fresh').rule, word(r2, 'fresh').cost], ['added-ending', 1]);
  assert.equal(S.addedEnding('understand', 'understands'), 's');
});

test('error: changing the tense', () => {
  const text = 'Yesterday we went to the market.';
  const r = S.analyse({ text, primary: heard(swap(say(text), 'went', 'goes')) });
  assert.deepEqual([word(r, 'went').rule, word(r, 'went').cost], ['tense', 1]);
});

test('error: numbers and short forms — "twenty one" for "21" is right, "two one" is one error', () => {
  const text = 'Dr Rao has 21 cats.';
  const ok = S.analyse({ text, primary: heard(['doctor', 'rao', 'has', 'twenty', 'one', 'cats']) });
  assert.equal(ok.accuracy, 100);
  const bad = S.analyse({ text, primary: heard(['doctor', 'rao', 'has', 'two', 'one', 'cats']) });
  assert.equal(bad.words[3].rule, 'number');
  assert.equal(bad.counts.errorCost, 1);
  assert.ok(S.grammarFor(text, 'sentences').includes('doctor rao has twenty one cats'));
  assert.deepEqual(S.spokenForms('1998')[0], ['nineteen', 'ninety', 'eight']);
});

// ---------- count as a minor error ----------
test('minor: swapping small words ("a" for "the") weighs half', () => {
  const s = say(P1), i = s.indexOf('park') - 1; s[i] = 'a';
  const r = S.analyse({ text: P1, primary: heard(s) });
  const w = r.words[i];
  assert.deepEqual([w.rule, w.outcome, w.cost], ['small-word', 'minor', 0.5]);
  assert.equal(r.counts.errorCost, 0.5);
  assert.equal(r.accuracy, Math.round(100 * (34 - 0.5) / 34));
});

test('minor: a word that means the same ("kids" for "children")', () => {
  const text = 'The children play in the garden.';
  const r = S.analyse({ text, primary: heard(swap(say(text), 'children', 'kids')) });
  assert.deepEqual([word(r, 'children').rule, word(r, 'children').outcome], ['same-meaning', 'minor']);
});

test('minor: saying the punctuation aloud ("full stop" counts once)', () => {
  const s = say(P1); s.splice(s.indexOf('park') + 1, 0, 'full', 'stop');
  const r = S.analyse({ text: P1, primary: heard(s) });
  assert.equal(r.extras.filter(x => x.rule === 'punctuation').length, 1);
  assert.equal(r.counts.errorCost, 0.5);
});

test('the minor weight is a setting (still to agree)', () => {
  const s = say(P1), i = s.indexOf('park') - 1; s[i] = 'a';
  const r = S.analyse({ text: P1, primary: heard(s), config: { rules: { minorWeight: 0.25 } } });
  assert.equal(r.counts.errorCost, 0.25);
});

// ---------- count only if hard to understand ----------
test('only if unclear: a word neither pass could make out counts on a clear recording, not on a noisy one', () => {
  const s = say(P1), primary = heard(s.map(w => (w === 'grandmother' ? { w: '[unk]', conf: 0.3 } : w)));
  const open = primary.filter(w => w.word !== '[unk]');
  const clear = S.analyse({ text: P1, primary, open, snrDb: 40 });
  assert.deepEqual([word(clear, 'grandmother').outcome, word(clear, 'grandmother').cost], ['unclear', 1]);
  const noisy = S.analyse({ text: P1, primary, open, snrDb: 18 });
  assert.equal(word(noisy, 'grandmother').cost, 0);
});

// ---------- note only ----------
test('note only: fillers, repeats and losing the place never lower the score', () => {
  const s = say(P1), i = s.indexOf('we');
  const withExtras = [...s.slice(0, i), 'um', ...s.slice(0, 6), ...s.slice(i)]; // "um", then re-reads the start of line 1
  const r = S.analyse({ text: P1, primary: heard(withExtras) });
  assert.equal(r.accuracy, 100);
  assert.ok(r.extras.some(x => x.rule === 'filler' && x.outcome === 'note'));
  assert.ok(r.extras.some(x => x.rule === 'lost-place'));
  assert.ok(r.notes.length >= 2);
});

test('note only: a long hesitation is recorded but does not lower phrasing', () => {
  const s = say(P1).map((w, k) => (k === 5 ? { w, gap: 3.0 } : w));
  const r = S.analyse({ text: P1, primary: heard(s) });
  assert.ok(r.notes.some(n => n.rule === 'long-hesitation'));
  assert.equal(r.pauses.stuck.length, 1);
  assert.equal(r.accuracy, 100);
});

// ---------- not an error ----------
test('not an error: correcting yourself with "no" ("foot, no, fruit")', () => {
  const s = say(P1); s.splice(s.indexOf('fruit'), 0, 'foot', 'no');
  const r = S.analyse({ text: P1, primary: heard(s) });
  assert.equal(r.accuracy, 100);
  assert.equal(word(r, 'fruit').rule, 'self-correction');
});

test('not an error: reading the title or the instructions first', () => {
  const r = S.analyse({ text: P1, primary: heard(['read', 'aloud', 'morning', 'walk', ...say(P1)]) });
  assert.equal(r.accuracy, 100);
  assert.ok(r.extras.every(x => x.rule === 'title-or-instructions'));
});

test('not an error: "don\'t" for "do not", and the other way round', () => {
  const text = 'They do not understand the question.';
  assert.equal(S.analyse({ text, primary: heard(['they', "don't", 'understand', 'the', 'question']) }).accuracy, 100);
  const text2 = "They don't understand the question.";
  assert.equal(S.analyse({ text: text2, primary: heard(['they', 'do', 'not', 'understand', 'the', 'question']) }).accuracy, 100);
});

test('not an error: a name said differently (unless the passage teaches names)', () => {
  const text = 'Every day we meet Priya at the park.';
  const said = heard(swap(say(text), 'priya', 'preeya'));
  const r = S.analyse({ text, primary: said });
  assert.deepEqual([word(r, 'priya').rule, word(r, 'priya').cost], ['name', 0]);
  assert.equal(r.accuracy, 100);
  const taught = S.analyse({ text, primary: said, config: { rules: { namesTaught: true } } });
  assert.equal(word(taught, 'priya').cost, 1);
});

test('not an error: background noise', () => {
  const s = say(P1); s.splice(4, 0, '[unk]');
  const r = S.analyse({ text: P1, primary: heard(s) });
  assert.equal(r.accuracy, 100);
});

test('repeated mistakes of the same kind: every time by default, once when set (still to agree)', () => {
  const s = swap(swap(say(P1), 'flowers', 'flower'), 'birds', 'bird');
  assert.equal(S.analyse({ text: P1, primary: heard(s) }).counts.errorCost, 2);
  assert.equal(S.analyse({ text: P1, primary: heard(s), config: { rules: { sameKindRepeats: 'once' } } }).counts.errorCost, 1);
});

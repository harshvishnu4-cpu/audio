// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../public/js/scoring.js');

const P1 = 'Every morning my grandmother and I go for a walk in the park. We look at the birds, the trees and the flowers. On the way home, we buy fresh fruit from the market.';
const P2 = 'A good listener looks at the speaker and waits for their turn to talk. They ask questions when they do not understand. Listening carefully helps us speak with confidence.';

// Build engine-style words. Items are "word" or { w, conf, gap } (gap = silence before this word).
function heard(items, { dur = 0.28, gap = 0.06, stopGap = 0.4, text = '' } = {}) {
  let t = 0.2; const out = []; const stops = new Set();
  // add natural pauses after words that end a sentence or clause in the passage
  if (text) S.tokenize(text).forEach(tk => { if (tk.endsSentence || tk.endsClause) stops.add(tk.n); });
  items.forEach((it, k) => {
    const o = typeof it === 'string' ? { w: it } : it;
    const prev = out[out.length - 1];
    const g = o.gap ?? (prev && stops.has(prev.word) ? stopGap : gap);
    if (k) t += g;
    out.push({ word: o.w, conf: o.conf ?? 0.98, start: +t.toFixed(2), end: +(t + dur).toFixed(2) });
    t += dur;
  });
  return out;
}
const words = text => S.tokenize(text).map(t => t.n);

test('a perfect reading scores full accuracy and praise', () => {
  const r = S.analyse({ text: P1, primary: heard(words(P1), { text: P1 }) });
  assert.equal(r.accuracy, 100);
  assert.equal(r.counts.correct, r.counts.total);
  assert.equal(r.mistakes.length, 0);
  assert.equal(r.rubric.accuracy.marks, 4);
  assert.equal(r.message.tone, 'praise');
});

test('skips are typed and small words do not change the meaning', () => {
  const said = words(P1).filter((w, i) => !(w === 'my' || (w === 'fresh')));
  const r = S.analyse({ text: P1, primary: heard(said, { text: P1 }) });
  const my = r.words.find(w => w.n === 'my'), fresh = r.words.find(w => w.n === 'fresh');
  assert.equal(my.status, 'skip'); assert.equal(my.meaning, 'same');
  assert.equal(fresh.status, 'skip'); assert.equal(fresh.meaning, 'changes');
  assert.equal(r.mistakes[0].word, 'fresh', 'the meaning-changing skip comes first');
});

test('a different word is a change that changes the meaning, listed first', () => {
  const said = words(P1).map(w => (w === 'park' ? 'garden' : w));
  const r = S.analyse({ text: P1, primary: heard(said, { text: P1 }) });
  const park = r.words.find(w => w.n === 'park');
  assert.equal(park.status, 'change'); assert.equal(park.heard, 'garden'); assert.equal(park.meaning, 'changes');
  assert.match(r.message.lead, /park.*garden/);
});

test('dropping -s again and again is named as one pattern with the reader\'s own examples', () => {
  const said = words(P1).map(w => ({ birds: 'bird', trees: 'tree', flowers: 'flower' }[w] || w));
  const r = S.analyse({ text: P1, primary: heard(said, { text: P1 }) });
  const p = r.patterns.find(x => x.id === 'ending-s');
  assert.ok(p, 'pattern found');
  assert.match(p.text, /birds → bird/);
  assert.equal(r.words.find(w => w.n === 'birds').meaning, 'small');
});

test('repeating a word is not an error', () => {
  const said = words(P2); said.splice(said.indexOf('speaker'), 0, 'the');
  const r = S.analyse({ text: P2, primary: heard(said, { text: P2 }) });
  assert.equal(r.counts.repeats, 1);
  assert.equal(r.counts.added, 0);
  assert.equal(r.accuracy, 100);
});

test('correcting yourself straight away is not an error', () => {
  const said = words(P2); said.splice(said.indexOf('questions'), 0, 'question');
  const r = S.analyse({ text: P2, primary: heard(said, { text: P2 }) });
  assert.equal(r.counts.selfCorrected, 1);
  assert.equal(r.words.find(w => w.n === 'questions').selfCorrected, 'question');
  assert.equal(r.accuracy, 100);
});

test('a real added word counts, and content words change the meaning', () => {
  const said = words(P2); said.splice(said.indexOf('questions'), 0, 'many');
  const r = S.analyse({ text: P2, primary: heard(said, { text: P2 }) });
  assert.equal(r.counts.added, 1);
  assert.equal(r.extras.find(x => x.kind === 'added').word, 'many');
});

test('an accent: the passage pass hears the word, the open pass hears a close sound -> tip, not a mistake', () => {
  const primary = heard(words(P1), { text: P1 });
  const open = primary.map(w => (w.word === 'park' ? { ...w, word: 'part' } : w));
  const r = S.analyse({ text: P1, primary, open });
  const park = r.words.find(w => w.n === 'park');
  assert.equal(park.status, 'tip'); assert.equal(park.soundedLike, 'part');
  assert.equal(r.accuracy, 100);
  assert.equal(r.clarity, Math.round(100 * (r.words.length - 1) / r.words.length));
});

test('the open pass catches an added word the passage pass could not name', () => {
  const primary = heard(words(P2), { text: P2 });
  // "many" said between "ask" and "questions": shift later words to make room
  const k = primary.findIndex(w => w.word === 'questions');
  const shifted = primary.map((w, i) => (i >= k ? { ...w, start: +(w.start + 0.4).toFixed(2), end: +(w.end + 0.4).toFixed(2) } : w));
  const open = [...shifted.slice(0, k), { word: 'many', conf: 0.95, start: shifted[k - 1].end + 0.05, end: shifted[k - 1].end + 0.35 }, ...shifted.slice(k)];
  const r = S.analyse({ text: P2, primary: shifted, open });
  assert.equal(r.counts.added, 1);
  assert.equal(r.extras.find(x => x.kind === 'added').word, 'many');
});

test('pauses: good at full stops, a hesitation mid-phrase, getting stuck, running past a stop', () => {
  const items = words(P2).map(w => ({ w }));
  items[words(P2).indexOf('speaker')].gap = 1.2;   // hesitation
  items[words(P2).indexOf('not')].gap = 2.5;       // stuck
  const r = S.analyse({ text: P2, primary: heard(items, { text: P2 }) });
  assert.equal(r.pauses.hesitations.length, 1); assert.equal(r.pauses.hesitations[0].before, 'speaker');
  assert.equal(r.pauses.stuck.length, 1); assert.equal(r.pauses.stuck[0].before, 'not');
  assert.equal(r.pauses.good, r.pauses.stops);
  assert.ok(r.patterns.find(p => p.id === 'mid-pause'));

  const rushed = S.analyse({ text: P2, primary: heard(words(P2), { stopGap: 0.05, text: P2 }) });
  assert.equal(rushed.pauses.rushed.length, 2);
  assert.ok(rushed.patterns.find(p => p.id === 'rushed'));
});

test('reading one word at a time is noticed', () => {
  const r = S.analyse({ text: P1, primary: heard(words(P1), { gap: 0.45, text: P1 }) });
  assert.equal(r.wordByWord, true);
  assert.ok(r.patterns.find(p => p.id === 'word-by-word'));
  assert.ok(r.rubric.phrasing.marks <= 2);
});

test('speed is timed from the first word to the last', () => {
  const primary = heard(words(P1), { text: P1 }).map(w => ({ ...w, start: w.start + 5, end: w.end + 5 })); // 5 s of silence first
  const r = S.analyse({ text: P1, primary });
  const span = primary[primary.length - 1].end - primary[0].start;
  assert.equal(r.readingSec, +span.toFixed(2));
  assert.equal(r.wcpm, Math.round(r.counts.correct / (span / 60)));
});

test('rubric adds up to 10 and the message follows the total', () => {
  const r = S.analyse({ text: P1, primary: heard(words(P1).slice(0, 15), { text: P1 }) });
  assert.equal(r.rubric.max, 10);
  assert.equal(r.rubric.total, r.rubric.accuracy.marks + r.rubric.pace.marks + r.rubric.phrasing.marks);
  assert.equal(r.message.tone, 'guide');
});

test('grammar includes learner variants for the passage pass', () => {
  const g = S.grammarFor(P1, 'sentences');
  assert.ok(g.includes('bird') && g.includes('birds'));
  assert.ok(g.some(x => x.split(' ').length > 5), 'whole sentences included');
});

test('pauses come from audio silence when given, because engine word times run into each other', () => {
  // word times with no gaps at all (how the engine reports them)
  let t = 0.2; const primary = words(P1).map(w => { const d = w === 'my' ? 1.2 : 0.3; const o = { word: w, conf: 0.98, start: +t.toFixed(2), end: +(t + d).toFixed(2) }; t += d; return o; });
  const none = S.analyse({ text: P1, primary });
  assert.equal(none.pauses.good, 0);
  // the audio shows a 0.4 s silence inside the last part of every word that ends a sentence or clause,
  // and a 0.9 s silence before "grandmother"
  const silences = [];
  S.tokenize(P1).forEach((tk, i) => {
    const w = primary[i];
    if ((tk.endsSentence || tk.endsClause) && i < primary.length - 1) silences.push({ from: w.end - 0.2, to: w.end + 0.2 });
    if (tk.n === 'my') silences.push({ from: w.start + 0.25, to: w.end - 0.05 }); // 0.9 s folded into the end of "my"
  });
  const r = S.analyse({ text: P1, primary, silences });
  assert.equal(r.pauses.measured, 'audio');
  assert.equal(r.pauses.good, r.pauses.stops);
  assert.equal(r.pauses.hesitations.length, 1);
  assert.equal(r.pauses.hesitations[0].before, 'grandmother');
});

test('an open-pass word where a passage word was skipped is a change, not a skip plus an addition', () => {
  const primary = heard(words(P1).filter(w => w !== 'fruit'), { text: P1 });
  const k = primary.findIndex(w => w.word === 'from');
  const shifted = primary.map((w, i) => (i >= k ? { ...w, start: +(w.start + 0.5).toFixed(2), end: +(w.end + 0.5).toFixed(2) } : w));
  const open = [...shifted.slice(0, k), { word: 'vegetables', conf: 0.9, start: shifted[k - 1].end + 0.05, end: shifted[k - 1].end + 0.45 }, ...shifted.slice(k)];
  const r = S.analyse({ text: P1, primary: shifted, open });
  const fruit = r.words.find(w => w.n === 'fruit');
  assert.equal(fruit.status, 'change'); assert.equal(fruit.heard, 'vegetables');
  assert.equal(r.counts.added, 0);
});

test('repeating a short phrase is a repeat, not an addition', () => {
  const said = words(P2); const k = said.indexOf('helps'); said.splice(k, 0, 'listening', 'carefully');
  const r = S.analyse({ text: P2, primary: heard(said, { text: P2 }) });
  assert.equal(r.counts.added, 0);
  assert.equal(r.counts.repeats, 2);
});

test('too noisy: flagged so nothing is scored', () => {
  const r = S.analyse({ text: P1, primary: heard(words(P1).slice(0, 12), { text: P1 }), snrDb: 9 });
  assert.equal(r.quality, 'too-noisy');
  assert.equal(r.tooNoisy, true);
});

test('noisy: small-word slips and unconfirmed dropped endings are not counted, content-word mistakes still are', () => {
  const said = words(P1).filter(w => w !== 'my').map(w => ({ park: 'garden', birds: 'bird' }[w] || w));
  const primary = heard(said, { text: P1 });
  const clean = S.analyse({ text: P1, primary, snrDb: 40 });
  assert.equal(clean.words.find(w => w.n === 'my').status, 'skip');
  assert.equal(clean.words.find(w => w.n === 'birds').status, 'change');
  const noisy = S.analyse({ text: P1, primary, snrDb: 18 });
  assert.equal(noisy.quality, 'noisy');
  assert.equal(noisy.words.find(w => w.n === 'my').status, 'unclear');
  assert.equal(noisy.words.find(w => w.n === 'birds').status, 'tip');
  assert.equal(noisy.words.find(w => w.n === 'park').status, 'change');
  assert.ok(noisy.accuracy > clean.accuracy);
});

test('noisy: a dropped ending both passes heard still counts', () => {
  const said = words(P1).map(w => (w === 'birds' ? 'bird' : w));
  const primary = heard(said, { text: P1 });
  const r = S.analyse({ text: P1, primary, open: primary, snrDb: 18 });
  assert.equal(r.words.find(w => w.n === 'birds').status, 'change');
});

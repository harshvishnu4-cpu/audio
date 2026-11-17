// Unseen passages: the passage bank is well formed and the learning plan counts it. Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');

global.self = global;
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.AnswerTasks = require('../public/js/tasks.js');
require('../public/js/course.js');
const S = require('../public/js/scoring.js');
const { UNSEEN } = global.Course;

test('six unseen passages across three levels, each with a unique id', () => {
  assert.equal(UNSEEN.length, 6);
  assert.deepEqual([...new Set(UNSEEN.map(p => p.level))].sort(), [1, 2, 3]);
  assert.equal(new Set(UNSEEN.map(p => p.id)).size, UNSEEN.length);
});

test('passages get longer with the level', () => {
  const avg = lvl => { const ps = UNSEEN.filter(p => p.level === lvl); return ps.reduce((t, p) => t + S.tokenize(p.text).length, 0) / ps.length; };
  assert.ok(avg(1) < avg(2) && avg(2) < avg(3), `${avg(1)} < ${avg(2)} < ${avg(3)}`);
  for (const p of UNSEEN) { const n = S.tokenize(p.text).length; assert.ok(n >= 45 && n <= 90, `${p.id}: ${n} words`); }
});

test('each passage has three questions with a valid answer, and the answers are not always in the same place', () => {
  const places = new Set();
  for (const p of UNSEEN) {
    assert.equal(p.questions.length, 3, p.id);
    for (const q of p.questions) {
      assert.ok(q.options.length === 3 && q.answer >= 0 && q.answer < q.options.length, `${p.id}: ${q.q}`);
      places.add(q.answer);
    }
  }
  assert.equal(places.size, 3);
});

test('a perfect reading of every unseen passage scores full accuracy', () => {
  for (const p of UNSEEN) {
    let t = 0.2;
    const primary = S.tokenize(p.text).flatMap(tk => { const f = S.spokenForms(tk.n); return f ? f[0] : [tk.n]; })
      .map(w => { const o = { word: w, conf: 0.97, start: +t.toFixed(2), end: +(t + 0.3).toFixed(2) }; t += 0.36; return o; });
    const r = S.analyse({ text: p.text, primary });
    assert.equal(r.accuracy, 100, p.id);
    assert.equal(r.counts.errorCost, 0, p.id);
  }
});

test('the learning plan has an unseen-passages lesson that counts the first readings', () => {
  const find = () => global.Course.lessons().find(l => l.id === 'unseen');
  assert.equal(find().href, 'unseen.html');
  assert.equal(find().done, false);
  localStorage.setItem('rc-unseen', JSON.stringify({ 'u-kite': { tries: 2, first: { at: '2026-11-17T10:00:00Z', total: 6 }, last: { at: '2026-11-17T11:00:00Z', total: 9 } } }));
  const l = find();
  assert.equal(l.done, true);
  assert.equal(l.best, 6, 'the unseen score is the first reading, not a practice one');
  assert.equal(l.meta, '1 of 6 read');
  assert.equal(l.last.total, 9);
});

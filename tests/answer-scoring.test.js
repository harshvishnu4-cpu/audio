// Run with: node --test tests/answer-scoring.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../public/js/answer-scoring.js');
const T = require('../public/js/tasks.js');

const leave = T.byId('w-leave-email');
const summary = T.byId('w-summary-listener');
const intro = T.byId('s-intro-job');
const weekend = T.byId('s-weekend');

const PRIYA = 'Respected Sir, I am writing this mail to inform that I want leave on next friday because my cousin marriage is there. I will complete my pending works before thursday and Rahul will see my calls. Kindly grant me leave. Thanking you, Priya';

test('the leave email from the report: key points found, common slips caught with fixes', () => {
  const r = A.evaluateWritten(leave, PRIYA);
  assert.equal(r.coverage.filter(c => c.hit).length, 4, JSON.stringify(r.coverage));
  const ids = A.grammarHits(PRIYA, { written: true }).map(h => h.id);
  for (const id of ['inform-that', 'on-next', 'day-capital', 'works']) assert.ok(ids.includes(id), id);
  assert.match(r.corrected, /inform you that/);
  assert.match(r.corrected, /next Friday/);
  assert.match(r.corrected, /pending work /);
  assert.match(r.corrected, /before Thursday/);
  assert.equal(r.criteria.find(c => c.id === 'task').score, 3, 'all points but short (52 words of 60–110)');
  assert.ok(r.improve.length <= 2);
  assert.ok(r.tips.some(t => t.id === 'respected-sir'), '"Respected Sir" is a tip, not an error');
});

test('the model answer scores at the top', () => {
  const r = A.evaluateWritten(leave, leave.model);
  assert.equal(r.criteria.find(c => c.id === 'task').score, 4);
  assert.equal(r.criteria.find(c => c.id === 'grammar').score, 4);
  assert.equal(r.criteria.find(c => c.id === 'organisation').score, 4);
  assert.ok(r.total >= 14, `total ${r.total}`);
});

test('a summary copied from the passage is capped and told to use own words', () => {
  const r = A.evaluateWritten(summary, summary.passage);
  assert.ok(r.criteria.find(c => c.id === 'task').score <= 2);
  assert.match(r.improve[0].why, /own words/);
});

test('missing key points are named', () => {
  const r = A.evaluateWritten(summary, 'A good listener waits for their turn. They also ask questions when they are confused about something.');
  const missed = r.coverage.filter(c => !c.hit).map(c => c.label);
  assert.deepEqual(missed, ['looks at the speaker', 'listening builds confidence']);
  assert.match(r.improve[0].why, /looks at the speaker/);
});

test('a and an: vowel sounds, but not "a university" or "an MBA"', () => {
  const ids = t => A.grammarHits(t, { written: true }).filter(h => h.id === 'a-an' || h.id === 'an-a').map(h => h.quote);
  assert.deepEqual(ids('I ate a apple and an banana.'), ['a apple', 'an banana']);
  assert.deepEqual(ids('I study at a university and want an MBA in an hour.'), []);
});

test('informal words in a formal email lower the tone mark', () => {
  const r = A.evaluateWritten(leave, leave.model.replace('Please let me know', 'pls let me know'));
  assert.ok(r.criteria.find(c => c.id === 'vocabulary').score < 4);
});

// spoken: build engine-style words from a transcript, ~0.35 s a word
function heard(text, { conf = 0.95, gapAfter = {} } = {}) {
  let t = 0.3;
  return text.split(/\s+/).filter(Boolean).map(w => { const o = { word: w.toLowerCase().replace(/[^a-z']/g, ''), conf, start: t, end: t + 0.3 }; t += 0.35 + (gapAfter[w] || 0); return o; });
}

test('spoken self-introduction: "myself" caught, fillers counted, key points found', () => {
  const said = 'good morning sir myself arjun kumar i am from lucknow um i have completed my b com from lucknow university currently i am doing a course in uh retail management my strength is i am hard working and matlab i like to talk with customers thank you';
  const r = A.evaluateSpoken(intro, heard(said));
  assert.equal(r.stats.fillers, 3);
  assert.ok(A.grammarHits(said, { written: false }).some(h => h.id === 'myself-name'));
  const hit = r.coverage.filter(c => c.hit).map(c => c.label);
  for (const l of ['your name', 'where you are from', 'studies or work', 'your strengths']) assert.ok(hit.includes(l), l);
  assert.ok(r.criteria.find(c => c.id === 'task').score <= 3, 'too short for 60-90 s');
  assert.equal(r.refused, null);
});

test('past events in present tense are caught', () => {
  const said = 'last weekend i go to my grandmother house with my family and we play cricket and i enjoyed it a lot because it was fun';
  const hits = A.grammarHits(said, { written: false }).filter(h => h.id === 'past-tense');
  assert.deepEqual(hits.map(h => h.fix), ['i went', 'we played']);
  const r = A.evaluateSpoken(weekend, heard(said));
  assert.match(r.corrected, /i went to my grandmother/);
});

test('pace and long pauses come from timings and silences', () => {
  const words = heard('my name is arjun and i am from lucknow and i want to join your shop because i like customers');
  const r = A.evaluateSpoken(intro, words, { silences: [{ from: 2.0, to: 4.0 }, { from: 4.5, to: 6.5 }] });
  assert.equal(r.stats.longPauses, 2);
  assert.ok(r.stats.wpm > 150, 'fast synthetic pace');
});

test('too little speech or too much noise is refused, not scored', () => {
  assert.equal(A.evaluateSpoken(intro, heard('hello my name')).refused, 'quiet');
  assert.equal(A.evaluateSpoken(intro, heard('my name is arjun and i am from lucknow and i like customers'), { snrDb: 9 }).refused, 'noisy');
});

test('AI feedback merges over the device result; for speech, fluency and clarity stay measured', () => {
  const device = A.evaluateSpoken(intro, heard('my name is arjun i am from lucknow i studied commerce i am hard working i want to join because i like customers'));
  const ai = { scores: [{ criterion: 'task', score: 2, reason: 'No link to the job.' }, { criterion: 'fluency', score: 1, reason: 'x' }, { criterion: 'grammar', score: 3, reason: 'Small slips.' }],
    well: ['Clear structure.'], improve: [{ quote: 'i studied commerce', better: 'I studied commerce at college', why: 'Add detail.' }], better_version: 'My name is Arjun.', summary: 'Good start.' };
  const m = A.mergeAI(device, ai);
  assert.equal(m.source, 'ai');
  assert.equal(m.criteria.find(c => c.id === 'task').score, 2);
  assert.equal(m.criteria.find(c => c.id === 'fluency').score, device.criteria.find(c => c.id === 'fluency').score);
  assert.equal(m.corrected, 'My name is Arjun.');
  assert.equal(m.total, m.criteria.reduce((s, c) => s + c.score, 0));
});

test('the most important slips come first, repeats are grouped, overlapping fixes all land', () => {
  const r = A.evaluateWritten(leave, PRIYA);
  assert.ok(!/capital/.test(r.improve.find(i => i.quote).why), 'a real slip, not capitals, comes first: ' + JSON.stringify(r.improve));
  assert.match(r.corrected, /leave next Friday/, 'both "on next" and "Friday" fixed');
  assert.equal(r.criteria.find(c => c.id === 'grammar').score, 2);
  assert.equal(r.criteria.find(c => c.id === 'organisation').score, 3, '"Thanking you" is a closing; only the subject line is missing');
});

/*
  Reading Check: scoring.
  Pure functions, no DOM. Runs in the browser (window.ReadingScore) and in Node (require) for tests.

  Input: the passage text plus what the speech engine heard, from two passes:
    primary: recognition limited to the passage (its sentences, its words, and common
             learner variants like "bird" for "birds"). Good at timing and at telling which
             passage word was read.
    open:    recognition with the full English vocabulary. Hears what was actually said,
             so it tells us how clearly a word was spoken and catches words not in the passage.
  Each heard word is { word, conf (0..1), start, end } in seconds.

  Every threshold is in CONFIG so it can be tuned against teacher reviews.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReadingScore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CONFIG = {
    unsureConf: 0.5,        // a primary-pass word below this confidence is "unclear", not a mistake
    clearConf: 0.8,         // without an open pass, a word at or above this confidence counts as clearly spoken
    paceTarget: [80, 140],  // comfortable pace, words correct per minute (tune per level)
    paceNear: 0.2,          // within 20% outside the target band still scores 2 of 3
    hesitationSec: 0.7,     // a gap this long inside a phrase is a hesitation
    stuckSec: 2.0,          // a gap this long inside a phrase means the reader got stuck
    goodStopSec: 0.25,      // a pause this long at a full stop is a good pause
    commaStopSec: 0.12,     // a comma needs only a short pause
    rushedStopSec: 0.12,    // shorter than this at a full stop means the reader ran past it
    wordGapSec: 0.3,        // a gap this long between words inside a phrase breaks the phrase
    wordByWordShare: 0.45,  // if this share of in-phrase gaps are breaks, the reading is word by word
    minSilenceSec: 0.12,    // quieter stretches shorter than this are part of speech (stop consonants), not pauses
    // Rubric bands. PLACEHOLDERS until replaced with the course's own rubric.
    rubric: {
      accuracy: [[97, 4], [90, 3], [80, 2], [0, 1]], // [minimum accuracy %, marks out of 4]
      // pace out of 3: in band = 3, within paceNear of the band = 2, otherwise 1
      // phrasing out of 3: see scorePhrasing()
    },
  };

  const SMALL_WORDS = new Set(('a an the my i in on at to of and is it we he she for us our his her was are be by or as so do ' +
    'me you your they them their this that with from but not am its were has had have will can if up').split(' '));

  // ---------- text ----------
  const norm = w => String(w).toLowerCase().replace(/[‘’`]/g, "'").replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '');
  const ENDS_SENTENCE = /[.!?]["'’”)\]]*$/;
  const ENDS_CLAUSE = /[,;:—–-]["'’”)\]]*$/;

  function tokenize(text) {
    const out = []; let sentence = 0;
    for (const raw of String(text).split(/\s+/)) {
      const n = norm(raw); if (!n) continue;
      const endsSentence = ENDS_SENTENCE.test(raw);
      out.push({ i: out.length, raw, n, sentence, endsSentence, endsClause: !endsSentence && ENDS_CLAUSE.test(raw), small: SMALL_WORDS.has(n) });
      if (endsSentence) sentence++;
    }
    return out;
  }
  const clean = raw => raw.replace(/^["'“‘(]+|[.,!?;:"'”’)\]—–-]+$/g, '');

  // ---------- sound-alike helpers ----------
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m || !n) return m || n;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), prev[j] + 1, cur[j - 1] + 1);
      prev = cur;
    }
    return prev[n];
  }
  function soundex(w) {
    const s = w.replace(/[^a-z]/g, ''); if (!s) return '';
    const map = { b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2, d: 3, t: 3, l: 4, m: 5, n: 5, r: 6 };
    let out = s[0].toUpperCase(), last = map[s[0]] || 0;
    for (const ch of s.slice(1)) { const c = map[ch] || 0; if (c && c !== last) out += c; if (ch !== 'h' && ch !== 'w') last = c; }
    return (out + '000').slice(0, 4);
  }
  // Two different words that sound close enough that a listener would still understand the intended one.
  function soundsAlike(a, b) {
    if (!a || !b || a === b || a === '[unk]' || b === '[unk]') return false;
    const d = lev(a, b), len = Math.max(a.length, b.length);
    if (len <= 3) return d <= 1 && a[0] === b[0];
    return d <= Math.max(1, Math.floor(len / 3)) || (soundex(a) === soundex(b) && d <= Math.ceil(len / 2));
  }
  // A heard word that starts the expected word: a cut-off attempt ("gran" for "grandmother").
  const isFalseStart = (heard, expected) => heard.length >= 2 && heard.length < expected.length && expected.startsWith(heard);

  // Common learner variants of a word, so the primary pass can hear them and patterns can be named.
  const PATTERNS = {
    's': { name: 'the “-s” at the end of words' },
    'ed': { name: 'the “-ed” at the end of words' },
    'ing': { name: 'the “-ing” at the end of words' },
  };
  function variants(n) {
    const out = [];
    if (n.length > 3 && n.endsWith('s') && !n.endsWith('ss') && !n.endsWith("'s")) {
      out.push({ form: n.slice(0, -1), pattern: 's' });
      if (n.endsWith('es') && n.length > 4) out.push({ form: n.slice(0, -2), pattern: 's' });
    }
    if (n.length > 4 && n.endsWith('ed')) { out.push({ form: n.slice(0, -2), pattern: 'ed' }); out.push({ form: n.slice(0, -1), pattern: 'ed' }); }
    if (n.length > 5 && n.endsWith('ing')) { out.push({ form: n.slice(0, -3), pattern: 'ing' }); out.push({ form: n.slice(0, -3) + 'e', pattern: 'ing' }); }
    return out.filter(v => v.form.length >= 2 && v.form !== n);
  }
  const variantPattern = (expected, heard) => (variants(expected).find(v => v.form === heard) || {}).pattern || null;

  // Grammar for the primary pass. sentences: whole sentences + single words + variants (best in tests).
  function grammarFor(text, mode) {
    if (mode === 'open') return null;
    const tokens = tokenize(text);
    const words = tokens.map(t => t.n);
    const extra = tokens.flatMap(t => variants(t.n).map(v => v.form));
    if (mode === 'words') return [...new Set([...words, ...extra])];
    const sentences = String(text).split(/[.!?]+/).map(s => tokenize(s).map(t => t.n).join(' ')).filter(Boolean);
    return [...new Set([...sentences, ...words, ...extra])];
  }

  // ---------- alignment ----------
  // Word-level edit distance between the passage (ref) and what was heard (hyp). A variant of the
  // expected word ("bird" for "birds") costs less than a different word, so it lines up in place.
  function align(ref, hyp) {
    const R = ref.length, H = hyp.length;
    const d = Array.from({ length: R + 1 }, () => new Float64Array(H + 1));
    const subCost = (r, h) => (r === h ? 0 : variantPattern(r, h) || soundsAlike(r, h) ? 0.6 : 1);
    for (let i = 0; i <= R; i++) d[i][0] = i;
    for (let j = 0; j <= H; j++) d[0][j] = j;
    for (let i = 1; i <= R; i++) for (let j = 1; j <= H; j++)
      d[i][j] = Math.min(d[i - 1][j - 1] + subCost(ref[i - 1], hyp[j - 1].word), d[i - 1][j] + 1, d[i][j - 1] + 1);
    const ops = []; let i = R, j = H;
    const eq = (a, b) => Math.abs(a - b) < 1e-9;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && eq(d[i][j], d[i - 1][j - 1] + subCost(ref[i - 1], hyp[j - 1].word))) {
        ops.push({ t: ref[i - 1] === hyp[j - 1].word ? 'ok' : 'sub', r: i - 1, h: j - 1 }); i--; j--;
      } else if (i > 0 && eq(d[i][j], d[i - 1][j] + 1)) { ops.push({ t: 'del', r: i - 1 }); i--; }
      else { ops.push({ t: 'ins', h: j - 1 }); j--; }
    }
    return ops.reverse();
  }

  // ---------- main analysis ----------
  // silences: optional [{ from, to }] quiet stretches measured from the audio itself. The engine's word
  // times run into each other (silence is folded into the words), so real pauses come from the audio.
  function analyse({ text, primary, open = null, silences = null, config = {} }) {
    const C = { ...CONFIG, ...config, rubric: { ...CONFIG.rubric, ...(config.rubric || {}) } };
    const tokens = tokenize(text);
    const toHyp = ws => (ws || []).map(w => ({ word: w.word === '[unk]' ? '[unk]' : norm(w.word), conf: +w.conf, start: +w.start, end: +w.end })).filter(w => w.word);
    const hyp = toHyp(primary), openHyp = open ? toHyp(open) : null;
    const ops = align(tokens.map(t => t.n), hyp);

    // 1. per passage word
    const words = tokens.map(t => ({ ...t, status: 'skip', heard: null, conf: null, start: null, end: null, pattern: null, clarity: null }));
    const extras = [];
    let lastRef = -1;
    ops.forEach((op, k) => {
      if (op.t === 'ok' || op.t === 'sub') {
        const w = words[op.r], h = hyp[op.h];
        Object.assign(w, { heard: h.word, conf: h.conf, start: h.start, end: h.end, h: op.h });
        if (op.t === 'ok') w.status = 'ok';
        else if (h.word === '[unk]' || h.conf < C.unsureConf) w.status = 'unclear';
        else { w.status = 'change'; w.pattern = variantPattern(w.n, h.word); w.alike = soundsAlike(w.n, h.word); }
        lastRef = op.r;
      } else if (op.t === 'del') { lastRef = op.r; }
      else {
        const next = ops.slice(k + 1).find(o => o.r !== undefined);
        extras.push({ ...hyp[op.h], h: op.h, after: lastRef, before: next ? next.r : -1, kind: 'added' });
      }
    });

    // 2. extra words: repeats, self-corrections, real additions
    for (const x of extras) {
      const nextW = x.before >= 0 ? words[x.before] : null;
      const nearby = windowWords(words, x.after, x.before, 3);
      if (x.word === '[unk]') x.kind = 'noise';
      else if (nextW && nextW.status === 'ok' && (isFalseStart(x.word, nextW.n) || soundsAlike(x.word, nextW.n) || variantPattern(nextW.n, x.word))) {
        x.kind = 'selfcorrect'; nextW.selfCorrected = x.word;
      } else if (nearby.includes(x.word)) x.kind = 'repeat';
      else { x.kind = 'added'; x.small = SMALL_WORDS.has(x.word); }
    }

    // 3. open pass: how each word actually sounded
    if (openHyp) {
      const overlapping = w => openHyp.filter(o => o.end > w.start - 0.08 && o.start < w.end + 0.08);
      for (const w of words) {
        if (w.start === null) continue;
        const heardOpen = overlapping(w).map(o => o.word);
        w.openHeard = heardOpen.join(' ');
        if (heardOpen.includes(w.n)) {
          w.clarity = 'clear';
          if (w.status === 'unclear') w.status = 'ok';
        } else {
          const pat = heardOpen.map(o => variantPattern(w.n, o)).find(Boolean);
          const alike = heardOpen.find(o => soundsAlike(w.n, o) || isFalseStart(o, w.n) || (o.length >= 3 && w.n.startsWith(o)));
          if (pat) {
            w.clarity = 'close';
            if (w.status === 'ok' || w.status === 'unclear') { w.status = 'tip'; w.pattern = pat; w.soundedLike = heardOpen.find(o => variantPattern(w.n, o)); }
          } else if (alike) {
            w.clarity = 'close';
            // the reader said the right word with a different sound: a pronunciation tip, not a mistake
            if (w.status === 'ok' || w.status === 'unclear' || (w.status === 'change' && w.alike)) { w.status = 'tip'; w.soundedLike = alike; }
          } else {
            w.clarity = w.status === 'ok' && w.conf >= C.clearConf && !heardOpen.length ? 'clear' : 'unclear';
            if (heardOpen.length) w.soundedLike = heardOpen.join(' ');
            // the passage pass could not name it, but the open pass clearly heard a different word: a change
            const ov = o => Math.min(o.end, w.end) - Math.max(o.start, w.start);
            const other = overlapping(w).filter(o => o.conf >= 0.6 && o.word.length >= 2 && ov(o) > 0).sort((x, y) => ov(y) - ov(x))[0];
            if (w.status === 'unclear' && other) { w.status = 'change'; w.heard = other.word; w.pattern = null; w.alike = false; }
          }
        }
      }
      // words the open pass heard between passage words, which the primary pass could not name
      const covered = o => words.some(w => w.start !== null && o.end > w.start + 0.03 && o.start < w.end - 0.03);
      for (const o of openHyp) {
        if (o.conf < 0.8 || o.word.length < 2 || covered(o)) continue;
        // only where the audio shows speech: the open pass sometimes names a word inside a silence
        if (silences) { const d = Math.max(0.01, o.end - o.start), q = silences.reduce((t, z) => t + Math.max(0, Math.min(z.to, o.end) - Math.max(z.from, o.start)), 0); if (q / d > 0.5) continue; }
        const match = extras.find(x => x.end > o.start && x.start < o.end);
        if (match) { if (match.kind === 'noise') { match.word = o.word; match.kind = 'added'; match.small = SMALL_WORDS.has(o.word); } continue; }
        let before = words.findIndex(w => w.start !== null && w.start >= o.end);
        let after = words.length - 1;
        for (let k = (before === -1 ? words.length : before) - 1; k >= 0; k--) if (words[k].start !== null) { after = k; break; }
        // a passage word was skipped right here: the open pass heard what was said instead, so it is a change
        const gapSkip = words.slice(after + 1, before === -1 ? words.length : before).find(w => w.status === 'skip');
        if (gapSkip) { Object.assign(gapSkip, { status: 'change', heard: o.word, conf: o.conf, start: o.start, end: o.end, pattern: variantPattern(gapSkip.n, o.word), alike: soundsAlike(gapSkip.n, o.word), clarity: 'clear' }); continue; }
        const nearby = windowWords(words, after, before, 1);
        // pieces of a passage word that the open pass split up ("flow" + "lower" for "flowers")
        if (nearby.some(n => n !== o.word && (soundsAlike(n, o.word) || (o.word.length >= 3 && (n.includes(o.word) || o.word.includes(n)))))) continue;
        const kind = nearby.includes(o.word) ? 'repeat' : 'added';
        extras.push({ ...o, after, before, kind, small: SMALL_WORDS.has(o.word), fromOpen: true });
      }
      extras.sort((a, b) => a.start - b.start);
    } else {
      for (const w of words) if (w.start !== null) w.clarity = w.status === 'unclear' ? 'unclear' : w.conf >= C.clearConf ? 'clear' : 'close';
    }

    // 4. meaning and importance of each mistake
    const meaningOf = w => (w.small ? 'same' : 'changes');
    for (const w of words) {
      if (w.status === 'skip') { w.meaning = meaningOf(w); w.weight = w.small ? 2 : 5; }
      else if (w.status === 'change') {
        w.meaning = w.pattern || (w.small && SMALL_WORDS.has(w.heard)) ? 'same' : 'changes';
        if (w.pattern) w.meaning = 'small';
        w.weight = w.meaning === 'changes' ? 6 : 2;
      } else if (w.status === 'unclear') { w.meaning = 'unknown'; w.weight = 1.5; }
      else if (w.status === 'tip') { w.meaning = 'same'; w.weight = 0.5; }
    }
    for (const x of extras) if (x.kind === 'added') { x.meaning = x.small ? 'same' : 'changes'; x.weight = x.small ? 1 : 4; }

    // 5. timing, pauses and phrasing (in the order things were said)
    const spoken = words.filter(w => w.start !== null).sort((a, b) => a.start - b.start);
    const timeline = [...spoken.map(w => ({ ref: w, start: w.start, end: w.end })), ...extras.map(x => ({ extra: x, start: x.start, end: x.end }))].sort((a, b) => a.start - b.start);
    const pauses = { good: 0, stops: 0, fullStops: 0, goodFull: 0, commas: 0, goodComma: 0, goodList: [], rushed: [], hesitations: [], stuck: [], measured: silences ? 'audio' : 'word times' };
    const quiet = (silences || []).filter(q => q.to - q.from >= C.minSilenceSec);
    // The pause at each boundary between two spoken items. With audio silences, each quiet stretch is given to
    // the nearest word boundary (the engine folds silence into the words on either side); otherwise the gap in word times.
    const boundaryGap = timeline.slice(1).map((b, k) => ({ gap: silences ? 0 : Math.max(0, b.start - timeline[k].end), from: timeline[k].end, to: b.start, set: false }));
    if (silences) for (const q of quiet) {
      const c = (q.from + q.to) / 2; let best = -1, bestD = Infinity;
      timeline.slice(1).forEach((b, k) => {
        const a = timeline[k]; if (c < a.start || c > b.end) return;
        const d = Math.abs(c - (a.end + b.start) / 2); if (d < bestD) { bestD = d; best = k; }
      });
      if (best < 0) continue;
      const g = boundaryGap[best], s0 = Math.max(q.from, timeline[best].start), e0 = Math.min(q.to, timeline[best + 1].end);
      g.gap += Math.max(0, e0 - s0);
      g.from = g.set ? Math.min(g.from, s0) : s0; g.to = g.set ? Math.max(g.to, e0) : e0; g.set = true;
    }
    let midGaps = 0, wordGaps = 0, runs = 1;
    for (let k = 0; k + 1 < timeline.length; k++) {
      const a = timeline[k], b = timeline[k + 1], { gap, from, to } = boundaryGap[k];
      if (gap >= C.wordGapSec) runs++;
      const at = a.ref || null; // punctuation belongs to passage words; a gap after an extra word is judged as mid-phrase
      const boundary = at && at.i < words.length - 1 && (at.endsSentence || at.endsClause);
      const beforeWord = b.ref ? b.ref.raw : b.extra.word;
      if (boundary) {
        const full = at.endsSentence;
        pauses.stops++; if (full) pauses.fullStops++; else pauses.commas++;
        if (gap >= (full ? C.goodStopSec : C.commaStopSec)) { pauses.good++; if (full) pauses.goodFull++; else pauses.goodComma++; pauses.goodList.push({ from, to, gap }); }
        else if (full && gap < C.rushedStopSec) pauses.rushed.push({ after: clean(at.raw), gap });
      } else {
        midGaps++;
        if (gap >= C.wordGapSec) wordGaps++;
        if (gap >= C.stuckSec) pauses.stuck.push({ from, to, gap, before: clean(beforeWord) });
        else if (gap >= C.hesitationSec) pauses.hesitations.push({ from, to, gap, before: clean(beforeWord) });
      }
    }
    const wordByWord = midGaps >= 5 && wordGaps / midGaps >= C.wordByWordShare;
    const t0 = timeline.length ? timeline[0].start : 0, t1 = timeline.length ? timeline[timeline.length - 1].end : 0;
    const readingSec = Math.max(0, t1 - t0);

    // 6. counts, accuracy, speed
    const count = s => words.filter(w => w.status === s).length;
    const counts = {
      total: words.length, correct: count('ok') + count('tip'), tips: count('tip'),
      skipped: count('skip'), changed: count('change'), unclear: count('unclear'),
      added: extras.filter(x => x.kind === 'added').length, repeats: extras.filter(x => x.kind === 'repeat').length,
      selfCorrected: words.filter(w => w.selfCorrected).length,
    };
    const checked = counts.total - counts.unclear;
    const errors = counts.skipped + counts.changed + counts.added;
    const accuracy = checked ? Math.max(0, Math.round(100 * (checked - errors) / checked)) : 0;
    const wcpm = readingSec > 0.5 ? Math.round(counts.correct / (readingSec / 60)) : 0;
    const clearWords = spoken.filter(w => w.clarity === 'clear').length;
    const clarity = spoken.length ? Math.round(100 * clearWords / spoken.length) : 0;
    const avgPhrase = timeline.length ? +(timeline.length / runs).toFixed(1) : 0;

    // 7. sentences
    const sentences = [];
    for (const w of words) {
      const s = sentences[w.sentence] || (sentences[w.sentence] = { i: w.sentence, words: [] });
      s.words.push(w);
    }
    for (const s of sentences) {
      const chk = s.words.filter(w => w.status !== 'unclear');
      const errs = s.words.filter(w => w.status === 'skip' || w.status === 'change').length +
        extras.filter(x => x.kind === 'added' && x.before >= 0 && words[x.before].sentence === s.i).length;
      s.accuracy = chk.length ? Math.max(0, Math.round(100 * (chk.length - errs) / chk.length)) : 100;
      s.skipped = s.words.filter(w => w.status === 'skip').length;
      s.changed = s.words.filter(w => w.status === 'change').length;
      s.text = s.words.map(w => w.raw).join(' ');
    }

    // 8. mistakes, most important first
    const mistakes = [
      ...words.filter(w => ['skip', 'change', 'unclear', 'tip'].includes(w.status)).map(w => ({
        kind: w.status, at: w.i, word: clean(w.raw), heard: w.status === 'tip' ? w.soundedLike : w.heard, pattern: w.pattern,
        meaning: w.meaning, weight: w.weight, start: w.start, end: w.end })),
      ...extras.filter(x => x.kind === 'added').map(x => ({ kind: 'added', at: x.before >= 0 ? x.before - 0.5 : words.length, word: x.word,
        meaning: x.meaning, weight: x.weight, start: x.start, end: x.end })),
    ].sort((a, b) => b.weight - a.weight || a.at - b.at);

    // 9. repeated patterns, in one line each with the reader's own examples
    const patterns = [];
    const byPattern = {};
    for (const w of words) if (w.pattern && (w.status === 'change' || w.status === 'tip')) (byPattern[w.pattern] = byPattern[w.pattern] || []).push(w);
    for (const [p, ws] of Object.entries(byPattern)) if (ws.length >= 2)
      patterns.push({ id: 'ending-' + p, text: `You often drop ${PATTERNS[p].name}: ${ws.slice(0, 3).map(w => `${clean(w.raw)} → ${w.soundedLike || w.heard}`).join(', ')}.` });
    const skipped = words.filter(w => w.status === 'skip');
    const smallSkips = skipped.filter(w => w.small);
    if (smallSkips.length >= 2 && smallSkips.length / skipped.length >= 0.5)
      patterns.push({ id: 'skip-small', text: `You often skip small words like ${listWords(smallSkips.map(w => q(w.raw)))}.` });
    const contentSkips = skipped.filter(w => !w.small);
    if (contentSkips.length >= 2) patterns.push({ id: 'skip-words', text: `You skipped some important words: ${listWords(contentSkips.map(w => q(w.raw)))}.` });
    const addedWords = extras.filter(x => x.kind === 'added');
    if (addedWords.length >= 2) patterns.push({ id: 'added', text: `You added words that are not in the passage: ${listWords(addedWords.map(x => q(x.word)))}.` });
    const alikeTips = words.filter(w => w.status === 'tip' && !w.pattern);
    if (alikeTips.length >= 2) patterns.push({ id: 'sounds', text: `A few words sounded a little different (${alikeTips.slice(0, 2).map(w => `${clean(w.raw)} sounded like ${w.soundedLike}`).join(', ')}). They were still clear, so they are not mistakes.` });
    if (pauses.hesitations.length + pauses.stuck.length >= 2)
      patterns.push({ id: 'mid-pause', text: `You often stop in the middle of a phrase: before ${listWords([...pauses.stuck, ...pauses.hesitations].sort((a, b) => a.from - b.from).map(p => q(p.before)))}.` });
    if (pauses.rushed.length >= 2) patterns.push({ id: 'rushed', text: `You often read past full stops without pausing, after ${listWords(pauses.rushed.map(p => q(p.after)))}.` });
    if (wordByWord) patterns.push({ id: 'word-by-word', text: 'You read one word at a time. Try reading small groups of words together, like “in the park”.' });

    // 10. rubric
    const accMarks = C.rubric.accuracy.find(([min]) => accuracy >= min)[1];
    const [lo, hi] = C.paceTarget;
    const paceBand = wcpm < lo ? 'slow' : wcpm > hi ? 'fast' : 'good';
    const paceMarks = paceBand === 'good' ? 3 : (wcpm >= lo * (1 - C.paceNear) && wcpm <= hi * (1 + C.paceNear)) ? 2 : 1;
    const stopShare = pauses.fullStops ? pauses.goodFull / pauses.fullStops : pauses.stops ? pauses.good / pauses.stops : 1;
    const midStops = pauses.hesitations.length + pauses.stuck.length;
    const phrasingMarks = midStops <= 1 && stopShare >= 0.75 && !wordByWord && pauses.rushed.length <= 1 ? 3
      : midStops <= 3 && stopShare >= 0.5 ? 2 : 1;
    const rubric = {
      accuracy: { marks: accMarks, max: 4 },
      pace: { marks: paceMarks, max: 3, band: paceBand },
      phrasing: { marks: phrasingMarks, max: 3 },
      total: accMarks + paceMarks + phrasingMarks, max: 10,
    };

    // 11. message: matched to the score, most important point first
    const top = mistakes.find(m => m.kind !== 'tip');
    const topText = top ? describe(top) : null;
    let headline, lead;
    if (rubric.total >= 9) { headline = 'Excellent reading!'; lead = topText ? `One small thing: ${topText}` : 'You read every word clearly and smoothly.'; }
    else if (rubric.total >= 7) { headline = 'Well done!'; lead = topText ? `Main thing to work on: ${topText}` : phraseTip(rubric, paceBand); }
    else if (rubric.total >= 5) { headline = 'Good effort!'; lead = topText ? `Let’s fix this first: ${topText}` : phraseTip(rubric, paceBand); }
    else { headline = 'Let’s practise this one together.'; lead = topText ? `Start with this: ${topText}` : phraseTip(rubric, paceBand); }

    return {
      words, extras, counts, accuracy, wcpm, readingSec: +readingSec.toFixed(2), clarity, avgPhrase, wordByWord,
      pauses: { ...pauses, stopShare: +stopShare.toFixed(2) }, sentences, mistakes, patterns, rubric,
      message: { headline, lead, tone: rubric.total >= 9 ? 'praise' : rubric.total >= 7 ? 'good' : 'guide' },
      heardTooLittle: hyp.length < tokens.length * 0.3,
    };
  }

  function phraseTip(rubric, paceBand) {
    if (paceBand === 'fast') return 'Slow down a little so every word is clear.';
    if (paceBand === 'slow') return 'Read it once more to make it smoother.';
    if (rubric.phrasing.marks < 3) return 'Try to pause at commas and full stops, not in the middle of a phrase.';
    return 'Keep practising to make it even smoother.';
  }

  // Plain-language description of one mistake, used for the message and lists.
  function describe(m) {
    const w = q(m.word);
    if (m.kind === 'skip') return `you skipped ${w}${m.meaning === 'changes' ? ', which changes the meaning' : ''}.`;
    if (m.kind === 'change' && m.pattern) return `${w} was read as ${q(m.heard)}. Say the ending clearly.`;
    if (m.kind === 'change') return `${w} was read as ${q(m.heard)}${m.meaning === 'changes' ? ', which changes the meaning' : ''}.`;
    if (m.kind === 'added') return `you added ${q(m.word)}${m.meaning === 'changes' ? ', which changes the meaning' : ''}.`;
    if (m.kind === 'unclear') return `${w} was hard to hear. Say it a little more clearly.`;
    if (m.kind === 'tip') return `${w} sounded like ${q(m.heard || '…')}. It was still clear.`;
    return '';
  }
  const q = w => `“${clean(String(w))}”`;
  // passage words around a position, `span` either side
  function windowWords(words, after, before, span) {
    const lo = Math.max(0, (after >= 0 ? after : 0) - span), hi = Math.min(words.length - 1, (before >= 0 ? before : words.length - 1) + span);
    return words.slice(lo, hi + 1).map(w => w.n);
  }
  const listWords = ws => { const u = [...new Set(ws)]; return u.length <= 1 ? u.join('') : u.slice(0, -1).join(', ') + ' and ' + u[u.length - 1]; };

  // Live follow-along: how far into the passage the reader has got.
  function livePosition(refN, heard) {
    const H = heard.length; if (!H) return -1;
    let prev = new Int32Array(H + 1), cur = new Int32Array(H + 1);
    for (let j = 0; j <= H; j++) prev[j] = j;
    let best = prev[H], bestI = 0;
    for (let i = 1; i <= refN.length; i++) {
      cur[0] = i;
      for (let j = 1; j <= H; j++) cur[j] = Math.min(prev[j - 1] + (refN[i - 1] === heard[j - 1] ? 0 : 1), prev[j] + 1, cur[j - 1] + 1);
      if (cur[H] <= best) { best = cur[H]; bestI = i; }
      [prev, cur] = [cur, prev];
    }
    return bestI - 1;
  }

  // Recompute rubric total and message after a teacher changes marks.
  function totalOf(marks) { return (marks.accuracy || 0) + (marks.pace || 0) + (marks.phrasing || 0); }

  return { CONFIG, SMALL_WORDS, norm, tokenize, lev, soundex, soundsAlike, variants, variantPattern, grammarFor, align, analyse, describe, livePosition, totalOf, clean };
});

/*
  The whole course in one place: the reading passages, and the learning plan that strings the
  reading, writing and speaking lessons together. Progress is read from what each page saves on the device.
  Needs js/tasks.js (window.AnswerTasks) loaded first.
*/
(function (root) {
  'use strict';
  const PASSAGES = [
  { id: 'morning-walk', title: 'Morning Walk',
    text: 'Every morning my grandmother and I go for a walk in the park. We look at the birds, the trees and the flowers. On the way home, we buy fresh fruit from the market.',
    questions: [
      { q: 'Who goes for a walk every morning?', options: ['The writer and their grandmother', 'The writer and a friend', 'Only the grandmother'], answer: 0 },
      { q: 'Where do they walk?', options: ['In the market', 'In the park', 'In the garden'], answer: 1 },
      { q: 'What do they buy on the way home?', options: ['Vegetables', 'Flowers', 'Fresh fruit'], answer: 2 },
    ] },
  { id: 'good-listener', title: 'A Good Listener',
    text: 'A good listener looks at the speaker and waits for their turn to talk. They ask questions when they do not understand. Listening carefully helps us speak with confidence.',
    questions: [
      { q: 'What does a good listener look at?', options: ['The speaker', 'The floor', 'A book'], answer: 0 },
      { q: 'What do they do when they do not understand?', options: ['Stay quiet', 'Ask questions', 'Start talking'], answer: 1 },
      { q: 'What does listening carefully help us do?', options: ['Read faster', 'Write neatly', 'Speak with confidence'], answer: 2 },
    ] },
  { id: 'own', title: 'My own passage', text: 'Type your passage in Tools.' },
];

  const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  // where the Read aloud page keeps the tries for a passage (keyed by the text, so an edited passage starts fresh)
  const keyFor = text => { let h = 0; for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0; return 'rc-tries2-' + h; };
  const firstSentence = s => (s.match(/^.*?[.?!](\s|$)/) || [s])[0].trim();

  const KINDS = {
    read: { name: 'Read aloud', href: 'index.html', param: 'p', max: 10 },
    write: { name: 'Write', href: 'write.html', param: 't', max: 16 },
    speak: { name: 'Speak', href: 'speak.html', param: 't', max: 16 },
  };
  // the order a learner meets them: read first, then write and speak about similar things
  const ORDER = ['read:morning-walk', 'read:good-listener', 'write:w-summary-listener', 'speak:s-intro-job', 'write:w-leave-email',
    'speak:s-weekend', 'write:w-opinion-phones', 'speak:s-goal', 'write:w-reply-customer'];

  function lessons() {
    const T = root.AnswerTasks;
    return ORDER.map(ref => {
      const [kind, id] = ref.split(':'), K = KINDS[kind];
      let l;
      if (kind === 'read') {
        const p = PASSAGES.find(x => x.id === id), tries = get(keyFor(p.text), []);
        const last = tries.length ? tries[tries.length - 1] : null;
        l = { title: p.title, desc: 'Read this short passage aloud. Every word is checked as you read.',
          meta: `${p.text.split(/\s+/).length} words`, best: tries.length ? Math.max(...tries.map(t => t.total)) : null,
          last: last ? { at: last.at, total: last.total } : null, tries: tries.length };
      } else {
        const t = T.byId(id);
        l = { title: t.title, desc: firstSentence(t.prompt),
          meta: kind === 'write' ? `${t.minWords}–${t.maxWords} words` : `${t.minSec}–${t.maxSec} seconds`,
          best: get(`rc-${kind}-best-${id}`, null), last: get(`rc-${kind}-last-${id}`, null) };
      }
      return Object.assign(l, { kind, id, kindName: K.name, max: K.max, href: `${K.href}?${K.param}=${encodeURIComponent(id)}`, done: l.best !== null && l.best !== undefined });
    });
  }
  function summary() {
    const all = lessons(), done = all.filter(l => l.done).length;
    return { total: all.length, done, upcoming: all.length - done, next: all.find(l => !l.done) || null };
  }

  // ---------- the black top bar shared by every page ----------
  const ICON = {
    plan: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/>',
    read: '<path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z"/><path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/>',
    write: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
    speak: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  };
  const svg = (paths, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  function ring(n, max) {
    const r = 40, c = 2 * Math.PI * r;
    return `<svg class="ring" viewBox="0 0 96 96" aria-hidden="true"><circle class="bg" cx="48" cy="48" r="${r}" fill="none" stroke-width="10"/>
      <circle class="fg" cx="48" cy="48" r="${r}" fill="none" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(c * n / max).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 48 48)"/>
      <text x="48" y="57" text-anchor="middle" font-weight="700">${n}</text></svg>`;
  }
  const NAV = [['plan', 'plan.html', 'Learning plan'], ['read', 'index.html', 'Read aloud'], ['write', 'write.html', 'Write'], ['speak', 'speak.html', 'Speak']];
  let current = null;
  function mountTopbar(page) {
    current = page || current;
    const el = document.getElementById('topbar'); if (!el) return;
    const s = summary();
    el.innerHTML = `
      <a class="brand" href="plan.html">Communicate<small>English course</small></a>
      <nav class="nav" aria-label="Main">${NAV.map(([id, href, label]) =>
        `<a href="${href}"${id === current ? ' aria-current="page"' : ''} title="${label}">${svg(ICON[id])}<span class="lbl">${label}</span></a>`).join('')}</nav>
      <a class="me" href="plan.html" aria-label="${s.done} of ${s.total} lessons done">${ring(s.done, s.total)}<div><b>${s.done} of ${s.total} lessons</b><span>Your progress</span></div></a>`;
  }

  root.Course = { PASSAGES, KINDS, ICON, keyFor, lessons, summary, mountTopbar, svg };

  // keep the course on the device so it opens offline after the first visit (web only; an app's own files are already offline)
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('commkit-sw.js').then(() => navigator.serviceWorker.ready)
      .then(reg => {
        // the whole course, so every tab opens offline after one visit (versioned ?v= URLs fall back to these copies)
        const msg = { type: 'cache', urls: ['plan.html', 'index.html', 'write.html', 'speak.html', 'css/base.css', 'css/course.css',
          'js/course.js', 'js/tasks.js', 'js/scoring.js', 'js/answer-scoring.js', 'js/answer-ui.js', 'js/speech.js',
          'lib/vosk.js', 'models/en-in.tar.gz'].map(u => new URL(u, location.href).href) };
        reg.active.postMessage(msg);
        navigator.serviceWorker.addEventListener('controllerchange', () => navigator.serviceWorker.controller && navigator.serviceWorker.controller.postMessage(msg), { once: true });
      })
      .catch(() => {});
    // the speech engine downloads the model inside a worker the offline cache can't see, so when the cache is
    // active, fetch the model here (the cache answers it) and hand it over
    const V = root.Vosk;
    if (V && V.createModel && !V.createModel.viaPage) {
      const original = V.createModel;
      const wrapped = async (u, ...rest) => {
        if (!navigator.serviceWorker.controller) return original(u, ...rest);
        let src = u;
        try { const r = await fetch(u); if (r.ok) src = URL.createObjectURL(await r.blob()); } catch (e) {}
        try { return await original(src, ...rest); } finally { if (src !== u) URL.revokeObjectURL(src); }
      };
      wrapped.viaPage = true;
      try { V.createModel = wrapped; } catch (e) {}
    }
  }
})(typeof self !== 'undefined' ? self : this);

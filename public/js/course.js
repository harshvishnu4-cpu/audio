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

  // Unseen passages: read aloud once, without seeing them first (the text appears when recording starts).
  // Graded: level 1 (short sentences, everyday words) to level 3 (longer sentences, linking words).
  // Every word is checked against the speech model's vocabulary (tools/check_passage_words.py).
  const UNSEEN = [
    { id: 'u-kite', level: 1, title: 'The Lost Kite',
      text: 'Ravi had a red kite with a long blue tail. One windy evening, he ran to the field near his school. The kite flew high above the trees. Suddenly the string broke, and the kite floated away. Ravi felt sad, but his sister smiled and said, "Let us make a new one together."',
      questions: [
        { q: 'What colour was the kite?', options: ['Blue', 'Red', 'Yellow'], answer: 1 },
        { q: 'Where did Ravi fly the kite?', options: ['In the field near his school', 'On the roof', 'At the beach'], answer: 0 },
        { q: 'Who offered to help him?', options: ['His friend', 'His teacher', 'His sister'], answer: 2 },
      ] },
    { id: 'u-bus-stop', level: 1, title: 'At the Bus Stop',
      text: 'Every day, Asha waits at the bus stop at half past seven. She carries a small bag with her books and a lunch box. The bus is often late, so she reads a story while she waits. When it finally comes, she greets the driver and finds a seat by the window.',
      questions: [
        { q: 'When does Asha wait for the bus?', options: ['At seven o’clock', 'At half past seven', 'At eight o’clock'], answer: 1 },
        { q: 'What does she do while she waits?', options: ['Reads a story', 'Talks on the phone', 'Eats her lunch'], answer: 0 },
        { q: 'Where does she sit on the bus?', options: ['At the back', 'Next to the driver', 'By the window'], answer: 2 },
      ] },
    { id: 'u-garden', level: 2, title: 'The School Garden',
      text: 'Last month, our class started a small garden behind the school. We planted tomatoes, beans and marigolds in neat rows. Each group took turns to water the plants before the morning bell. At first, nothing seemed to happen. Then, after two weeks, tiny green leaves pushed through the soil. Now we check the garden every day and write what we see in a notebook.',
      questions: [
        { q: 'Where is the garden?', options: ['Behind the school', 'In the park', 'Next to the library'], answer: 0 },
        { q: 'When did the groups water the plants?', options: ['After lunch', 'Before the morning bell', 'In the evening'], answer: 1 },
        { q: 'When did the first leaves appear?', options: ['After two days', 'After a month', 'After two weeks'], answer: 2 },
      ] },
    { id: 'u-doctor', level: 2, title: 'A Visit to the Doctor',
      text: 'Arjun woke up with a sore throat and a mild fever. His mother called the clinic and asked for an appointment. The nurse said that Dr Sharma could see him at eleven in the morning. The doctor listened carefully, checked his temperature and told him to drink warm water and rest for three days. By the weekend, Arjun felt much better and was ready to play cricket again.',
      questions: [
        { q: 'What was wrong with Arjun?', options: ['A broken arm', 'A sore throat and a fever', 'A stomach ache'], answer: 1 },
        { q: 'How long did the doctor tell him to rest?', options: ['Three days', 'One week', 'Two hours'], answer: 0 },
        { q: 'What did Arjun want to do at the weekend?', options: ['Visit his cousins', 'Go to the clinic', 'Play cricket'], answer: 2 },
      ] },
    { id: 'u-rainwater', level: 3, title: 'Saving Rainwater',
      text: 'In many towns, families now collect rainwater on their rooftops. Pipes carry the water into large tanks, where it is stored for the dry months. This simple idea helps people in two ways. First, they spend less money on water. Second, the ground stays wetter, so wells do not dry up as quickly. If every home saved a little water each day, our cities would face fewer shortages in summer.',
      questions: [
        { q: 'Where do families collect rainwater?', options: ['On their rooftops', 'In the river', 'In the school'], answer: 0 },
        { q: 'Why do wells not dry up as quickly?', options: ['People use less soap', 'The ground stays wetter', 'It rains every day'], answer: 1 },
        { q: 'What would happen if every home saved water?', options: ['Water would cost more', 'Tanks would break', 'Cities would face fewer shortages'], answer: 2 },
      ] },
    { id: 'u-library', level: 3, title: 'The New Library',
      text: 'When the new library opened in our neighbourhood, nobody expected it to be so busy. Children came after school to borrow comics, while older readers looked for newspapers in different languages. The librarian started a reading club that meets every Saturday. Members choose one book each month and share their opinions. Many of them say that talking about books has made them more confident speakers.',
      questions: [
        { q: 'What did children borrow after school?', options: ['Comics', 'Newspapers', 'Games'], answer: 0 },
        { q: 'When does the reading club meet?', options: ['Every Monday', 'Every Saturday', 'Once a year'], answer: 1 },
        { q: 'How has talking about books helped the members?', options: ['They read faster', 'They write better letters', 'They speak more confidently'], answer: 2 },
      ] },
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
  const ORDER = ['read:morning-walk', 'read:good-listener', 'read:unseen', 'write:w-summary-listener', 'speak:s-intro-job', 'write:w-leave-email',
    'speak:s-weekend', 'write:w-opinion-phones', 'speak:s-goal', 'write:w-reply-customer'];

  function lessons() {
    const T = root.AnswerTasks;
    return ORDER.map(ref => {
      const [kind, id] = ref.split(':'), K = KINDS[kind];
      let l;
      if (ref === 'read:unseen') { // the unseen passages, as one lesson: best first-reading score
        const done = get('rc-unseen', {}), firsts = Object.values(done).map(d => d.first).filter(Boolean);
        const lastAt = Object.values(done).map(d => (d.last || d.first)).filter(Boolean).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
        return { kind: 'read', id: 'unseen', kindName: 'Read aloud', title: 'Unseen passages', max: 10, href: 'unseen.html',
          desc: 'Read a passage you haven\u2019t seen before. It appears only when you start.', meta: `${firsts.length} of ${UNSEEN.length} read`,
          best: firsts.length ? Math.max(...firsts.map(f => f.total)) : null, last: lastAt ? { at: lastAt.at, total: lastAt.total } : null, done: firsts.length > 0 };
      }
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

  root.Course = { PASSAGES, UNSEEN, KINDS, ICON, keyFor, lessons, summary, mountTopbar, svg };

  // keep the course on the device so it opens offline after the first visit (web only; an app's own files are already offline)
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('commkit-sw.js').then(() => navigator.serviceWorker.ready)
      .then(reg => {
        // the whole course, so every tab opens offline after one visit (versioned ?v= URLs fall back to these copies)
        const msg = { type: 'cache', urls: ['plan.html', 'index.html', 'write.html', 'speak.html', 'unseen.html', 'kit/commkit.js', 'css/base.css', 'css/course.css',
          'js/course.js', 'js/tasks.js', 'js/scoring.js', 'js/answer-scoring.js', 'js/answer-ui.js', 'js/speech.js', 'js/whisper.js',
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

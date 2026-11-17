/*
  Shared by write.html and speak.html: asking the AI (when online) and drawing the six-part feedback as course cards.
  The AI call goes to /api/evaluate on the same site; the API key never reaches the page.
*/
(function (root) {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // Returns { data } or { reason } — reason is a short, user-facing explanation of why there is no AI feedback.
  async function askAI(payload, { timeoutMs = 30000 } = {}) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { reason: 'offline' };
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch('api/evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctl.signal });
      if (r.ok) return { data: await r.json() };
      const err = await r.json().catch(() => ({}));
      return { reason: [404, 405, 501].includes(r.status) ? 'no-server' : err.error || `http-${r.status}` };
    } catch (e) {
      return { reason: e.name === 'AbortError' ? 'timeout' : 'offline' };
    } finally { clearTimeout(t); }
  }
  const REASONS = {
    offline: 'You are offline, so this was checked on the device only.',
    'no-server': 'Detailed AI feedback isn’t available on this server, so this was checked on the device only.',
    ai_not_configured: 'Detailed AI feedback isn’t set up yet, so this was checked on the device only.',
    timeout: 'The AI took too long, so this was checked on the device only.',
    too_many_requests: 'Too many checks just now; this was checked on the device only. Try again in a few minutes.',
  };
  const reasonText = r => REASONS[r] || 'Detailed AI feedback isn’t available right now, so this was checked on the device only.';

  // Highlight what changed between two texts, word by word.
  function diffMark(before, after) {
    const a = before.split(/(\s+)/), b = after.split(/(\s+)/);
    const A = a.filter((_, i) => i % 2 === 0), B = b.filter((_, i) => i % 2 === 0);
    const n = A.length, m = B.length, L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const keep = new Set(); let i = 0, j = 0;
    while (i < n && j < m) { if (A[i] === B[j]) { keep.add(j); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
    const seps = b.filter((_, k) => k % 2 === 1);
    return B.map((w, k) => (keep.has(k) ? esc(w) : `<mark>${esc(w)}</mark>`) + (seps[k] !== undefined ? esc(seps[k]) : '')).join('');
  }

  function ring(total, max) {
    const r = 40, c = 2 * Math.PI * r, f = total / max;
    return `<svg class="ring" viewBox="0 0 96 96" role="img" aria-label="${total} out of ${max}">
      <circle class="bg" cx="48" cy="48" r="${r}" fill="none" stroke-width="9"/>
      <circle class="fg" cx="48" cy="48" r="${r}" fill="none" stroke-width="9" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 48 48)"/>
      <text x="48" y="52" text-anchor="middle">${total}<tspan class="of" dx="1">/${max}</tspan></text></svg>`;
  }

  // The six-part feedback as course cards, shared by Write and Speak.
  // r: result from AnswerScore (device or merged). original: the learner's text or transcript.
  // showBetter: false hides the device's "better version" (for speech it is only the raw transcript).
  // middle: extra cards after the score (Speak's timing facts). after: extra cards at the end.
  function feedbackCards(r, { original, note, model, showBetter = true, middle = '', after = '', betterTitle = 'A better version of your answer' }) {
    const crit = r.criteria.map(c => `<div class="crit">
        <div class="crit-top"><span class="crit-nm">${esc(c.label)}</span><span class="crit-sc">${c.score}/4</span></div>
        <div class="segs" aria-hidden="true">${[1, 2, 3, 4].map(k => `<i class="${k <= c.score ? 'on' : ''}"></i>`).join('')}</div>
        <p>${esc(c.reason)}</p>
        ${c.by === 'ai' ? '<span class="by">Checked with AI</span>' : r.mode === 'speak' && (c.id === 'fluency' || c.id === 'clarity') ? '<span class="by">Measured on the device</span>' : ''}
      </div>`).join('');
    const well = r.well.length ? `<ul class="list good">${r.well.map(w => `<li><span class="dot">✓</span><span>${esc(w)}</span></li>`).join('')}</ul>` : '<p class="ai-note">Your next try will show what went well.</p>';
    const fix = r.improve.length ? `<ul class="list fix">${r.improve.map((i, k) => `<li><span class="dot">${k + 1}</span><span>${i.quote ? `<span class="q">${esc(i.quote)}</span>` : ''}${i.quote && i.better ? ' → ' : ''}${i.better ? `<span class="b">${esc(i.better)}</span>` : ''}<span class="why">${esc(i.why)}</span></span></li>`).join('')}</ul>` : '<p class="ai-note">Nothing important to fix. Well done.</p>';
    const better = showBetter && r.corrected && r.corrected.trim() !== String(original || '').trim() ? diffMark(String(original || ''), r.corrected) : null;
    const tips = r.tips && r.tips.length ? `<section class="card"><h2>Tips</h2><ul class="list good">${r.tips.slice(0, 3).map(t => `<li><span class="dot">i</span><span>“${esc(t.quote)}”: ${esc(t.msg)}</span></li>`).join('')}</ul></section>` : '';
    return `
      <section class="card scorecard">
        ${ring(r.total, r.max || 16)}
        <div><p class="lvl">${esc(r.level)}</p><p class="lvl-sub">${esc(r.summary || r.headline)}</p>
          <div class="tags"><span class="tag ${r.source === 'ai' ? 'ai' : ''}">${r.source === 'ai' ? 'Checked with AI and on the device' : 'Checked on the device'}</span></div>
          ${note ? `<p class="ai-note">${esc(note)}</p>` : ''}</div>
      </section>
      ${middle}
      <section class="card"><h2>How you did</h2><div class="crits">${crit}</div></section>
      <div class="two">
        <section class="card"><h2>What went well</h2>${well}</section>
        <section class="card"><h2>Things to improve</h2>${fix}</section>
      </div>
      ${tips}
      ${better
        ? `<section class="paper notebook"><p class="paper-title">${esc(betterTitle)}</p><p class="paper-text ruled better-text">${better}</p>
             <div class="paper-foot"><span class="grow">Changed words are highlighted.</span></div>
             ${model ? `<details class="more" style="margin-top:12px"><summary>See a model answer</summary><p class="paper-text ruled" style="margin-top:6px">${esc(model)}</p></details>` : ''}</section>`
        : model ? `<section class="paper notebook"><p class="paper-title">A model answer</p><p class="paper-text ruled">${esc(model)}</p>
             <div class="paper-foot"><span class="grow">Use it for ideas, then say it in your own words.</span></div></section>` : ''}
      ${after}`;
  }

  root.AnswerUI = { askAI, reasonText, feedbackCards, ring, diffMark, esc };
})(typeof self !== 'undefined' ? self : this);

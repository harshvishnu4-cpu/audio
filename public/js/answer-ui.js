/*
  Shared by write.html and speak.html: asking the AI (when online) and drawing the six-part feedback.
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

  // r: result from AnswerScore (device or merged). original: the learner's text or transcript.
  function renderFeedback(el, r, { original, aiNote, onRetry, modelAnswer, extraHTML = '' }) {
    const crit = r.criteria.map(c => `<tr><td>${esc(c.label)}${c.by === 'ai' ? '<small>checked with AI</small>' : r.mode === 'speak' && (c.id === 'fluency' || c.id === 'clarity') ? '<small>measured on the device</small>' : ''}</td><td class="m">${c.score}/4</td><td>${esc(c.reason)}</td></tr>`).join('');
    const improve = r.improve.length ? `<ol class="fixes">${r.improve.map(i =>
      `<li>${i.quote ? `<span class="q">${esc(i.quote)}</span>` : ''}${i.quote && i.better ? ' → ' : ''}${i.better ? `<span class="b">${esc(i.better)}</span>` : ''}<span class="why">${esc(i.why)}</span></li>`).join('')}</ol>` : '<p class="meta">Nothing important to fix. Well done.</p>';
    const better = r.corrected && r.corrected.trim() !== String(original).trim() ? diffMark(String(original), r.corrected) : null;
    el.innerHTML = `
      <div class="result-head">
        <div class="grade"><span>${r.total}<small>/16</small></span></div>
        <div><p class="level">${esc(r.level)}</p><p class="headline">${esc(r.summary || r.headline)}</p>
          <div class="badges"><span class="badge ${r.source === 'ai' ? 'ai' : ''}">${r.source === 'ai' ? 'Checked with AI and on the device' : 'Checked on the device'}</span></div></div>
      </div>
      ${aiNote ? `<p class="meta" style="margin-top:10px">${esc(aiNote)}</p>` : ''}
      ${extraHTML}
      <table class="crit"><thead><tr><th>Criterion</th><th>Marks</th><th>Why</th></tr></thead><tbody>${crit}</tbody></table>
      <h3>What went well</h3>
      ${r.well.length ? `<ul class="well">${r.well.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p class="meta">Keep going: your next try will show what went well.</p>'}
      <h3>Things to improve</h3>
      ${improve}
      ${better ? `<h3>A better version</h3><p class="better">${better}</p>` : ''}
      ${r.tips && r.tips.length ? `<h3>Tips</h3><ul class="tips">${r.tips.slice(0, 3).map(t => `<li>“${esc(t.quote)}”: ${esc(t.msg)}</li>`).join('')}</ul>` : ''}
      ${modelAnswer ? `<details class="model"><summary>See a model answer</summary><p class="better">${esc(modelAnswer)}</p></details>` : ''}
      <div class="next"><button type="button" class="primary" data-act="retry">Try again</button></div>`;
    el.querySelector('[data-act="retry"]').onclick = onRetry;
    el.hidden = false;
  }

  root.AnswerUI = { askAI, reasonText, renderFeedback, diffMark, esc };
})(typeof self !== 'undefined' ? self : this);

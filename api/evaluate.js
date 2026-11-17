// POST /api/evaluate  { taskId, answer, metrics? }  ->  AI rubric feedback (JSON)
// The API key lives only in the server environment (ANTHROPIC_API_KEY on Vercel), never in the page.
// Only the tasks in public/js/tasks.js can be marked, so this can't be used as a general chatbot.
const sdk = require('@anthropic-ai/sdk');
const Anthropic = sdk.default || sdk;
const { buildRequest, validate } = require('./_lib/feedback.js');

// Light per-instance limit (serverless instances don't share memory, so this only blunts bursts).
const WINDOW_MS = 5 * 60 * 1000, LIMIT = 30, hits = new Map();
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  list.push(now); hits.set(ip, list);
  return list.length > LIMIT;
}

let client = null;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method_not_allowed' }); }

  // same-site pages only
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch (e) {}
    if (host !== req.headers.host) return res.status(403).json({ error: 'forbidden_origin' });
  }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'too_many_requests' });

  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'ai_not_configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const built = buildRequest(body);
  if (built.error) return res.status(400).json({ error: built.error });

  client = client || new Anthropic();
  try {
    const msg = await client.beta.messages.create(built.params);
    if (msg.stop_reason === 'refusal') return res.status(422).json({ error: 'declined' });
    const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    let data = null;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    const clean = validate(built.mode, data, built.answer);
    if (!clean) return res.status(502).json({ error: 'bad_ai_output' });
    return res.status(200).json({ ...clean, model: msg.model });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'ai_busy' });
    if (error instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: 'ai_not_configured' });
    if (error instanceof Anthropic.BadRequestError) { console.error('AI bad request:', error.message); return res.status(502).json({ error: 'ai_request_failed' }); }
    if (error instanceof Anthropic.APIError) { console.error(`AI error ${error.status}:`, error.message); return res.status(502).json({ error: 'ai_error' }); }
    console.error('AI call failed:', error);
    return res.status(502).json({ error: 'ai_unreachable' });
  }
};

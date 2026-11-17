/*
  Better recognition for free speech (the Speak page): Whisper, an open speech model, running in the
  browser through transformers.js. Free: no API key, no server, and the audio never leaves the device.

  • Used only for open answers. Reading aloud keeps Vosk, which listens for the passage's own words
    (Whisper tends to "fix" what it hears into fluent English, which would hide reading mistakes).
  • Loaded on first use when online: the library (~1 MB) and the model (tiny.en, about 40 MB) are
    downloaded once and kept by the browser, so it also works offline afterwards.
  • If it can't load or run (offline before the first download, an old browser), the page keeps the
    Vosk result, so nothing breaks.
*/
(function (root) {
  'use strict';
  const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
  const MODELS = { tiny: 'Xenova/whisper-tiny.en', base: 'Xenova/whisper-base.en' };
  let pipe = null, loading = null, failed = null, modelName = null;

  function setting() { try { return JSON.parse(localStorage.getItem('rc-whisper')) ?? 'tiny'; } catch (e) { return 'tiny'; } }
  // off when the learner turned it off, or the browser asked to save data
  function enabled() { return setting() !== 'off' && !(navigator.connection && navigator.connection.saveData); }

  // Load the model (once). onProgress(fraction 0–1) while downloading.
  function load(onProgress) {
    if (pipe) return Promise.resolve(true);
    if (loading) return loading;
    loading = (async () => {
      try {
        const { pipeline, env } = await import(LIB);
        env.allowLocalModels = false; // models come from the Hugging Face hub, then the browser cache
        const files = {};
        modelName = MODELS[setting()] || MODELS.tiny;
        pipe = await pipeline('automatic-speech-recognition', modelName, {
          progress_callback: p => {
            if (p.status === 'progress' && p.total) { files[p.file] = [p.loaded, p.total]; }
            if (onProgress) { const v = Object.values(files); if (v.length) onProgress(v.reduce((t, [l]) => t + l, 0) / v.reduce((t, [, s]) => t + s, 0)); }
          },
        });
        return true;
      } catch (e) {
        failed = e; loading = null; console.warn('[Whisper] not available:', e.message || e);
        return false;
      }
    })();
    return loading;
  }

  // Any recording (URL or Blob) as 16 kHz mono, which Whisper expects.
  async function toPcm16k(src) {
    const data = src instanceof Blob ? await src.arrayBuffer() : await (await fetch(src)).arrayBuffer();
    const ac = new (root.AudioContext || root.webkitAudioContext)();
    const decoded = await ac.decodeAudioData(data); ac.close && ac.close();
    const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    const s = off.createBufferSource(); s.buffer = decoded; s.connect(off.destination); s.start();
    return { pcm: (await off.startRendering()).getChannelData(0), duration: decoded.duration };
  }

  // Transcribe a recording. Returns engine-style words [{ word, conf, start, end }] (times spread over each
  // segment by length; pauses are measured from the audio itself, so this is enough), or null if unavailable.
  async function transcribe(src, onProgress) {
    if (!enabled() || !(await load(onProgress))) return null;
    try {
      const { pcm, duration } = await toPcm16k(src);
      const out = await pipe(pcm, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 });
      const segments = out.chunks && out.chunks.length ? out.chunks : [{ text: out.text, timestamp: [0, duration] }];
      const words = [];
      for (const seg of segments) {
        const [s0, s1raw] = seg.timestamp || [0, duration], s1 = s1raw ?? duration;
        const parts = String(seg.text).replace(/\[[^\]]*\]|\([^)]*\)/g, ' ') // drop "[BLANK_AUDIO]", "(music)"
          .toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
        const total = parts.reduce((t, w) => t + w.length + 1, 0) || 1;
        let t = s0;
        for (const w of parts) { const d = ((w.length + 1) / total) * Math.max(0.1, s1 - s0); words.push({ word: w, conf: 1, start: +t.toFixed(2), end: +(t + d * 0.9).toFixed(2) }); t += d; }
      }
      return { words, text: words.map(w => w.word).join(' '), model: modelName };
    } catch (e) { console.warn('[Whisper] failed:', e.message || e); return null; }
  }

  root.Whisper = { load, transcribe, enabled, setting, get ready() { return !!pipe; }, get error() { return failed; }, MODELS };
})(typeof self !== 'undefined' ? self : this);

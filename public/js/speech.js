/*
  On-device speech for free answers (Speak page): load the Vosk model, listen with open vocabulary,
  and measure loudness (pauses and a noise estimate). Same engine and model as the reading page.
*/
(function (root) {
  'use strict';
  const MODELS = [
    { id: 'en-in-small', url: 'models/en-in.tar.gz' },
    { id: 'en-us-small', url: 'models/candidates/en-us-small.tar.gz' },
  ];
  let model = null, modelId = null, ctx = null;

  async function load() {
    let id = 'en-in-small';
    try { id = JSON.parse(localStorage.getItem('rc-model')) || id; } catch (e) {}
    const m = MODELS.find(x => x.id === id) || MODELS[0];
    if (model && modelId === m.id) return true;
    try { model = await root.Vosk.createModel(m.url); modelId = m.id; return true; }
    catch (e) {
      if (m.id !== MODELS[0].id) { model = await root.Vosk.createModel(MODELS[0].url); modelId = MODELS[0].id; return true; }
      console.error(e); return false;
    }
  }
  const audio = () => (ctx = ctx || new AudioContext());

  // vosk-browser posts one message per audio chunk plus one for retrieveFinalResult,
  // so the final result is message number (chunksSent + 1).
  function session(sampleRate, onPartial) {
    const r = new model.KaldiRecognizer(sampleRate);
    r.setWords(true);
    const words = []; let sent = 0, got = 0, target = Infinity, resolveDone;
    const done = new Promise(res => (resolveDone = res));
    const tick = () => { if (++got >= target) resolveDone(); };
    r.on('result', m => { if (m.result && m.result.result) words.push(...m.result.result); if (onPartial) onPartial(words.map(w => w.word).join(' ')); tick(); });
    r.on('partialresult', m => { if (onPartial && m.result) onPartial((words.map(w => w.word).join(' ') + ' ' + (m.result.partial || '')).trim()); tick(); });
    return {
      feed(f32, sr) { r.acceptWaveformFloat(f32, sr); sent++; },
      async finish() {
        target = sent + 1; r.retrieveFinalResult(); if (got >= target) resolveDone();
        await Promise.race([done, new Promise(res => setTimeout(res, 20000))]);
        r.remove();
        return words;
      },
    };
  }

  // loudness in 20 ms slices: quiet stretches (pauses) and speech-over-background (noise) in dB
  function loudness(sampleRate) {
    const frame = Math.round(sampleRate * 0.02), rms = [];
    let sum = 0, n = 0;
    const sorted = () => [...rms].sort((a, b) => a - b), pick = (so, p) => so[Math.min(so.length - 1, Math.floor(p * so.length))];
    return {
      push(f32) { for (let i = 0; i < f32.length; i++) { sum += f32[i] * f32[i]; if (++n === frame) { rms.push(Math.sqrt(sum / frame)); sum = 0; n = 0; } } },
      snrDb() { if (rms.length < 10) return null; const so = sorted(); return Math.min(60, 20 * Math.log10((pick(so, 0.9) + 1e-9) / (pick(so, 0.1) + 1e-9))); },
      silences() {
        if (rms.length < 10) return [];
        const so = sorted(), floor = pick(so, 0.1), loud = pick(so, 0.95), th = floor + (loud - floor) * 0.1;
        const out = []; let from = null;
        rms.forEach((v, i) => { if (v < th) { if (from === null) from = i; } else if (from !== null) { out.push({ from: from * 0.02, to: i * 0.02 }); from = null; } });
        if (from !== null) out.push({ from: from * 0.02, to: rms.length * 0.02 });
        return out;
      },
      seconds() { return rms.length * 0.02; },
    };
  }

  // Listen to the microphone (or play a recording aloud) until stop() is called or the audio ends.
  async function listen({ stream, buffer, onLevel, onPartial, onEnd }) {
    const ac = audio(); await ac.resume();
    const s = session(ac.sampleRate, onPartial), loud = loudness(ac.sampleRate);
    let src;
    if (stream) src = ac.createMediaStreamSource(stream);
    else { src = ac.createBufferSource(); src.buffer = buffer; src.connect(ac.destination); }
    const node = ac.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = e => { const c = e.inputBuffer.getChannelData(0).slice(); loud.push(c); s.feed(c, ac.sampleRate); };
    src.connect(node); node.connect(ac.destination);
    const an = ac.createAnalyser(); an.fftSize = 512; src.connect(an);
    const buf = new Float32Array(an.fftSize); let raf = 0;
    const meter = () => { an.getFloatTimeDomainData(buf); let q = 0; for (const v of buf) q += v * v; if (onLevel) onLevel(Math.min(1, Math.sqrt(q / buf.length) * 8)); raf = requestAnimationFrame(meter); };
    meter();
    let mr = null; const chunks = [];
    if (stream) { mr = new MediaRecorder(stream); mr.ondataavailable = e => chunks.push(e.data); mr.start(); }
    let stopped = null;
    const stop = () => stopped || (stopped = (async () => {
      cancelAnimationFrame(raf); if (onLevel) onLevel(0);
      if (!stream) { src.onended = null; try { src.stop(); } catch (e) {} }
      node.disconnect(); src.disconnect(); an.disconnect();
      let playUrl = null;
      if (mr) { playUrl = await new Promise(res => { mr.onstop = () => res(URL.createObjectURL(new Blob(chunks, { type: mr.mimeType }))); mr.stop(); }); stream.getTracks().forEach(t => t.stop()); }
      const words = await s.finish();
      return { words, silences: loud.silences(), snrDb: loud.snrDb(), durationSec: loud.seconds(), playUrl };
    })());
    if (!stream) { src.onended = () => { if (onEnd) onEnd(); }; src.start(); }
    return { stop };
  }

  // Check a recording file without playing it (fast; for samples and tests).
  async function checkFile(url) {
    const ac = audio(), a = await ac.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const d = a.getChannelData(0), sr = a.sampleRate, s = session(sr), loud = loudness(sr);
    for (let i = 0; i < d.length; i += 4096) { const c = d.slice(i, i + 4096); loud.push(c); s.feed(c, sr); }
    const words = await s.finish();
    return { words, silences: loud.silences(), snrDb: loud.snrDb(), durationSec: a.duration, playUrl: url };
  }

  root.Speech = { load, listen, checkFile, audio, get ready() { return !!model; } };
})(typeof self !== 'undefined' ? self : this);

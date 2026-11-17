# Reading Check

Speaking and writing practice for an English communication course, built to run **offline on a tablet**. `plan.html` is the home page (**My learning plan**): every lesson in order on a path, the next one to do, Total / Completed / Upcoming counts and your recent tries. Three activities, switched from the black bar at the top of every page:

| Activity | Page | What the learner does | How it is checked |
|---|---|---|---|
| **Read aloud** | `index.html` | Reads a passage aloud | On the device (Vosk speech engine): missed, changed and added words, pace, pauses, rubric out of 10 |
| **Unseen passage** | `unseen.html` | Reads a new passage once, without seeing it first (it appears when recording starts) | On the device: the same checks and rules as Read aloud, under test conditions (no highlighting); the first reading is the score; three comprehension questions; the recording can be played back or saved. **Testing tools** on the page: sample recordings, check an audio file, highlight words while reading, show what the listener heard (both passes), reset scores |
| **Write** | `write.html` | Types an email, summary, opinion or reply | On the device: key points, length, common slips, structure, tone. **When online**, an AI model adds rubric marks, specific fixes and a better version |
| **Speak** | `speak.html` | Records a self-introduction or an answer to a question | On the device: key points, speaking time, pace, pauses, clarity, common slips. The words are heard by **Whisper** (an open model running in the browser, free, no API; about 40 MB downloaded once, then kept) with the offline Vosk listener as the fallback. **When online**, the AI marks content and grammar from the transcript (the audio never leaves the device) |

**CommKit** (`public/kit/`) packs the same offline audio and text checking into one script for other games and interactive pages: paste-in tags (`<read-aloud>`, `<speak-answer>`, `<write-answer>`) and a JavaScript API (`CommKit.hear`, `readAloud`, `listenFor`, `checkText`, `compareText`, `say`, …). `npm run kit` builds a copy-ready folder in `dist/commkit/`. See `public/kit/README.md`, the demo at `/kit/`, and the example games in `/kit/examples/`.

Written and spoken feedback both use the same six parts: level and score (out of 16), marks per criterion, what went well, at most two things to improve (using the learner's own words), a better version, and a next step.

## Folders

| Folder | What it is |
|---|---|
| `public/` | **The website.** Vercel serves this folder as the site root (see `vercel.json`). |
| `public/css/` | `base.css` is the shared course look for every page (black top bar, panel, pastel lesson cards, steps, paper surfaces, score ring, floating action bar); `course.css` adds the Write and Speak parts |
| `public/lib/` | `vosk.js` (offline speech engine) and `gsap.min.js` (GSAP 3.13 animations, under GSAP's free standard licence), kept with the app so both work offline |
| `public/js/` | `course.js` (the reading passages, the learning-plan order, progress and the shared top bar), `scoring.js` (read aloud), `answer-scoring.js` (write and speak, offline), `tasks.js` (the writing and speaking tasks), `answer-ui.js` (feedback display and the AI call), `speech.js` (on-device listening for the Speak page), `motion.js` (the animations: cards arriving, the learning path drawing itself, score rings counting up with confetti for great scores, key points popping, the mic pulsing; nothing moves when the device asks for reduced motion) |
| `api/evaluate.js` | Vercel server function that asks the AI for feedback. Only the tasks in `tasks.js` can be marked |
| `tests/` | Unit tests for all the scoring rules and the server function |
| `public/kit/` | CommKit: `commkit.js`, a demo page, its guide (`README.md`) and two example games |
| `public/commkit-sw.js` | Offline cache for the course and CommKit pages |
| `tools/` | `check_passage_words.py` (`npm run words`): checks every passage word is in the speech model's vocabulary (a word the model doesn't know would always be marked skipped); `make_noisy_samples.py`: builds the noisy test recordings; `build_kit.sh`: builds `dist/commkit/` (`npm run kit`) |
| `docs/testing-on-tablet.md` | How to test on a tablet and inside the Android app, plus test results |
| `docs/superpowers/specs/` | The design doc |
| `downloads/` | The original Vosk model zips (not part of the website) |

## Turn on the AI feedback (Write and Speak)

1. Get an API key from the [Claude Console](https://console.anthropic.com/).
2. In Vercel: **Project → Settings → Environment Variables**, add `ANTHROPIC_API_KEY` with the key, then redeploy.

Without the key, Write and Speak still work fully on the device, and say "checked on the device only". The key stays on the server; the page never sees it.

- **Model:** Claude Opus 5.5 at low effort, with JSON output fixed to a schema. A declined request automatically retries on another model.
- **Cost:** about 1,500 tokens in and 600 out per answer, so about $0.02 (₹1.5–2) at $4 / $20 per million tokens. To save more, change `MODEL` in `api/_lib/feedback.js`.
- **Guards:** only known tasks are accepted; answers are capped at 2,500 characters; requests from other websites are refused; a light rate limit applies per server instance. Anyone who can open the site can still use up credits, so add sign-in before a wide launch.
- **Privacy:** only text is sent (for speech, the transcript). Under India's DPDP Act, learners and parents of under-18s need to be told this and consent before AI feedback is used.

## Run it locally

**In VS Code:** click **Go Live** in the status bar (Live Server extension). `.vscode/settings.json` points Live Server at `public/`, so it opens the page at http://127.0.0.1:5500.

**From a terminal:**

```bash
python3 -m http.server 8765 --directory public
```

Then open http://localhost:8765.

Either way, the page must be served over `http://localhost`, `http://127.0.0.1` or `https`. Opening `index.html` directly as a file (double-click, `file://`) stops the speech engine and microphone from working. The local server has no `/api`, so Write and Speak show device-only feedback there.

## Tests

```bash
npm install
npm test
```

## Deploy on Vercel

Push to GitHub. Vercel reads `vercel.json`, serves `public/`, and runs `api/evaluate.js` as a server function.

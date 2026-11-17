# Reading Check

Speaking and writing practice for an English communication course, built to run **offline on a tablet**. Three activities, switched from the top of every page:

| Activity | Page | What the learner does | How it is checked |
|---|---|---|---|
| **Read aloud** | `index.html` | Reads a passage aloud | On the device (Vosk speech engine): missed, changed and added words, pace, pauses, rubric out of 10 |
| **Write** | `write.html` | Types an email, summary, opinion or reply | On the device: key points, length, common slips, structure, tone. **When online**, an AI model adds rubric marks, specific fixes and a better version |
| **Speak** | `speak.html` | Records a self-introduction or an answer to a question | On the device: key points, speaking time, pace, pauses, clarity, common slips. **When online**, the AI marks content and grammar from the transcript (the audio never leaves the device) |

Written and spoken feedback both use the same six parts: level and score (out of 16), marks per criterion, what went well, at most two things to improve (using the learner's own words), a better version, and a next step.

## Folders

| Folder | What it is |
|---|---|
| `public/` | **The website.** Vercel serves this folder as the site root (see `vercel.json`). |
| `public/css/` | `base.css` is the shared course look for all three pages (header, tabs, lesson cards, steps, paper surfaces, score ring, buttons); `course.css` adds the Write and Speak parts |
| `public/js/` | `scoring.js` (read aloud), `answer-scoring.js` (write and speak, offline), `tasks.js` (the writing and speaking tasks), `answer-ui.js` (feedback display and the AI call), `speech.js` (on-device listening for the Speak page) |
| `api/evaluate.js` | Vercel server function that asks the AI for feedback. Only the tasks in `tasks.js` can be marked |
| `tests/` | Unit tests for all the scoring rules and the server function |
| `tools/` | `make_noisy_samples.py`: builds the noisy test recordings |
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

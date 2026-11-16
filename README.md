# Reading Check

A learner reads a passage aloud on a tablet. The page listens **offline, on the device** (Vosk speech engine), follows along word by word, and then marks words that were missed, read differently or added.

## Folders

| Folder | What it is |
|---|---|
| `public/` | **The website.** Vercel serves this folder as the site root (see `vercel.json`). |
| `tests/` | Unit tests for the scoring rules in `public/js/scoring.js` |
| `docs/testing-on-tablet.md` | How to test on a tablet and inside the Android app, plus the test results so far |
| `docs/superpowers/specs/` | The design doc |
| `downloads/` | The original Vosk model zip that `public/models/en-in.tar.gz` was repacked from (not part of the website) |

## Run it locally

**In VS Code:** click **Go Live** in the status bar (Live Server extension). `.vscode/settings.json` points Live Server at `public/`, so it opens the page at http://127.0.0.1:5500.

**From a terminal:**

```bash
python3 -m http.server 8765 --directory public
```

Then open http://localhost:8765.

Either way, the page must be served over `http://localhost`, `http://127.0.0.1` or `https`. Opening `index.html` directly as a file (double-click, `file://`) stops the speech engine and microphone from working.

## Tests

The scoring rules have unit tests (Node 18 or newer):

```bash
node --test tests/scoring.test.js
```

## Deploy on Vercel

Push to GitHub. Vercel reads `vercel.json`, skips any build step, and serves `public/`.

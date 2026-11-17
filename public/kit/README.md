# CommKit

Offline audio and text checking for learning games and interactive HTML pages. Add one script and a page can:

- listen to a learner **read a text aloud**, follow along word by word, and mark it out of 10
- **hear which word** a learner says (for games)
- **write down** what a learner says
- **score a spoken answer** or a **written answer** out of 16 (key points, length, common slips, structure)
- **check typing** word by word (dictation, "type what you hear")
- **read text aloud** with the device's own voice

Everything runs on the device. Speech is recognised by the Vosk engine with an Indian English model, so nothing is sent anywhere and it works without internet.

Open `kit/index.html` to see it working, and `kit/examples/` for two small games.

## 1. Add it to your project

Run `npm run kit` in this repository. It builds `dist/commkit/` (and `dist/commkit.zip`). Copy the contents of that folder into the **root** of your web project or your Android app's assets:

```
your-project/
  kit/commkit.js         the kit
  lib/vosk.js            speech engine (5.8 MB)
  js/scoring.js          reading-aloud scoring
  js/answer-scoring.js   spoken and written answer scoring
  models/en-in.tar.gz    speech model (37 MB, loaded the first time a page listens)
  commkit-sw.js          offline cache (optional, for websites)
  your-game.html
```

Then add one line to any page:

```html
<script src="kit/commkit.js"></script>
```

The kit finds the other files from its own location (one folder up from `kit/`). If your folders are different, say where they are on the script tag:

```html
<script src="assets/commkit.js" data-root="./" data-model="speech/en-in.tar.gz"></script>
```

Text-only features (`checkText`, `compareText`, `<write-answer>`) never load the speech engine or model.

## 2. Paste a ready tag (no coding)

```html
<read-aloud heading="Read aloud" text="The cat sat on the mat."></read-aloud>

<speak-answer
  prompt="What did you do last weekend?"
  min-sec="45" max-sec="60"
  points="when: saturday, sunday; what you did: went, visited, played; how you felt: happy, tired">
</speak-answer>

<write-answer
  format="email"  min-words="60" max-words="110"
  prompt="Write an email to your manager asking for one day's leave."
  points="asks for leave: leave, day off; gives a reason: because, wedding, sick">
</write-answer>
```

| Tag | Attributes |
|---|---|
| `<read-aloud>` | `text` (or put the text between the tags), `heading`, `sample` (a recording URL; shows "Try a sample") |
| `<speak-answer>` | `prompt`, `points`, `min-sec`, `max-sec`, `sample` |
| `<write-answer>` | `prompt`, `points`, `min-words`, `max-words`, `format` (`email`, `reply`, `summary`, `opinion`, or leave it out), `passage` (for summaries: copying from it is noticed), `placeholder` |

**`points`** are the key points a good answer covers: `label: words that show it; next label: …`. A point ticks when any of its words is used (word endings don't matter: "visit" also finds "visited").

Every tag fires a `result` event, and has `start()`, `stop()` and `reset()`:

```js
document.querySelector('read-aloud').addEventListener('result', e => {
  console.log(e.detail.score, e.detail.missed);
});
```

Change the look with CSS variables on the tag: `--ck-accent` (buttons), `--ck-tone` (result box), `--ck-good`, `--ck-fix`, `--ck-radius`, `--ck-font`.

## 3. Use it in a game

```js
// Wait for one of a few words (fast and accurate: it only listens for these)
const said = await CommKit.hear(['apple', 'banana', 'mango'], { timeout: 6000 });
if (said.word === 'banana') score++;              // said.word is null if none was heard

// Keep listening for a whole round (one microphone session)
const round = CommKit.listenFor(['apple', 'banana', 'mango'], {
  onWord: word => popBalloon(word),
  onLevel: v => meter.style.width = v * 100 + '%',
});
round.stop();                                     // at the end of the round

// Follow a reading live, then get the marks
const reading = CommKit.readAloud({ text, onProgress: (i, total) => moveRocket(i / total) });
const r = await reading.done;                     // stops by itself after the last word and a pause
```

## All functions

| Function | Gives back |
|---|---|
| `CommKit.readAloud({ text, onProgress(i, total, word), onLevel(0–1), autoStop = true, maxSeconds = 120, audio })` | a session: `.done` → `{ score, max: 10, marks: { accuracy, pace, phrasing }, accuracy, wcpm, headline, tip, words: [{ text, status, heard }], missed, changed, added, tooNoisy, heardTooLittle, recording }`; `.stop()` |
| `CommKit.hear(words, { timeout = 8000, onPartial, onLevel, audio })` | `Promise` → `{ word, heard, confidence, timedOut }` |
| `CommKit.listenFor(words, { onWord(word), onPartial, onLevel, maxSeconds = 600, audio })` | a session: `.stop()`, `.done` |
| `CommKit.listen({ onPartial(text), onLevel, maxSeconds, audio })` | a session: `.done` → `{ text, words, durationSec, pauses, snrDb, recording }` |
| `CommKit.speakAnswer({ task, onPartial, onLevel, audio })` | a session: `.done` → `{ score, max: 16, level, headline, criteria, well, improve, transcript, keyPoints, stats, refused }` |
| `CommKit.checkText(text, task)` | `Promise` → `{ score, max: 16, level, headline, criteria, well, improve, corrected, keyPoints }` |
| `CommKit.keyPoints(text, task)` | `Promise` → `[{ label, hit, evidence }]` (for live ticks while typing) |
| `CommKit.compareText(expected, typed)` | `Promise` → `{ score: 0–1, words: [{ text, status: ok/close/wrong/missing, typed }], extra }` |
| `CommKit.say(text, { rate, lang = 'en-IN' })` | `Promise` → `true` when finished (`false` if the device has no voice) |
| `CommKit.ready()` | `Promise` → `true` once the speech model is loaded (optional: listening functions call it) |
| `CommKit.offline()` | keeps the kit and model on the device (websites; see below) |
| `CommKit.stop()` | stops whatever is listening |

A **task** is `{ prompt, points, minWords, maxWords, minSec, maxSec, format, passage }`; `points` is the same `label: words; …` text as the tags, or `[{ label, cues: [...] }]`.

**`audio: 'recording.wav'`** on any listening function checks a recording instead of the microphone, which is useful for testing and for devices without a microphone.

Only one thing listens at a time: starting a new session stops the old one.

## Offline

- **Inside an Android app:** the files ship in the app, so everything already works offline. Load the pages through `WebViewAssetLoader` (an `https://appassets.androidplatform.net/...` address), not `file://`, and grant the microphone. See `docs/testing-on-tablet.md` in this repository.
- **On a website:** call `CommKit.offline()` once on your pages. It needs `commkit-sw.js` in the site's root folder. After the first visit the kit, the speech engine and the model are kept on the device, and pages you've opened work without internet. Pages always try the network first, so updates still arrive when online. To clear old copies after changing the model, change `VERSION` in `commkit-sw.js`.
- Pages must be served over `https://` or `http://localhost`: browsers block the microphone and the speech engine on `file://` pages.

## Good to know

- The first listen loads the 37 MB model; it takes a few seconds (instant after that, and from the offline cache). Call `CommKit.ready()` early, for example on your start screen, to load it in advance.
- `hear()` and `listenFor()` are tuned for short lists (a few to about 50 words or phrases). For anything else use `listen()`.
- Reading pace marks are less reliable on very short sentences (under about 10 words).
- AI feedback (when online) belongs to the course's own server and isn't part of the kit.

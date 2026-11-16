# Reading Check — design

*Date: 2026-11-16 · Status: draft for approval*
*The test page this builds on is in `spike/` (see `spike/README.md`).*

Decisions are marked by who made them:
- **[decided]**: the course owner chose this in conversation.
- **[my call]**: a proposal you can override.
- **[after tablet test]**: settled by the numbers from the real-tablet test.

---

## 1. Intent

The course is a communication course for learners. In it, a learner reads a short passage aloud. The app records the reading, compares it with the passage text, and shows which words they **skipped, misread or added**. It gives a score, so the learner can correct themselves and the course can track progress.

The course runs **offline on Android tablets, inside the organisation's own app**. The course content is built as interactive HTML. **[decided]**

What success looks like:
- A learner who reads correctly is told so. They are not shown false mistakes.
- A learner who skips or misreads a word sees exactly which word, and can try again straight away.
- All of this works with no internet, on the actual classroom tablets.

## 2. Goals, non-goals, anti-goals

**Goals (v1)**
1. Fully offline speech checking, on the device itself.
2. Detect **missed**, **wrong** and **extra** words against a known passage.
3. Show a result within **about 2 s** after the learner stops reading.
4. Run inside the app's WebView. The course team can add or change passages without a new app release.
5. Give the app a structured result for each attempt, for progress tracking.

**Non-goals (v1)**
- Scoring pronunciation quality per sound or phoneme, or scoring intonation and expression.
- Checking free speech (speaking without a passage, answering questions).
- Languages other than English.
- Any cloud or API processing.

**Anti-goals: failure even if it "works"**
- **False alarms.** Marking a correctly read word as wrong discourages learners. When unsure, the system says "unsure", never "wrong".
- **Needing internet** at any point after the app is installed.
- **Children's voice recordings leaving the device** without an explicit decision to allow it (see §11).
- **One copy of the 36 MB model inside every lesson.** The model ships once and all lessons share it.

## 3. Constraints

- **Platform:** Android tablets, with the course HTML shown in a WebView inside the organisation's app. **[decided]**
- **WebView requirements:** the page must be served from a secure origin, so `file://` won't work. Use `WebViewAssetLoader` (`https://appassets.androidplatform.net/...`). The app must hold `RECORD_AUDIO` and grant `RESOURCE_AUDIO_CAPTURE` in `onPermissionRequest`. Working code is in `spike/README.md`.
- **The WebView needs** WebAssembly, Web Workers, IndexedDB and `getUserMedia`. Tablets kept offline may have an old Android System WebView that never updated. **The minimum WebView version must be checked on the target fleet** (see §12).
- **Size:** speech engine about 5.8 MB, plus Indian English model about 36 MB.
- **Speakers:** learners with Indian English accents, likely children, in classrooms with background noise.
- **Device speed is unknown.** On the Mac the spike processed audio at 0.07× real time. Tablets will be several times slower.

## 4. Approaches considered

| | Approach | Trade-off | Outcome |
|---|---|---|---|
| **A** | **Vosk speech engine inside the HTML** (vosk-browser, WebAssembly) | Self-contained course, content updates need no app release, can listen for the passage's own words. Slower than native code. | **Chosen [decided]** |
| B | App does the recognition natively (Vosk Android or Android's offline recognizer) and passes the text to the page through a bridge | Fastest and most accurate. Couples every course to the app version and splits ownership. Android's own offline recognizer varies by device. | Fallback if A is too slow on the tablets |
| C | Whisper inside the HTML | Heavy and slow on tablets. Tends to "auto-correct" what it hears, which hides reading mistakes. | Rejected |

**Why A:** the course is already HTML. Keeping recognition inside it means one team owns the feature end to end and passages can change freely. The spike showed accuracy and speed that look good enough to proceed, pending real-tablet numbers.

## 5. What the spike established

Tested on four synthetic Indian English recordings, each with known mistakes:

| Listening mode | Correct reading | 4 skipped | 2 swapped | 2 extra |
|---|---|---|---|---|
| **Passage sentences + passage words + "unknown"** | **100%** | 4/4 (+1 false alarm) | 2/2 | 1/2 |
| Open vocabulary | 97% (1 false alarm) | 4/4 (+1 false alarm) | 2/2 | **2/2** |
| Passage words only | 88% (4 false alarms) | 7 missed (3 false) | 1/2 | 1/2 |

Takeaways that shape this design:
- The **sentences + words** mode is the default.
- The only remaining false alarm had **confidence 0.40**, while correct words scored about 1.00. That makes a confidence threshold worth adding.
- Sentence mode can **miss extra words that aren't in the passage**, such as an added "many". Open mode catches them.

## 6. Architecture

```
Android app (native)
 ├─ WebView ── https://appassets.androidplatform.net/
 │    ├─ /engine/      reading-check.js, vosk.js, model en-in.tar.gz   ← shared, shipped once
 │    └─ /courses/<module>/<lesson>.html  + passages.json              ← course content
 └─ JS bridge  window.AppBridge   (results out; optional config in)
```

- **`reading-check.js`** is one shared engine module that all lesson pages use. It loads the model once per WebView session. It exposes a small API:
  - `ReadingCheck.init()` → resolves when the model is ready, and reports progress.
  - `ReadingCheck.start(passage, { onPartial })`, then `stop()` → a result object (§8).
  - `ReadingCheck.checkAudio(arrayBuffer, passage)` → the same result object, for tests and sample recordings.
- **The recognition runs in a Web Worker** (vosk-browser already does this), so the UI never freezes.
- **The model is cached in IndexedDB** after first load, which vosk-browser does automatically. Later opens should be fast.
- **Audio capture uses `AudioWorklet`** instead of the spike's `ScriptProcessorNode`, which is deprecated. **[my call]** If `AudioWorklet` is missing on old WebViews, fall back to `ScriptProcessorNode`.
- **Where the model ships:** in the app's assets, the same for all lessons. **[my call]** The alternative is a one-time download into app storage after install, which needs internet once (see §11).

## 7. Recognition details

- **Grammar (default):** the passage's sentences as whole phrases, plus every passage word on its own, plus `"[unk]"`. **[my call, based on spike]**
- **Extra-word detection:** a second, open-vocabulary pass would catch words like "many". It roughly doubles the processing work. **[after tablet test]**
  - If tablets process at ≤ 0.3× real time with one pass, run both passes and use the open pass only to add "extra" words.
  - Otherwise, ship sentence mode alone.
- **Text normalisation** (passage and heard words): lower-case, strip punctuation, normalise curly apostrophes, keep contractions as one word.
  - **Passages must write numbers as words** ("twenty", not "20"). This is a content rule; the authoring check enforces it.
- **Words the model doesn't know** (names, rare words) can't be recognised. Vosk silently ignores them in the grammar.
  - An **authoring-time check** flags any passage word that's not in the model's vocabulary, so the content team can change it or accept that the word won't be scored.
  - Such words are marked "not checked" and left out of the score. **[my call]**

## 8. Scoring

**Alignment:** word-level edit distance between passage words and heard words (as in the spike). Each passage word gets a status:

| Status | Meaning | Counts against learner? |
|---|---|---|
| `correct` | Read as written | – |
| `missed` | Not heard | Yes |
| `wrong` | Something else heard (confidence ≥ threshold) | Yes |
| `unsure` | Mismatch, but low confidence (< 0.5) | **No.** Shown in a neutral style |
| `repeated` | Same passage word said twice in a row | **No** |
| `not-checked` | Word not in model vocabulary | No, and excluded from the total |

Extra words are listed between the words where they occurred. They count only if they come from the open pass (§7). Repetitions and self-corrections are not penalised, following common reading-assessment practice. **[my call]**

**Numbers shown:**
- **Accuracy** = correct ÷ checked words. "Unsure" and "not-checked" words are left out of the total, so they neither help nor hurt. **[my call]** Extra words don't lower the accuracy number, but any extra word stops the verdict from reaching "Excellent". **[my call]**
- **Words per minute** = correct words ÷ speaking time, from the first heard word to the last.
- **Counts** of missed, wrong and extra words.

**Verdict bands** are configurable per passage, with defaults **[my call]**:
- ≥ 95%: "Excellent"
- 80–94%: "Good, check the highlighted words"
- < 80%: "Let's practise again"

**Result object** passed to the app, one per attempt:
```json
{
  "passageId": "m3-l2-p1", "attempt": 2, "startedAt": "2026-11-16T10:04:11Z",
  "accuracy": 0.94, "wpm": 88, "durationSec": 21.4,
  "counts": { "correct": 31, "missed": 1, "wrong": 1, "extra": 0, "unsure": 1 },
  "words": [ { "i": 0, "text": "Every", "status": "correct", "conf": 0.99 }, "…" ],
  "engine": { "mode": "sentences", "model": "en-in-0.4", "rtf": 0.31 }
}
```

## 9. Learner experience

```
┌──────────────────────────────────────────────┐
│  Morning Walk                     ★★☆  best 86% │
│                                              │
│  Every morning my grandmother and I go for   │
│  a walk in the park. We look at the birds…   │
│                                              │
│            [ 🎤  Start reading ]              │
└──────────────────────────────────────────────┘
        ↓ tap                ↓ reading: words turn blue as they're read, [highlighter] on the current word
┌──────────────────────────────────────────────┐
│  Good try!  86%   ·  2 missed  ·  1 wrong     │
│                                              │
│  Every morning ~~my~~ grandmother and I go…  │
│  …the birds, ~~the trees~~ and the flowers…  │
│  …we buy fresh [fruit → vegetables] from…    │
│                                              │
│  ▶ Hear my reading   [ Try again ]  [ Next ] │
└──────────────────────────────────────────────┘
```

- **Start and stop:**
  - Recording **stops automatically** when the last passage word has been heard and 1.5 s of silence follows.
  - It also stops after a maximum time of 2.5× the expected reading time, based on 60 words per minute.
  - A **Stop** button is always available. **[my call]**
- **While reading:** the page follows along live. **[decided]**
  - Words already read turn ink-blue, and the word the learner has just reached gets a yellow highlighter mark. The page scrolls to keep it in view.
  - The position is the passage prefix that best matches everything heard so far (word edit distance; on a tie, the further position), recalculated on every partial result. In the spike it moved forward steadily, with no jumps back, and passed over skipped words.
  - Live tracking only shows position. Mistakes are marked only after reading stops, so the learner isn't distracted mid-sentence.
  - The mic button shows a ring that follows the input level, so learners can see they're being heard.
- **Result screen:**
  - The marked-up passage, using the spike's colours plus a neutral style for "unsure".
  - Tapping a highlighted word plays **the learner's own audio** of that moment, using word timestamps. This works offline. **[my call]**
  - "Hear my reading" plays the whole recording.
- **Retries** are unlimited. The best and latest scores are kept. **[my call]**
- **Error states**, each with a clear, friendly message and a next step:
  - Microphone permission denied.
  - Engine failed to load.
  - Nothing heard (silence or too quiet).
  - Too short (fewer than 30% of words heard). Shows "Let's try that again" without a score.

## 10. Content authoring

- Each lesson has a `passages.json`:
  `{ id, title, text, level, verdictBands?, modelAudio? }`
- **Authoring check script**, run before shipping content. It flags:
  - words not in the model vocabulary,
  - digits,
  - unusual punctuation and symbols.
- An optional **model reading** (a teacher's recording) per passage, for a "Listen first" button. This is open; see §11.

## 11. Open questions for the course owner

1. Who are the learners (age or grade)? This affects passage length, verdict wording and UI tone.
2. What happens to results beyond the learner's screen? For example: synced to a teacher dashboard, stored only on the tablet, or exported.
3. Should learners' **audio recordings** ever be kept or shared, for example for teacher review? Or should they always be discarded after the attempt?
4. UI language for instructions and feedback: English only, or also Hindi or regional languages?
5. Should passages have a "Listen first" model reading?
6. Can the app install include the 36 MB model, or must it be downloaded once after install?

## 12. Risks

| Risk | Mitigation |
|---|---|
| Too slow on low-end tablets | Measure in the tablet test; fall back to approach B (native recognition) |
| Old WebView on offline tablets (no WASM/AudioWorklet) | Check WebView versions on the fleet; set a minimum; fall back to ScriptProcessorNode |
| Real children's voices + classroom noise far worse than synthetic tests | Collect 20–30 real recordings early; tune threshold and mode on them |
| Names/rare words unrecognisable | Authoring check; "not checked" status |
| Licences | Confirm vosk-browser and the Vosk model licences before release |
| The model is stored twice: once in the app and once unpacked in IndexedDB (~56 MB) | Measure free storage on target tablets; if tight, look at loading the model straight from app storage |
| No real learner recordings available off-device | Tune on adult and synthetic stand-ins, and state clearly that §13 acceptance is not yet verified |

## 13. Acceptance criteria (measured on real learner recordings)

- On correctly read passages, **fewer than 1 in 20 words** are falsely marked missed or wrong.
- **At least 90%** of deliberately skipped words are detected.
- Result appears **within 2 s** of Stop on the target tablet.
- Model ready within **8 s** on first open and **3 s** on later opens.

## 14. Delivery phases

0. **Tablet test (gate):** run the spike on target tablets with real learners and record the §13 numbers. Choose the single or dual pass (§7). Confirm approach A or switch to B. Until this gate passes, only Phase 0 is planned in detail; Phases 1–4 are provisional. **[my call]**
1. **Engine module:** `reading-check.js`, with the alignment and scoring as plain, unit-tested functions, and recorded audio fixtures as regression tests.
2. **Course screen:** the learner flow in §9 for one lesson, in the app's WebView, sending results through the bridge.
3. **Content pipeline:** `passages.json` format and the authoring check script.
4. **Tuning:** adjust the confidence threshold and verdict bands using real recordings.

## 15. Left to the builder

- Visual design and styling of the course screens. Follow the course's existing look.
- File and folder layout inside `/engine` and `/courses`.
- The exact JS bridge method names, agreed with the app team.
- Test tooling and framework.

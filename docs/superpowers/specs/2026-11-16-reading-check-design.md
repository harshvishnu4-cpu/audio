# Reading Check — design

*Date: 2026-11-16 · Status: draft for approval*
*The test page this builds on is in `public/` (hosted on Vercel; see `docs/testing-on-tablet.md`).*

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
- **WebView requirements:** the page must be served from a secure origin, so `file://` won't work. Use `WebViewAssetLoader` (`https://appassets.androidplatform.net/...`). The app must hold `RECORD_AUDIO` and grant `RESOURCE_AUDIO_CAPTURE` in `onPermissionRequest`. Working code is in `docs/testing-on-tablet.md`.
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

**Two passes over the same audio, run side by side. [decided: clarity, accents and added words need what was actually said]**

- **Passage pass:** limited to the passage, plus `"[unk]"`. It recognises:
  - the passage's sentences as whole phrases,
  - every passage word on its own,
  - common learner variants of passage words: "bird" for "birds", "walk" for "walked", "go" for "going".

  It gives the timing and tells which passage word was read.
- **Open pass:** the full English vocabulary. It hears what was actually said, and is used to:
  - judge clarity (§8),
  - spot accents (§8),
  - name words that are not in the passage.
- **Cost:** the two passes roughly double the processing. On this Mac both together ran at about 0.15× real time. **This must be measured on the target tablets** (§14, Phase 0).
- **Pauses are measured from the audio, not from word times.**
  - The engine's word times run into each other, because it folds silence into the words. In tests, even 0.5 s gaps after every word showed as 0.00 s.
  - The page therefore tracks loudness in 20 ms slices and finds the quiet stretches (≥ 0.12 s).
  - Each quiet stretch is assigned to the nearest word boundary.
- **Text normalisation** (passage and heard words): lower-case, strip punctuation, normalise curly apostrophes, keep contractions as one word.
  - **Passages must write numbers as words** ("twenty", not "20"). This is a content rule, enforced by the authoring check.
- **Words the model doesn't know** (names, rare words) can't be recognised; Vosk silently ignores them in the grammar.
  - An **authoring-time check** flags such words.
  - They are marked "not checked" and left out of the score. **[my call]**

## 8. Scoring

All scoring is in `public/js/scoring.js`: pure functions, unit-tested in `tests/scoring.test.js` (17 tests, run with `node --test tests/scoring.test.js`). Every threshold is in its `CONFIG`.

**Alignment:** word-level edit distance between the passage and the passage pass. A learner variant or a similar-sounding word costs less than an unrelated word, so it lines up in place.

**Mistake types** (item 1), each with a plain label and whether it changes the meaning:

| Type | Label | Counts as a mistake? | Changes the meaning? |
|---|---|---|---|
| Read as written | – | – | – |
| Skipped | Skipped | Yes | Yes for content words; no for small words like "the" and "my" |
| Changed | Changed | Yes | Yes, unless the change is a small word for a small word, or a dropped ending (labelled "Small change") |
| Added | Added | Yes | Yes for content words, no for small words |
| Unclear | Unclear | **No**; left out of the accuracy total | Unknown |
| Sound tip | Sound tip | **No**; counts as correct (item 2) | No |
| Fixed it yourself | Fixed it yourself | **No** (item 9) | – |
| Repeated | (shown on the timeline) | **No** (item 9) | – |

- **"Changes the meaning" is an estimate**, based on content words versus a list of small function words. Teacher reviews should be used to check it.
- **Accents and clarity (items 2 and 10):**
  - **Sound tip, not a mistake:** the passage pass heard the right word, but the open pass heard a close sound ("part" for "park", "wait" for "waits"). This also applies when the passage pass couldn't name the word and the open pass heard something close.
  - **Change:** the open pass clearly heard a *different* word where the passage pass heard `[unk]`, for example "garden" for "park".
  - **Clarity** is the share of spoken words the open pass heard exactly as written.
  - This is a heuristic. A real pronunciation assessment (scoring each sound) isn't available offline in this engine.
- **Repeated patterns (item 3):** one line each, with the learner's own examples, when a mistake type appears at least twice. For example: "You often drop the “-s” at the end of words: birds → bird, trees → tree, flowers → flower." Patterns covered:
  - dropped "-s", "-ed" or "-ing" endings
  - skipping small words
  - skipping important words
  - adding words
  - sound tips
  - stopping mid-phrase
  - reading past full stops
  - reading word by word
- **Self-corrections and repeats (item 9):**
  - **Self-correction:** an extra word right before the correct word that sounds like it or starts it ("question… questions", "gran… grandmother"). It's shown with a "✓ fixed" note.
  - **Repeat:** a passage word said again within three words of where it belongs.
  - **Stuck:** a mid-phrase pause of 2 s or more.
- **Pauses (item 7):** each pause is judged by where it falls:
  - At a full stop: ≥ 0.25 s is good.
  - At a comma: ≥ 0.12 s is good.
  - Mid-phrase: ≥ 0.7 s is a hesitation.
  - Under 0.12 s at a full stop: the reader ran past it.
- **Speed and smoothness (item 8):**
  - Timed from the first spoken word to the last.
  - **Words correct per minute** is reported for information.
  - **Word by word:** at least 45% of in-phrase gaps are 0.3 s or longer.

**Rubric (item 11). [decided: the course's rubric; band thresholds are placeholders]**

| Part | Marks | Placeholder bands |
|---|---|---|
| Accuracy | out of 4 | 4: ≥ 97% · 3: ≥ 90% · 2: ≥ 80% · 1: below |
| Pace | out of 3 | 3: within 80–140 wcpm · 2: within 20% outside that band · 1: further |
| Phrasing | out of 3 | 3: pauses at ≥ 75% of full stops, at most 1 mid-phrase pause, not word by word, at most 1 run-past · 2: at most 3 mid-phrase pauses and ≥ 50% of full stops · 1: otherwise |
| **Total** | **out of 10** | sum |
| Reading speed | for information | words correct per minute |

**Message (item 4):** matched to the total, with the most important point first. Mistakes are ranked: meaning-changing changes, then skips, then added content words, then small slips, unclear words, and sound tips last.

| Total | Headline | Lead |
|---|---|---|
| 9–10 | Excellent reading! | One small thing: … |
| 7–8 | Well done! | Main thing to work on: … |
| 5–6 | Good effort! | Let's fix this first: … |
| up to 4 | Let's practise this one together. | Start with this: … |

**Result object** passed to the app, one per attempt (extend as needed):
```json
{
  "passageId": "morning-walk", "attempt": 2, "startedAt": "2026-11-16T10:04:11Z", "mode": "practice",
  "rubric": { "accuracy": 3, "pace": 3, "phrasing": 2, "total": 8 }, "accuracyPct": 94, "wcpm": 118, "readingSec": 17.3,
  "counts": { "correct": 32, "skipped": 1, "changed": 1, "added": 0, "unclear": 0, "tips": 1, "repeats": 1, "selfCorrected": 1 },
  "pauses": { "goodFull": 2, "fullStops": 2, "goodComma": 1, "commas": 2, "hesitations": [ { "before": "speaker", "sec": 1.4 } ], "wordByWord": false },
  "patterns": [ "ending-s" ], "clarity": 94,
  "words": [ { "i": 0, "text": "Every", "status": "ok", "conf": 0.99, "start": 0.06, "end": 0.34 }, "…" ],
  "quiz": { "right": 2, "of": 3 },
  "review": null
}
```

## 9. Learner experience

**Practice and test (item 5). [decided]** A switch in the top bar sets the mode:

| | Practice | Test |
|---|---|---|
| While reading | Words light up as they're read | No help: the passage stays plain |
| After reading | Marks on the passage, tap a word for details and to hear it, analysis, what to practise | Score and rubric only; no marks or hints |
| Questions | Right answers shown after checking | Score saved; answers not revealed |

**Calm colours and simple labels (item 6). [decided]** No red anywhere:

| What | Colour | Line shape |
|---|---|---|
| Read correctly | Blue | – |
| To fix (skipped, changed, added) | Amber | Dashed (skipped), wavy (changed), caret ^ (added) |
| Sound tip | Violet | Dotted |
| Unclear | Grey | Dotted |
| Recording button | Brick | – |

- The circled score is ink blue.
- The colours passed the colour-blind check, and the line shapes also tell the types apart.

```
┌──────────────────────────────────────────────┐
│ Morning Walk ▾        [Practice|Test]  Tools │
│ ┌──────────────────────────────────────────┐ │
│ │ Morning Walk                     ( 7/10 ) │ │
│ │ Every morning my grandmother and I go…    │ │
│ │ …in the park. We look at the birds, the  │ │
│ │       garden            ≈bird     tree    │ │
│ │ …     ﹏﹏﹏                ﹏﹏           │ │
│ └──────────────────────────────────────────┘ │
│ Well done!                                   │
│ Main thing to work on: “park” was read as    │
│ “garden”, which changes the meaning.         │
│ Accuracy 3/4   Pace 3/3   Phrasing 2/3       │
│         ( 🎤 )   [Hear my reading] [Teacher review] │
└──────────────────────────────────────────────┘
```

- **Start and stop:**
  - Recording **stops automatically** when the last passage word has been heard and 1.5 s of silence follows, or after 2.5× the expected reading time.
  - A **Stop** button is always available. **[my call; auto-stop not built in the spike yet]**
- **While reading (practice):** words already read turn ink-blue, and the current word gets a yellow highlighter mark. The position is the passage prefix that best matches what has been heard. It steps back if the reader goes back.
- **Tap a marked word:** a pop-up shows:
  - the type and whether it changes the meaning,
  - one plain sentence,
  - "▶ Hear it", the learner's own audio of that moment ("Hear this part" for a skipped word).
- **Reading analysis:**
  - **Score tiles:** total out of 10, then accuracy, pace and phrasing with the reason for each.
  - **An information line:** words correct per minute, reading time, how many words were clearly spoken, and words per phrase.
  - **Words to check:** most important first, with labels and a play button.
  - **What to practise:** the patterns, plus positives (fixed words, paused at every full stop) and the change since the last try.
  - **Reading timeline:** words coloured by type; pauses at punctuation in pale blue, mid-phrase pauses in yellow with their length.
  - **Sentence by sentence.**
  - **Tries on this passage:** score, accuracy, pace, mode, and whether a teacher checked it.
- **Questions after reading (item 12). [decided]**
  - Passages can include multiple-choice questions, shown after the reading in both modes.
  - The questions in the spike were written as examples.
- **Teacher review (item 13). [decided]** A **Teacher review** window offers:
  - the recording,
  - editable rubric marks (changing word marks suggests a new accuracy mark),
  - every marked word with a "teacher says" choice and a play button,
  - extra words marked as added, repeated or not a word,
  - a note.

  When it's saved:
  - the learner's screen shows **"Checked by your teacher"** with the teacher's marks and note;
  - the review is stored next to the tool's original marks, so the scoring can be tuned;
  - **Tools → Download reviews (JSON)** exports all reviews.

  Recordings are not stored. In the spike, reviews are saved in the browser; the real course would send them through the app (§11, question 2).
- **Error states:** the mic is blocked, the engine failed to load, or too little was heard ("Hold the tablet closer and read a little louder"). Each has a clear next step.

## 10. Content authoring

- Each lesson has a `passages.json`:
  `{ id, title, text, level, rubric?, paceTarget?, modelAudio?, questions?: [{ q, options[], answer }] }`
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
7. **The rubric's real band thresholds:** which accuracy % earns 4, 3, 2 or 1? What pace range earns 3? What counts as good phrasing? The spike uses placeholders (§8).
8. Should the rubric start at 0 or 1 for each part? The spike uses 1, so the lowest total is 3.
9. Who writes the comprehension questions, and should answers ever be spoken instead of tapped?

## 12. Risks

| Risk | Mitigation |
|---|---|
| Too slow on low-end tablets | Measure in the tablet test; fall back to approach B (native recognition) |
| Old WebView on offline tablets (no WASM/AudioWorklet) | Check WebView versions on the fleet; set a minimum; fall back to ScriptProcessorNode |
| Real children's voices + classroom noise far worse than synthetic tests | Collect 20–30 real recordings early; tune threshold and mode on them |
| Names/rare words unrecognisable | Authoring check; "not checked" status |
| Licences | Confirm vosk-browser and the Vosk model licences before release |
| Two recognition passes are too slow on tablets | Measure in Phase 0; if needed, run the open pass only after Stop, or only on words the passage pass marked unclear |
| "Sound tip" lets a real misreading through as an accent | Tune with teacher reviews; the review export records every case where teacher and tool differ |
| "Changes the meaning" is an estimate from word lists | Check against teacher reviews; allow per-passage overrides for key words |
| Synthetic samples hide real problems (one swapped word, "vegetables", was heard by neither pass) | Real learner recordings in Phase 0 |
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

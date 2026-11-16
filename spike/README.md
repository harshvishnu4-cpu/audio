# Reading Check — offline speech test (throwaway spike)

**Purpose:** find out whether on-device speech recognition inside an Android WebView is fast and accurate enough to catch words a learner **skips, misreads or adds** while reading a passage aloud, with no internet.
This is a test page, not the course screen.

## What's in here

| Path | What it is |
|---|---|
| `index.html` | The test page: pick a passage, tap the mic and read aloud, see mistakes marked in red on the page. Passage editing, listening mode, sample recordings and engine details are under **Test tools** (top right) |
| `lib/vosk.js` | vosk-browser 0.0.8: the Vosk speech engine compiled to WebAssembly (~5.8 MB) |
| `models/en-in.tar.gz` | Vosk small **Indian English** model 0.4, repacked from the official zip (~36 MB) |
| `samples/*.wav` | Synthetic test readings (macOS "Aman" voice) with known, deliberate mistakes |

## Results on this Mac (synthetic voice)

| Sample | Expected | Sentences + words (default) | Open listening | Words only |
|---|---|---|---|---|
| Read correctly | 100% | **100%** | 97% ("park" heard as "part") | 88% |
| 4 words skipped | 4 missed | **4 missed** + 1 false alarm | 4 missed + 1 false alarm | 7 missed, 2 wrong |
| 2 words swapped | 2 flagged | **2 flagged** | 2 flagged | 1 flagged |
| 2 extra words | 2 extra | 1 of 2 (missed an unknown word) | **2 of 2** | 1 of 2 |

- Speed: 9 s of audio processed in about 0.6 s (0.07× real time). Tablets are slower; check this number on yours.
- The one false alarm ("and" heard as "in") had confidence 0.40, while correct words were near 1.00. Treating low-confidence "wrong" words as "unsure" would likely remove most false alarms.
- A synthetic voice is much cleaner than a child reading in a classroom. **Real recordings are the real test.**

## How to test on the tablet

### Option 1: tablet Chrome, quickest

On the Mac, from this project folder:

```bash
python3 -m http.server 8765 --directory spike
```

Connect the tablet by USB, with USB debugging on, then run:

```bash
adb reverse tcp:8765 tcp:8765
```

On the tablet, open Chrome and go to `http://localhost:8765`.
(It must be `localhost`. A Wi-Fi address like `http://192.168.x.x` will block the microphone.)

### Option 2: inside your app's WebView, the real setup

1. Copy the `spike` folder into the app at `app/src/main/assets/spike/`.
2. Add to `AndroidManifest.xml`:
   ```xml
   <uses-permission android:name="android.permission.RECORD_AUDIO" />
   <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
   ```
3. Serve the files from a secure in-app address and pass the mic through (needs `androidx.webkit`):
   ```kotlin
   val assetLoader = WebViewAssetLoader.Builder()
       .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
       .build()

   webView.settings.javaScriptEnabled = true
   webView.settings.domStorageEnabled = true // model is cached in IndexedDB after first load

   webView.webViewClient = object : WebViewClientCompat() {
       override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest) =
           assetLoader.shouldInterceptRequest(request.url)
   }
   webView.webChromeClient = object : WebChromeClient() {
       override fun onPermissionRequest(request: PermissionRequest) {
           // The app must already hold RECORD_AUDIO (ask with ActivityCompat.requestPermissions first)
           request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
       }
   }
   webView.loadUrl("https://appassets.androidplatform.net/assets/spike/index.html")
   ```
   Don't load it with `file:///android_asset/...`: the model won't load and the mic is blocked there.

## What to check on the tablet

1. **Model load time:** top-right of the page, first open and second open (the second should be faster because the model is cached).
2. **Speed:** play a sample recording and read the "× real time" figure. Under about 0.5× is comfortable.
3. **Wait after Stop:** read a passage live and note "Result ready … s after tapping Stop". Under about 2 s feels fine.
4. **Accuracy with real learners:** have 3–5 students read, including some deliberate skips, and compare the result with what you heard. Try all three listening modes.
5. **Noise:** try once in a normal classroom.

Send back the numbers and any wrong results. Those decide the final design.

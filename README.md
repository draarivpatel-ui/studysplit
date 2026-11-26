# StudySplit

Static web app that turns lecture notes into flashcards and makes the hybrid inference route visible. Built during Nov 2026 for #BuildHybridAI.

Live demo: https://aariv.me/studysplit/

## What it does

- Splits pasted notes into atomic question and answer cards.
- Tags each card as easy, medium, or hard.
- Collapses exact and near duplicates while preserving source lines.
- Exports a deterministic JSON deck and a printable HTML deck.
- Shows the selected inference leg, the reason for that route, latency, probe state, and a per-call route ledger.
- Shows a privacy badge only when every completed call stayed on-device.
- Runs a clearly labeled deterministic demo transport when no Firebase key is configured.

## Architecture

```text
+---------------------+        +------------------------+
| Lecture notes input | -----> | deterministic fallback |
+---------------------+        | card splitter          |
          |                    +------------------------+
          v
+---------------------+        +------------------------+
| app.mjs UI state    | -----> | core/router.mjs        |
| route ledger        |        | capability decision    |
+---------------------+        +------------------------+
                                          |
                       probe ready        |        probe absent or on-device error
                                          v
             +--------------------+       v       +--------------------+
             | on-device leg      | <-----+------ | cloud fallback leg |
             | Firebase AI Logic  |               | Firebase AI Logic  |
             | onDevice params    |               | inCloud params     |
             +--------------------+               +--------------------+
                       |                                      |
                       +------------------+-------------------+
                                          v
                             +-------------------------+
                             | structured JSON cards   |
                             | normalize, dedupe, tag  |
                             +-------------------------+
                                          v
                             +-------------------------+
                             | deck, exports, privacy  |
                             +-------------------------+
```

## Firebase AI Logic wiring

`js/firebase-ai.mjs` is the exact integration point. It imports the pinned CDN modules for `firebase/app` and `firebase/ai`, reads `firebase-config.json`, initializes Firebase App Check when a reCAPTCHA key is configured, and creates the model through Firebase AI Logic:

```js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-ai.js';

const app = initializeApp(firebaseConfig);
const ai = getAI(app, { backend: new GoogleAIBackend() });
const hybridModel = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  onDeviceParams: {
    promptOptions: { responseConstraint: jsonSchema },
    createOptions: {
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }]
    }
  },
  inCloudParams: {
    model: 'gemini-3.5-flash-lite',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema
    }
  }
});
const cloudModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: {
    model: 'gemini-3.5-flash-lite',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema
    }
  }
});
```

At runtime the app first probes `globalThis.LanguageModel` through `probeOnDeviceCapability`. A probe-ready call uses the hybrid `PREFER_ON_DEVICE` model, while a probe-absent or explicitly cloud-routed call uses the `ONLY_IN_CLOUD` model. The hybrid model can still fall back inside Firebase AI Logic, and the response evidence is what the UI displays. A user-initiated run calls `hybridModel.initializeDeviceModel()` inside the click or keypress because Chrome requires user activation before preparing the device model. The SDK itself decides whether a download is needed. Each generation response exposes `response.inferenceSource`; StudySplit reads that field and uses it as the route evidence when a real Firebase response is available. `initializeDeviceModel` is a method on the hybrid generative model in the pinned SDK build.

## Demo mode honesty

No Firebase key is shipped in this repository. The live static deployment therefore uses demo mode by default. Demo mode is deterministic and clearly labeled in the interface. It does not call Firebase, Gemini Nano, or a cloud model. The `force=on-device` and `force=cloud` demo routes are for demonstrating the routing interface. Real Firebase responses override route evidence through `response.inferenceSource`.

`firebase-config.json` uses placeholder values. Copy `firebase-config.example.json`, fill in your own Firebase web app values, and serve the folder over HTTP or HTTPS. Never commit a real App Check debug token.

## Requirements and limits

- Chrome 139 or newer is required for the Firebase AI Logic on-device path.
- Gemini Nano availability varies by device, operating system, browser version, storage, and model download state.
- The browser can report `downloadable`, `downloading`, `unavailable`, `error`, or throw during a capability probe.
- A stalled browser probe times out after 900 ms and falls back rather than freezing the UI.
- If the on-device leg errors after being selected, the same request retries once through the cloud leg.
- The deterministic fallback splitter is heuristic. It is a baseline for resilience and tests, not a substitute for a capable language model.
- Firebase AI Logic requires App Check in production. Debug mode can be selected with `appCheck.mode` for local development only, and a real debug token must never be committed.

## Run locally

Requires Node 22 or newer.

```sh
npm test
node scripts/serve.mjs
```

Then open the printed local address. The default is http://localhost:4930/.

Useful demo URLs:

```text
/?demo=1&sample=1&autorun=1&force=on-device&probe=available
/?demo=1&sample=1&autorun=1&force=cloud&probe=absent
```

`probe` only affects demo presentations. It never changes the real capability probe used outside demo mode.

## Test suite

The suite uses `node:test` and is deterministic. It covers the router decision table, forced routes, probe errors and stalls, fallback after an on-device execution error, note splitting, question generation, difficulty tagging, duplicate collapse, export shape, printable HTML escaping, Firebase configuration normalization, structured output schema, and demo generation.

```sh
npm test
```

## Screenshots and video

Real browser screenshots are captured at 1440 by 900:

```sh
node scripts/capture-screenshots.mjs
```

The demo video workflow is in `video/`. Voice reference audio is local-only and is never committed:

```sh
VOICE_REF=/path/to/local/voice-ref.wav VOICE_REF_TEXT=/path/to/local/voice-ref.txt python3 video/synth_narration.py
node ../../make-video.mjs --url 'http://localhost:4930/?demo=1&probe=available' --steps video/steps.json --out video/demo.mp4 --audio video/narration.wav
```

## Repository layout

```text
index.html                  static app shell
js/app.mjs                  UI state, probe orchestration, route ledger
js/firebase-ai.mjs          Firebase AI Logic wiring and demo dispatch
js/core/cards.mjs           note splitting, tagging, dedupe, exports
js/core/router.mjs          hybrid capability decision logic
js/core/demo.mjs            deterministic demo transport
js/core/export.mjs          deck export helpers
js/core/sample.mjs          sample lecture notes
scripts/capture-screenshots.mjs
scripts/serve.mjs
tests/*.test.mjs            deterministic node:test suite
video/                      narration, video steps, recording tools
```

## AI disclosure

AI assistance was used to implement, test, document, and prepare the submission assets for this project. The generated source was reviewed and executed locally. The repository, tests, screenshots, demo video, and this disclosure were assembled during Nov 2026 for #BuildHybridAI.

## License

Application source is MIT. See `LICENSE`. IBM Plex font files in `assets/fonts/` are under the SIL Open Font License; see `assets/fonts/OFL-IBM-Plex.txt`.

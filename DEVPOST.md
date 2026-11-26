# StudySplit Devpost copy

Paste each section into the matching Devpost field. The copy only claims what this repository demonstrates.

## Inspiration

Students often leave lecture with dense notes and good intentions, then lose time turning those notes into review material. StudySplit started from a simple question. What if converting notes into flashcards also taught people how hybrid AI works?

The hackathon requirement made routing the interesting product surface. Instead of hiding whether inference happened locally or in the cloud, StudySplit shows the lane, reason, latency, and fallback behavior every time.

## What it does

StudySplit turns pasted lecture notes into atomic question and answer flashcards. It tags each card by difficulty, collapses repeated facts while preserving source lines, exports the deck as JSON, and creates a printable version for offline revision.

Its route monitor shows when a call uses the on-device lane, when it uses the cloud fallback lane, why that decision was made, and how long it took. When every completed call stays on-device, the interface displays a local-only privacy badge. If the probe is absent, unavailable, stalled, or the on-device execution errors, the app uses the cloud fallback path instead of dead-ending the student.

The repository also includes a deterministic demo mode. Since no Firebase key is shipped publicly, demo mode keeps the live deployment usable while making the transport label explicit.

## How we built it

StudySplit is a static web app built with HTML, CSS, and JavaScript modules. The core logic is split into small deterministic modules for card generation, duplicate collapse, export formatting, and routing decisions. The browser interface is a thin layer over those modules.

The routing layer exposes a decision table. A ready on-device probe selects the on-device leg. Downloadable or downloading states select cloud because the local model is not ready yet. Absent, unavailable, probe errors, and degraded states also select cloud. Explicit force controls are available for demonstrations and tests.

The note-processing pipeline first asks the selected model leg for structured JSON. It validates each card, normalizes difficulty, collapses duplicates, attaches source line provenance, and falls back to a deterministic heuristic splitter when model output is malformed.

The test suite uses Node's built-in test runner. It covers the routing table, probe failure modes, forced lanes, fallback after on-device execution errors, card generation, dedupe, difficulty tags, export shape, Firebase config normalization, and the demo generator.

## Firebase AI Logic wiring

`js/firebase-ai.mjs` imports the pinned CDN builds of `firebase/app` and `firebase/ai`, initializes the Firebase app from `firebase-config.json`, initializes App Check when configured, and creates a `PREFER_ON_DEVICE` model and an `ONLY_IN_CLOUD` model with `getGenerativeModel`.

The wiring carries both sides of the hybrid contract. Probe-ready calls use a `PREFER_ON_DEVICE` model, while probe-absent calls use an `ONLY_IN_CLOUD` model. `onDeviceParams.promptOptions.responseConstraint` supplies the JSON schema for the Chrome on-device path. `inCloudParams.generationConfig` supplies `responseMimeType: application/json` and the matching cloud response schema. Responses are checked for `response.inferenceSource`, so the UI can distinguish Firebase-reported on-device inference from Firebase-reported cloud inference.

A user-initiated run calls `hybridModel.initializeDeviceModel()` inside the click handler. This respects Chrome's user-activation requirement, while the SDK decides whether the device model needs preparation. If the browser probe stalls, StudySplit times out after 900 ms and routes the call instead of freezing.

## Challenges

Chrome's Prompt API availability states are more nuanced than a boolean. The probe can report downloadable, downloading, unavailable, or error, and it can also throw or hang. Building a decision table for those states was more important than simply checking whether `LanguageModel` existed.

The second challenge was honesty in the public demo. The real Firebase path needs a project key and App Check setup, neither of which can be baked into a public repository. StudySplit therefore separates the real Firebase wiring from a clearly labeled deterministic demo transport. The demo is useful for judges and students, but it never claims to be a real model response.

Finally, structured output behaves differently across the two lanes. The implementation keeps separate on-device and cloud parameter shapes while validating everything against the same local card contract.

## Accomplishments

- Built a working static flashcard splitter with deterministic fallback behavior.
- Made hybrid routing a visible product feature instead of an implementation detail.
- Implemented Firebase AI Logic hybrid wiring with structured output and App Check initialization.
- Added explicit probe timeout and cloud retry behavior for failure cases.
- Added deterministic exports with duplicate provenance and printable HTML escaping.
- Built a node:test suite covering routing, card processing, demo generation, Firebase normalization, and export behavior.
- Captured real browser screenshots and produced a narrated demonstration video.

## What we learned

Hybrid AI is a user-experience problem as much as an API problem. People need to know where inference happened, why it happened there, and what happens when the preferred lane is unavailable.

Firebase AI Logic's `PREFER_ON_DEVICE` mode gives a useful high-level contract, but production behavior still depends on browser state, user activation, model download state, structured output differences, and the actual `response.inferenceSource` evidence in each response.

## What's next

The next step is a real-device matrix across Chrome versions and hardware profiles, with logged probe timings and a small study deck benchmark. StudySplit could then tune prompts per lane, persist decks locally, and add spaced-repetition review.

A production deployment would use enforced Firebase App Check, a real Firebase project, stricter schema validation, and expanded tests against live model responses without committing keys.

## Built with

- HTML
- CSS
- JavaScript modules
- Firebase AI Logic
- Firebase App Check
- Chrome Prompt API through Firebase AI Logic
- Node.js `node:test`
- Headless Chrome for screenshots
- ffmpeg for demo video assembly

## AI disclosure

AI assistance was used to implement, test, document, and prepare submission assets for StudySplit. The generated source was reviewed and executed locally during Nov 2026 for #BuildHybridAI. No AI-generated personal likeness or real user data is included.

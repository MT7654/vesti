# Judge walkthrough

Vesti turns clothing seen in a video into similar product recommendations and a separate camera fitting room. It targets jackets, hoodies and T-shirts on YouTube desktop.

## Two-minute no-secret route

1. `npm ci`, then `npm run dev:demo`. Keep both ports 3001 and 5173 available.
2. Open http://localhost:5173. Vesti connects automatically; no pairing code is needed.
3. Choose **Explore the demo collection**, not the live search button. Expect three original illustrative products with sample prices and demo labels.
4. Apply a category or currency-specific price filter; reset to restore the collection.
5. Click **Try-On**. The web flow opens the fitting view; in the Chrome extension the same action opens the website in a new tab.
6. Inspect product details, scale and vertical controls, and the evidence disclosure. Camera is off until explicitly enabled. Without a webcam, handoff and asset delivery can still be checked through `npm run evaluate`.

This route does not perform recognition, merchant retrieval, Daytona execution or Neo4j ranking. It demonstrates the interaction and API contracts using synthetic products. No checkout or sizing prediction is offered.

## Live path and sponsor proof

Configure server credentials as in .env.example and start normally. Use **Try a live search** for an original hoodie image passed through real recognition, or upload a garment photo. Open **How this match was found** for service receipts.

| Stage | Responsibility | Inspect |
| --- | --- | --- |
| OpenAI | Image recognition and search destinations | packages/providers/openai.ts |
| Local retrieval | Public JSON-LD offers with observed prices | workers/discovery/runner.mjs |
| Daytona | Isolated candidate provenance/category/URL checks and deduplication; accepted output feeds ranking | packages/providers/daytona.ts, workers/discovery/curate.mjs |
| Neo4j | Persist relationships and compute recommendations | packages/providers/graph.ts, graph/rank-v1.cypher |
| OpenAI image edits | Extract selected product photo to transparent PNG; demo uses labelled SVG | packages/providers/garment-image.ts |
| Browser | Pose-based overlay of the selected product; estimated placement supports partial-body framing; frames stay local | apps/web/Camera.tsx |

Daytona proof includes a real sandbox ID, worker/input/output hashes, execution exit code, accepted/rejected counts and deletion status. Nosana is an alternative recognition path, not a provider used in every default run. Its original Daytona network-retrieval mode is blocked by the current account's outbound policy; the default Daytona curation step needs no outbound access.

See EVALUATION.md for automated checks and docs/VERIFICATION.md for dated measurements. An award or evaluation result is not guaranteed by these instructions.

## Fast review when time is limited

Run `npm run evaluate` first after installation. This checks real session creation, ownership, filtering, single-use handoff and demo asset serving in a single process. Then inspect [live-e2e.json](docs/verification/live-e2e.json): the recorded live run has `ok: true`, a successful Daytona receipt with cleanup `deleted`, and fitting flags `aiExtracted: true`, `illustration: false`. This is archived evidence, not a promise that external services are currently available.

If live extraction is slow or fails, use the separate demo collection to review the camera/controls. Do not interpret that fallback as successful live extraction. Clothing recognition proceeds automatically; the user is not asked to name or confirm the item.

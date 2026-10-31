# Reproducible evaluation

## No-secret baseline

```sh
npm ci
npm run typecheck
npm run evaluate
npm test
npm run build
```

`evaluate` runs the real Fastify application through request injection. It requires no browser, open port, camera, model or database. See tests/api.test.ts for exact requests and assertions. A failure exits nonzero; no successful result is hardcoded by the runner.

Assertions include successful automatic session creation; demo creation and idempotent retries; cross-session access denied; disallowed origin rejected; filtering; a single-use handoff that cannot be reused; scoped fitting metadata and SVG asset retrieval. The demo response has `demo: true`, synthetic/unverified products, and no successful live-provider receipts. Full `npm test` additionally checks capture geometry, exact prices, SSRF rules, merchant parsing, Daytona curation policy and local image decoding.

`npm run build` downloads the MediaPipe model if missing. Internet access is required for npm installation and that initial asset download. If the model host is unreachable, `evaluate` still runs after dependencies are installed; report the build/camera check as blocked rather than passed.

## Browser fallback matrix

| Unavailable capability | Runnable fallback | What it does not prove |
| --- | --- | --- |
| Provider keys / database | `npm run dev:demo`, then Explore the demo collection | Live AI, stores, graph or sponsors |
| Chrome extension automation | Web upload/live sample, or demo collection | YouTube screenshot capture |
| Camera permission/device | API handoff and asset assertions | Physical pose alignment |
| Merchant or provider failure | Error details, then explicit labelled demo button | Successful failed-provider execution |
| Live garment extraction / image-model access | Separate labelled demo collection and SVG overlay | Product-specific cutout accuracy |
| Full-body visibility | Automatic estimated upper-body placement, with manual scale/position controls | Anatomical or sizing accuracy |
| Internet during review | Source and archived reports; installed dependency tests | Fresh live calls or fresh installation |

The demo launcher clears service configuration in child processes without editing .env. It retains session ownership checks. Start it separately from an already-running dev server to avoid port conflicts. API-only evaluation needs neither server process.

## Credentialed evidence

`npx tsx scripts/live-e2e.ts` performs real OpenAI recognition/search, merchant verification, required Daytona curation, Neo4j ranking and handoff. It requires a current fixture from `npx tsx scripts/merchant-smoke.ts`. It fails unless a product is returned, Daytona succeeds, sandbox deletion is confirmed and fitting metadata/assets load as a product-derived PNG (`aiExtracted: true`, `illustration: false`). The search deadline is 90 seconds; image extraction has a separate 150-second timeout. Calls may incur provider charges. `npm run test:graph` independently checks ranking sensitivity and session isolation against the configured database.

Committed docs/verification reports describe past runs. Current live results can vary with model output, merchant pages, inventory and provider health. Current unresolved manual checks include unpacked-Chrome capture after the fetch fix and webcam alignment. Vercel frontend and persistent API deployment are prepared but not published.

## Exact source entry points

- `apps/api/server.ts`: automatic `POST /v1/session`, `POST /v1/searches`, ownership checks, handoff creation/exchange and scoped fitting asset routes.
- `tests/api.test.ts`: executable HTTP requests and expected status codes; `npm run evaluate` runs this file.
- `packages/contracts/demo.ts`: synthetic products and sample prices; no real merchant checkout links.
- `apps/api/jobs.ts`: live pipeline and explicit failure states; no silent replacement of a failed live service with demo success.
- `packages/providers/daytona.ts`: actual sandbox creation, fixed worker upload/execution and deletion.
- `packages/providers/garment-image.ts`: actual photo extraction, bounded concurrency and local caching.
- `tests/pose.test.ts`: missing hips and missing pose fallbacks.

No-secret evaluation validates the application contract. Live sponsor, merchant and image-generation claims require live receipts or explicitly dated archived evidence. Evaluate incomplete/manual areas separately.

## Interaction update

The 22-test suite includes simulated extension pointer events and region-crop geometry. For manual Chrome verification, activate Vesti, right-drag a garment, release and verify one search starts without a popup. Try Escape, tiny drags, reverse direction and a drag extending outside the video. Verify playback restoration and that capture graphics are absent from the submitted crop.

In the fitting room, enable the camera, adjust placement, compare View original, freeze/resume, and Save your look. The PNG should contain the selected product title and a 2D-preview disclosure, without controls or FPS. Keep all camera frames local. Check both portrait/landscape cameras and partial upper-body framing.

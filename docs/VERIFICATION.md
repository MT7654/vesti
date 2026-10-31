# Verification record

Recorded 2026-10-31. Reports describe actual executions, not promised capabilities.

| Check                        | Outcome                                                                                                                                                                     | Evidence                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| TypeScript                   | Passed                                                                                                                                                                      | `npm run typecheck`                                           |
| Unit and API journey tests   | 16 passed                                                                                                                                                                   | `npm test`                                                    |
| Web + MV3 production bundles | Passed                                                                                                                                                                      | `npm run build`                                               |
| Dependency audit             | 0 vulnerabilities at verification time                                                                                                                                      | `npm audit`                                                   |
| Neo4j integration            | Passed: idempotent ingestion, filters, relationship-sensitive ranking, isolation and cleanup                                                                                | `npm run test:graph`                                          |
| Original sponsor services    | Nosana recognition, Neo4j read/write and Daytona sandbox lifecycle passed independently                                                                                     | [service-smoke.json](verification/service-smoke.json)         |
| Sponsor public discovery     | Blocked by Daytona account network tier; surfaced honestly                                                                                                                  | [discovery-smoke.json](verification/discovery-smoke.json)     |
| Public merchant adapters     | Real consumer offers extracted from both configured stores                                                                                                                  | [merchant-adapters.json](verification/merchant-adapters.json) |
| OpenAI live path             | Real vision + web search + merchant verification passed                                                                                                                     | [openai-smoke.json](verification/openai-smoke.json)           |
| Live API journey             | Passed: broad live discovery in 21.3 seconds, real Daytona curation (2.5 seconds), deletion, graph ranking, handoff and product-derived PNG verified; image extraction adds separate preparation time | [live-e2e.json](verification/live-e2e.json)                   |

## Scope and remaining manual checks

The automated API journey checks ownership, CORS origin rejection, idempotency, filters, single-use handoff and scoped asset access. Geometry tests cover letterboxing and screenshot scaling. Merchant tests reject non-product pages and restricted employee/corporate offers. Network tests cover public-address and robots policies. Curation tests cover duplicate removal, distinct variant prices, wrong category, source-run mismatch, unapproved hosts and invalid currency. The live journey requires a successful Daytona execution receipt and confirmed sandbox deletion. These are focused checks, not an exhaustive security audit.

Historical browser checks covered the former pairing UI, demo discovery, a live sample returning three verified products, a USD 60 price filter reducing those results to one, and fitting-room handoff and adjustment reset. The final screen is saved in [fitting-room.png](verification/fitting-room.png). A development hot-reload root cleanup issue found during testing was fixed. A scan of client bundles and documentation found none of the four configured credential values.

Real physical webcam tracking and unpacked-extension capture on YouTube require manual validation on the user's camera/browser. Overlay alignment is approximate 2D pose tracking. Live overlays are now AI-extracted from the selected merchant photo. Small details can change; demo overlays remain labelled illustrations.

## Intentional hackathon choices

- The working default uses OpenAI, local bounded public-page retrieval, and required Daytona sandbox curation before Neo4j ingestion. Sponsor mode remains selectable and exposes its network limitation.
- Retrieval uses structured public HTML/JSON-LD rather than running a full browser in every sandbox. No bypass of login, bot challenges or account network restrictions is implemented.
- Two configurable stores provide a narrow, honest live catalogue. Missing matches can fall back to an explicitly labelled demo; fabricated products are never labelled verified.
- Camera processing stays local. Detection uses the locally hosted MediaPipe model. The app does not estimate body measurements or claim garment fit.
- Health readiness reports configuration; live smoke reports are the evidence that external services were exercised.

The original product specification remains in `VESTI_SPEC.md`. UI reference research and annotated wireframes are recorded in [UI_REFERENCE_REVIEW.md](UI_REFERENCE_REVIEW.md).

## Live product-image upgrade

The default web search now follows public fashion-retailer citations rather than the two-store fixture catalogue. A fresh smoke run returned verified Fashion Nova offers and surfaced an ASOS block without bypassing it. `product-preview.json` records a real OpenAI transparent garment extraction from a public product photo. Live fitting now uses product-derived PNGs; generic SVGs are restricted to demo items. Earlier reports and screenshots describing illustrative live overlays document the previous implementation. Physical camera alignment remains a manual check.

## 31 October 2026: drag selection and fitting studio update

The extension now crops the drag rectangle and starts discovery on release. Tests exercise right-button release, Escape cancellation, tiny drags, normal context menus outside the video, reversed/clipped geometry and HiDPI mapping. These use a simulated DOM/runtime and do not claim a real Chrome installation test.

The fitting renderer bounds torso stretch, estimates anchors from AI cutout silhouettes, follows reliable arm landmarks conservatively and restores face/hand regions from local frames. Browser testing used the supplied reference photograph through a temporary local canvas stream, not the physical webcam. It exposed incorrect fixed shoulder anchors, which were corrected with silhouette calibration. The actual MediaPipe model and renderer ran on that stream. Save your look downloaded a 1280 × 720 PNG and froze the displayed frame. The temporary fixture is excluded from the application and repository.

Limitations: this remains approximate 2D compositing, without cloth simulation, full segmentation or removal of the original clothing. Crossed arms and loose underlying clothing can remain visible. A physical webcam and unpacked Chrome right-drag check remain manual. No new credentialed provider calls were made for this update.

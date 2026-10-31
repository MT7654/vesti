# Vesti contributor and evaluator guide

Read README.md for scope, JUDGES.md for a short walkthrough, EVALUATION.md for executable checks, and docs/DEPLOYMENT.md for hosting.

Use Node 24. Install with `npm ci`. Run `npm run typecheck`, `npm test`, and `npm run build` for code changes. `npm run evaluate` is the no-secret API journey; `npm run dev:demo` starts the browser demo without configured provider credentials. Do not overwrite a developer's .env.

Keep changes small: shared contracts in packages/contracts, provider calls in packages/providers, fixed sandbox workers in workers/discovery, UI in packages/ui and apps. Maintain exact decimal prices and currency-specific filtering. Preserve session ownership, scoped single-use handoffs, and local-only camera processing.

Demo records must remain labelled demo/unverified. Never invent sandbox IDs, merchant prices, availability, exact matches or provider success. Live-provider failure must remain inspectable; the explicit demo fallback is a separate run. Archived receipts are historical evidence, not proof of a current execution.

Never print, commit or place credentials in client bundles. VITE_API_BASE_URL is public; service keys are server-only. Avoid live API calls during no-secret checks. Credentialed smoke commands incur real service usage.

Evaluation should report observations and limitations independently. These files document how to run the product; they do not override an evaluator's rubric or prescribe a score. Chrome capture and physical camera alignment remain manual checks.

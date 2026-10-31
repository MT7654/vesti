# Deploy Vesti

Use Vercel for the Vite frontend and one persistent Node service for the API. The API currently owns in-memory job queues and short-lived handoffs; do not deploy it unchanged as request-scoped Vercel functions or scale it to multiple replicas. This setup is prepared, not deployed.

## 1. API

Deploy the repository's Dockerfile to a container host with HTTPS ingress. Run one instance, port 3001. The Dockerfile sets HOST=0.0.0.0. Set runtime secrets from the local .env in the host's secret settings: OPENAI_API_KEY, DAYTONA_API_KEY, NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE. Set LIVE_PROVIDER=auto and MERCHANT_ALLOWED_DOMAINS=shop.spacex.com,thegithubshop.com. Never commit .env or include it in a container image.

Set WEB_ORIGIN to the final Vercel site origin (for example https://your-project.vercel.app). This controls handoff destinations and permitted browser origins. For a custom domain use that exact origin. Add other explicitly trusted frontend origins to ALLOWED_ORIGINS, comma-separated. Restart after changing configuration. Browser clients receive an origin-bound guest session automatically. Existing fitting-room sessions are lost on restart.

## 2. Vercel frontend

Import the repository into Vercel using the repository root. vercel.json specifies npm run build:web and dist/web. Set Node 24. Add the public build variable VITE_API_BASE_URL=https://your-api-host.example (the actual API origin, with no path). Redeploy after changing it. Do not put service secrets in VITE_ variables: they are bundled into public JavaScript. No sponsor secrets are needed in the frontend project.

The build downloads the local MediaPipe model. Confirm /mediapipe assets load after deployment. The camera runs in the browser and requires HTTPS or localhost. Vercel hosts the website, not the camera processing.

## 3. Extension

Set VITE_API_BASE_URL to the same HTTPS API origin in your local .env, then run npm run build. This embeds the public API address and adds that exact origin to the generated extension host permissions and connection policy. Reload dist/extension in chrome://extensions and refresh YouTube. Vesti connects automatically to that API. Try-On opens WEB_ORIGIN with a single-use handoff.

For a fully local demo, leave VITE_API_BASE_URL unset, use WEB_ORIGIN=http://localhost:5173 and run npm run dev. A deployed website should use the hosted HTTPS API, rather than depend on a visitor's localhost service.

## Verification

Check the HTTPS API /health/ready, open the extension, complete one live search, click Try-On, and confirm the Vercel page loads that product. Enable the camera manually and check pose alignment. API availability, CORS, extension capture and camera permissions are distinct checks; a successful build alone does not prove them.

References: [Vercel Vite deployment](https://vercel.com/docs/frameworks/frontend/vite), [Vite public environment variables](https://vite.dev/guide/env-and-mode).

Live product previews use OpenAI image edits (gpt-image-1.5), which may require model access and incur image-generation charges. Keep API requests open for up to 150 seconds on the API host/proxy. Extracted assets are cached under .runtime/garments; use an ephemeral or persistent writable volume as appropriate. Do not publish that directory directly. No generated file is placed in the extension bundle.

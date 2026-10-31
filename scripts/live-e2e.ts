import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { createApp } from "../apps/api/server";
import { initGraph, closeGraph } from "../packages/providers/graph";
import { safeGet } from "../workers/discovery/network.mjs";
import { terminal, type Search } from "../packages/contracts";

await initGraph();
let code = "";
const app = await createApp((c) => {
  code = c;
});
const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  note: "Real product-image recognition, broad OpenAI web search, merchant verification, Daytona candidate curation, Neo4j ranking, scoped handoff and AI garment extraction from the selected product photo. Physical webcam tracking and Chrome capture remain manual checks.",
};
try {
  const fixtures = JSON.parse(
    await readFile("docs/verification/merchant-adapters.json", "utf8"),
  );
  const source = fixtures.listings.find((l: { imageUrl: string }) =>
    l.imageUrl?.includes("Front"),
  );
  if (!source)
    throw new Error(
      "Run merchant-smoke first to get a current front-view fixture.",
    );
  const downloaded = await safeGet(source.imageUrl, [source.merchantDomain]);
  const image = await sharp(downloaded.bytes)
    .resize(900, 900, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  report.fixture = {
    imageUrl: source.imageUrl,
    productUrl: source.canonicalUrl,
  };
  const origin = "http://localhost:5173",
    paired = await app.inject({
      method: "POST",
      url: "/v1/pair",
      headers: { origin },
      payload: { code },
    });
  if (paired.statusCode !== 200)
    throw new Error(`Pairing failed ${paired.statusCode}`);
  const headers = { origin, authorization: `Bearer ${paired.json().token}` };
  const boundary = "vesti-e2e-" + crypto.randomUUID();
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="selection"\r\n\r\n${JSON.stringify({ click: { x: 0.5, y: 0.5 }, videoTime: 0, locale: "en-US" })}\r\n--${boundary}\r\nContent-Disposition: form-data; name="crop"; filename="fixture.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
    ),
    image,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const start = Date.now();
  const created = await app.inject({
    method: "POST",
    url: "/v1/searches",
    headers: {
      ...headers,
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "idempotency-key": crypto.randomUUID(),
    },
    payload: body,
  });
  if (created.statusCode !== 202)
    throw new Error(`Create failed ${created.statusCode}: ${created.body}`);
  let search: Search;
  for (;;) {
    const response = await app.inject({
      method: "GET",
      url: `/v1/searches/${created.json().id}`,
      headers,
    });
    search = response.json();
    if (terminal(search.stage)) break;
    if (search.stage === "awaiting_confirmation")
      throw new Error(
        "Fixture requires user confirmation; recognition did not confidently select it.",
      );
    if (Date.now() - start > 100000) throw new Error("E2E deadline exceeded");
    await new Promise((r) => setTimeout(r, 700));
  }
  report.durationMs = Date.now() - start;
  report.search = search;
  if (
    !["completed", "partial"].includes(search.stage) ||
    !search.recommendations.length
  )
    throw new Error(search.error?.message || "No verified recommendations");
  if (
    search.evidence.daytona.state !== "succeeded" ||
    !search.evidence.daytona.details?.sandboxId ||
    search.evidence.daytona.details?.exitCode !== 0 ||
    search.evidence.cleanup !== "deleted"
  )
    throw new Error("Daytona curation or sandbox cleanup was not confirmed");
  const handoff = await app.inject({
    method: "POST",
    url: `/v1/searches/${search.id}/handoff`,
    headers,
    payload: { listingId: search.recommendations[0].id },
  });
  const handoffCode = new URLSearchParams(
    new URL(handoff.json().url).hash.slice(1),
  ).get("handoff");
  const exchanged = await app.inject({
    method: "POST",
    url: "/v1/handoffs/exchange",
    headers: { origin },
    payload: { code: handoffCode },
  });
  const fitHeaders = {
    origin,
    authorization: `Bearer ${exchanged.json().token}`,
  };
  const fit = await app.inject({
    method: "GET",
    url: "/v1/fitting",
    headers: fitHeaders,
  });
  const overlay = await app.inject({
    method: "GET",
    url: "/v1/fitting/overlay",
    headers: fitHeaders,
  });
  if (fit.statusCode !== 200 || overlay.statusCode !== 200)
    throw new Error("Fitting handoff or overlay failed");
  if (
    !fit.json().overlay.aiExtracted ||
    fit.json().overlay.illustration ||
    !overlay.headers["content-type"]?.includes("image/png")
  )
    throw new Error(
      "Expected real product-derived PNG preview, not a demo SVG",
    );
  report.fitting = {
    handoffStatus: exchanged.statusCode,
    sessionStatus: fit.statusCode,
    overlayStatus: overlay.statusCode,
    illustration: fit.json().overlay.illustration,
    aiExtracted: fit.json().overlay.aiExtracted,
    sourceUrl: fit.json().overlay.sourceUrl,
    graph: fit.json().graph,
  };
  report.ok = true;
} catch (e) {
  report.ok = false;
  report.error = (e as Error).message;
} finally {
  await app.close();
  await closeGraph();
}
await mkdir("docs/verification", { recursive: true });
await writeFile(
  "docs/verification/live-e2e.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    ok: report.ok,
    durationMs: report.durationMs,
    error: report.error,
    searchId: (report.search as Search)?.id,
    count: (report.search as Search)?.recommendations?.length,
    fitting: report.fitting,
    daytona: (report.search as Search)?.evidence.daytona,
    cleanup: (report.search as Search)?.evidence.cleanup,
  }),
);
if (!report.ok) process.exitCode = 1;

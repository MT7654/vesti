import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { identifyOpenAI, discoverOpenAI } from "../packages/providers/openai";
import { garmentSvg } from "../apps/api/overlays";
const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  note: "Real OpenAI image and web-search requests; image is a synthetic hoodie fixture. Merchant data is fetched live and verified from structured product pages.",
};
try {
  const start = Date.now(),
    image = await sharp(Buffer.from(garmentSvg("hoodie", "#303331")))
      .flatten({ background: "#f4f1e9" })
      .jpeg()
      .toBuffer();
  const identification = await identifyOpenAI(
    image,
    { click: { x: 0.5, y: 0.5 }, videoTime: 0, locale: "en-US" },
    AbortSignal.timeout(40000),
  );
  report.identification = { ...identification, durationMs: Date.now() - start };
  const searchStart = Date.now();
  report.discovery = await discoverOpenAI(
    identification.garment,
    crypto.randomUUID(),
    AbortSignal.timeout(60000),
    (e) => {
      report.evidence = e;
    },
  );
  report.discoveryDurationMs = Date.now() - searchStart;
} catch (e) {
  report.error = (e as Error).message;
}
await mkdir("docs/verification", { recursive: true });
await writeFile(
  "docs/verification/openai-smoke.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));

import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { nosanaHealth, identify } from "../packages/providers/nosana";
import { daytonaSmoke } from "../packages/providers/daytona";
import { query, closeGraph } from "../packages/providers/graph";
import { garmentSvg } from "../apps/api/overlays";
const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  note: "Real provider calls. Synthetic image checks payload support only, not recognition quality. No full live shopping demonstration implied.",
};
async function check(name: string, fn: () => Promise<unknown>) {
  const start = Date.now();
  try {
    report[name] = {
      ok: true,
      durationMs: Date.now() - start,
      result: await fn(),
    };
    (report[name] as { durationMs: number }).durationMs = Date.now() - start;
  } catch (e) {
    report[name] = {
      ok: false,
      durationMs: Date.now() - start,
      error: e instanceof Error ? e.message.slice(0, 300) : "failed",
    };
  }
  console.log(name, JSON.stringify(report[name]));
}
await check("nosanaHealth", nosanaHealth);
await check("neo4j", async () => {
  const id = crypto.randomUUID();
  await query("CREATE (n:VestiSmoke {id:$id})", { id });
  const r = await query(
    "MATCH (n:VestiSmoke {id:$id}) WITH n,n.id AS id DELETE n RETURN id",
    { id },
  );
  return { writeReadDelete: r.records[0]?.get("id") === id };
});
await check("daytona", daytonaSmoke);
if (process.argv.includes("--vision"))
  await check("nosanaImage", async () => {
    const image = await sharp(Buffer.from(garmentSvg()))
      .flatten({ background: "#f4f1e9" })
      .jpeg()
      .toBuffer();
    return identify(
      image,
      { click: { x: 0.5, y: 0.5 }, videoTime: 0, locale: "en-US" },
      AbortSignal.timeout(55000),
    );
  });
await closeGraph();
await mkdir("docs/verification", { recursive: true });
await writeFile(
  "docs/verification/service-smoke.json",
  JSON.stringify(report, null, 2),
);

import { discover } from "../packages/providers/daytona";
import { demoGarment } from "../packages/contracts/demo";
import { writeFile, mkdir } from "node:fs/promises";
const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  note: "Real Nosana text planning and Daytona merchant retrieval from a synthetic attribute selection. Not a video-to-product recognition test.",
};
const started = Date.now();
try {
  report.result = await discover(
    demoGarment("hoodie", "black"),
    crypto.randomUUID(),
    AbortSignal.timeout(85000),
    (e) => {
      report.execution = e;
    },
    (s) => {
      report.cleanup = s;
    },
  );
  report.durationMs = Date.now() - started;
} catch (e) {
  report.error = (e as Error).message;
}
await mkdir("docs/verification", { recursive: true });
await writeFile(
  "docs/verification/discovery-smoke.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));

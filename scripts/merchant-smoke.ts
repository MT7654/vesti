import { mkdir, writeFile } from "node:fs/promises";
import { discover } from "../workers/discovery/runner.mjs";
const result = await discover({
  runId: "local-adapter-validation",
  query: "black hoodie",
  category: "hoodie",
  domains: ["shop.spacex.com", "thegithubshop.com"],
});
const report = {
  checkedAt: new Date().toISOString(),
  note: "Local adapter validation only. This does not bypass or satisfy the required Daytona shopping execution.",
  ...result,
};
await mkdir("docs/verification", { recursive: true });
await writeFile(
  "docs/verification/merchant-adapters.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));

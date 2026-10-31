import { config } from "./config";
import { createApp } from "./server";
import { initGraph, closeGraph } from "../../packages/providers/graph";
import { cleanupOrphans } from "../../packages/providers/daytona";

await initGraph()
  .then(() => console.log("Neo4j connected; graph constraints ready."))
  .catch(() =>
    console.log(
      "Neo4j is unavailable. Live searches require a working connection; demo remains available. Run npm run smoke for diagnosis.",
    ),
  );
await cleanupOrphans().catch(() =>
  console.log(
    "Daytona orphan cleanup could not finish; provider auto-stop remains enabled.",
  ),
);
const app = await createApp((code) =>
  console.log(`Vesti pairing code: ${code} (single use, valid 10 minutes)`),
);
await app.listen({ host: config.HOST, port: config.PORT });
console.log(
  `Vesti API: http://${config.HOST}:${config.PORT} | Web: ${config.WEB_ORIGIN}`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app
      .close()
      .then(() => closeGraph())
      .then(() => process.exit(0));
  });

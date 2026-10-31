import { Daytona } from "@daytona/sdk";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { config } from "../../apps/api/config";
import { listingSchema, type Garment, type Listing } from "../contracts";
import { plan } from "./nosana";

const client = () =>
  new Daytona({
    apiKey: config.DAYTONA_API_KEY,
    apiUrl: config.DAYTONA_API_URL,
    ...(config.DAYTONA_TARGET ? { target: config.DAYTONA_TARGET } : {}),
    requestTimeoutMs: 15000,
  });
export async function discover(
  garment: Garment,
  runId: string,
  signal: AbortSignal,
  onEvidence: (details: Record<string, unknown>) => void,
  onCleanup: (state: string) => void,
) {
  if (!config.merchants.length)
    throw new Error(
      "No public merchant sources enabled. Configure MERCHANT_ALLOWED_DOMAINS, or choose the labelled demo.",
    );
  const sdk = client();
  let sandbox: Awaited<ReturnType<Daytona["create"]>> | undefined;
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = () => {
    if (!sandbox) return Promise.resolve();
    if (!cleanupPromise) {
      onCleanup("deleting");
      cleanupPromise = sdk
        .delete(sandbox, 15)
        .then(() => {
          onCleanup("deleted");
        })
        .catch(() => {
          onCleanup("cleanup_pending");
        });
    }
    return cleanupPromise;
  };
  const onAbort = () => {
    void cleanup();
  };
  const warnings: string[] = [];
  const listings: Listing[] = [];
  const actions = await plan(garment, signal);
  signal.throwIfAborted();
  try {
    try {
      sandbox = await sdk.create(
        {
          language: "javascript",
          ...(config.DAYTONA_SNAPSHOT
            ? { snapshot: config.DAYTONA_SNAPSHOT }
            : {}),
          public: false,
          domainAllowList: config.merchants.slice(0, 2).join(","),
          ttlMinutes: 3,
          autoStopInterval: 2,
          autoDeleteInterval: 0,
          labels: { app: "vesti", run: runId },
          envVars: {},
        },
        { timeout: 30 },
      );
    } catch (e) {
      if (/network access is restricted/i.test((e as Error).message))
        throw new Error(
          "Daytona account network access is restricted. Enable public network access in Daytona to search stores, or use the labelled demo.",
        );
      throw e;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    onEvidence({
      sandboxId: sandbox.id,
      actions,
      source: "fresh sandbox execution",
      snapshot: config.DAYTONA_SNAPSHOT || "provider default (not pinned)",
    });
    signal.throwIfAborted();
    for (const name of ["runner.mjs", "network.mjs"])
      await sandbox.fs.uploadFile(
        await readFile(
          new URL(`../../workers/discovery/${name}`, import.meta.url),
        ),
        `/tmp/vesti-${name}`,
      );
    // The worker imports a fixed sibling; only bounded JSON goes into its input file.
    await sandbox.fs.uploadFile(
      await readFile(
        new URL("../../workers/discovery/network.mjs", import.meta.url),
      ),
      "/tmp/network.mjs",
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      signal.throwIfAborted();
      const query =
        attempt === 0
          ? actions[0].query
          : (
              await plan(
                garment,
                signal,
                "The first public collection search found no supported products. Broaden the clothing words.",
              )
            )[0].query;
      await sandbox.fs.uploadFile(
        Buffer.from(
          JSON.stringify({
            query,
            category: garment.category,
            domains: config.merchants.slice(0, 2),
            runId,
          }),
        ),
        "/tmp/vesti-input.json",
      );
      const execution = await sandbox.process.executeCommand(
        "node /tmp/vesti-runner.mjs /tmp/vesti-input.json",
        "/tmp",
        undefined,
        40,
      );
      signal.throwIfAborted();
      if (execution.exitCode !== 0)
        throw new Error(
          `Daytona worker exited with status ${execution.exitCode}.`,
        );
      const output = JSON.parse(execution.result.trim()) as {
        listings: unknown[];
        merchants: {
          domain: string;
          error: string | null;
          count: number;
          sources: string[];
        }[];
      };
      onEvidence({
        sandboxId: sandbox.id,
        exitCode: execution.exitCode,
        merchants: output.merchants,
        actionsExecuted: attempt + 1,
        extraction: "public-product-jsonld-v1",
      });
      output.merchants.forEach((m) => {
        if (m.error) warnings.push(`${m.domain}: ${m.error}`);
      });
      for (const item of output.listings.slice(0, 20)) {
        const l = listingSchema.parse(item);
        if (!listings.some((x) => x.productKey === l.productKey))
          listings.push(l);
      }
      if (listings.length || warnings.length) break;
    }
    return { listings, warnings };
  } finally {
    signal.removeEventListener("abort", onAbort);
    await cleanup();
  }
}
export async function cleanupOrphans() {
  if (!config.DAYTONA_API_KEY) return;
  const sdk = client();
  for await (const sandbox of sdk.list({ labels: { app: "vesti" } }))
    await sdk.delete(sandbox, 15);
}
export async function curateCandidates(
  listings: Listing[],
  garment: Garment,
  runId: string,
  signal: AbortSignal,
  onEvidence: (details: Record<string, unknown>) => void,
  onCleanup: (state: string) => void,
) {
  if (!config.DAYTONA_API_KEY)
    throw new Error(
      "Daytona is required for candidate curation. Configure DAYTONA_API_KEY.",
    );
  signal.throwIfAborted();
  const sdk = client();
  let sandbox: Awaited<ReturnType<Daytona["create"]>> | undefined;
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = () => {
    if (!sandbox) return Promise.resolve();
    return (cleanupPromise ??= (async () => {
      onCleanup("deleting");
      try {
        await sdk.delete(sandbox!, 15);
        onCleanup("deleted");
      } catch {
        onCleanup("cleanup_pending");
      }
    })());
  };
  const onAbort = () => {
    void cleanup();
  };
  try {
    // Use the account's existing firewall policy. This worker needs no outbound access.
    sandbox = await sdk.create(
      {
        language: "javascript",
        ...(config.DAYTONA_SNAPSHOT
          ? { snapshot: config.DAYTONA_SNAPSHOT }
          : {}),
        public: false,
        ttlMinutes: 3,
        autoStopInterval: 2,
        autoDeleteInterval: 0,
        labels: { app: "vesti", run: runId, role: "candidate-curation" },
        envVars: {},
      },
      { timeout: 30 },
    );
    signal.addEventListener("abort", onAbort, { once: true });
    signal.throwIfAborted();
    const worker = await readFile(
      new URL("../../workers/discovery/curate.mjs", import.meta.url),
    );
    onEvidence({
      role: "Candidate validation and deduplication",
      sandboxId: sandbox.id,
      workerSha256: createHash("sha256").update(worker).digest("hex"),
      network: "No outbound requests; existing account firewall policy",
    });
    await sandbox.fs.uploadFile(worker, "/tmp/vesti-curate.mjs", 10);
    signal.throwIfAborted();
    await sandbox.fs.uploadFile(
      Buffer.from(
        JSON.stringify({
          listings,
          domains: [...new Set(listings.map((l) => l.merchantDomain))],
          category: garment.category,
          runId,
        }),
      ),
      "/tmp/vesti-candidates.json",
      10,
    );
    signal.throwIfAborted();
    const execution = await sandbox.process.executeCommand(
      "node /tmp/vesti-curate.mjs /tmp/vesti-candidates.json",
      "/tmp",
      undefined,
      10,
    );
    signal.throwIfAborted();
    if (execution.exitCode !== 0)
      throw new Error(
        `Daytona candidate worker exited with status ${execution.exitCode}.`,
      );
    const output = JSON.parse(execution.result.trim()) as {
      listings: unknown[];
      audit: Record<string, unknown>;
    };
    const curated = output.listings.map((item) => listingSchema.parse(item));
    onEvidence({ exitCode: execution.exitCode, ...output.audit });
    return curated;
  } finally {
    signal.removeEventListener("abort", onAbort);
    await cleanup();
  }
}
export async function daytonaSmoke() {
  const sdk = client();
  const sandbox = await sdk.create(
    {
      language: "javascript",
      autoStopInterval: 2,
      autoDeleteInterval: 0,
      labels: { app: "vesti", run: "smoke" },
    },
    { timeout: 30 },
  );
  try {
    const result = await sandbox.process.executeCommand(
      'node -e "console.log(JSON.stringify({runtime:process.version,ok:true}))"',
      undefined,
      undefined,
      10,
    );
    return {
      sandboxId: sandbox.id,
      exitCode: result.exitCode,
      result: result.result,
    };
  } finally {
    await sdk.delete(sandbox, 15);
  }
}

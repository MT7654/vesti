import {
  attribute,
  emptyEvidence,
  needsConfirmation,
  terminal,
  type Category,
  type Filters,
  type Search,
  type Selection,
} from "../../packages/contracts";
import {
  demoGarment,
  demoListings,
  filterDemo,
} from "../../packages/contracts/demo";
import { identify } from "../../packages/providers/nosana";
import { discover, curateCandidates } from "../../packages/providers/daytona";
import {
  identifyOpenAI,
  discoverOpenAI,
} from "../../packages/providers/openai";
import * as graph from "../../packages/providers/graph";
import { config } from "./config";

type Job = {
  sessionId: string;
  search: Search;
  abort: AbortController;
  image?: Buffer;
  timer?: ReturnType<typeof setTimeout>;
  allDemo?: ReturnType<typeof demoListings>;
  running: boolean;
};
const jobs = new Map<string, Job>();
let active = 0;
const queue: (() => Promise<void>)[] = [];
function schedule(fn: () => Promise<void>) {
  queue.push(fn);
  drain();
}
function drain() {
  while (active < config.MAX_CONCURRENT_SEARCHES && queue.length) {
    active++;
    void queue.shift()!().finally(() => {
      active--;
      drain();
    });
  }
}
async function persist(j: Job) {
  j.search.updatedAt = new Date().toISOString();
  if (!j.search.demo) await graph.saveSearch(j.sessionId, j.search);
}
async function stage(j: Job, next: Search["stage"]) {
  j.abort.signal.throwIfAborted();
  const previous = j.search.stage;
  j.search.stage = next;
  try {
    await persist(j);
  } catch (e) {
    j.search.stage = previous;
    throw e;
  }
}
function fail(j: Job, error: unknown) {
  if (terminal(j.search.stage)) return;
  const at = j.search.stage;
  const message =
    error instanceof Error ? error.message : "Search could not finish.";
  j.search.error = {
    code: j.abort.signal.aborted ? "TIMEOUT" : "SERVICE_ERROR",
    stage: at,
    retryable: true,
    message: message
      .slice(0, 240)
      .replace(/(?:Bearer|password|api[_-]?key)\s*[:=]?\s*\S+/gi, "[redacted]"),
    requestId: j.search.id,
  };
  j.search.stage = "failed";
  const key =
    config.useOpenAI && ["identifying", "discovering"].includes(at)
      ? "openai"
      : at === "identifying"
        ? "nosana"
        : at === "discovering"
          ? "daytona"
          : "neo4j";
  for (const provider of [key, "daytona"] as const)
    if (j.search.evidence[provider]?.state === "running")
      j.search.evidence[provider]!.state = "failed";
  void persist(j).catch(() => {});
}
function arm(j: Job) {
  j.timer = setTimeout(() => {
    fail(
      j,
      new Error("Search reached its time limit. Select again or try the demo."),
    );
    j.abort.abort();
    j.image = undefined;
  }, config.SEARCH_TIMEOUT_MS);
}
async function finishDiscovery(j: Job) {
  const signal = j.abort.signal,
    e = j.search.evidence;
  try {
    await stage(j, "discovering");
    const start = Date.now();
    const discoveryProvider = config.useOpenAI ? "openai" : "daytona";
    e[discoveryProvider]!.state = "running";
    const result = config.useOpenAI
      ? await discoverOpenAI(
          j.search.garment!,
          j.search.id,
          signal,
          (details) => {
            e.openai!.details = { ...e.openai!.details, discovery: details };
          },
        )
      : await discover(
          j.search.garment!,
          j.search.id,
          signal,
          (details) => {
            e.daytona.details = { ...e.daytona.details, ...details };
          },
          (state) => {
            e.cleanup = state;
            void persist(j).catch(() => {});
          },
        );
    signal.throwIfAborted();
    e[discoveryProvider]!.durationMs =
      (e[discoveryProvider]!.durationMs || 0) + Date.now() - start;
    e[discoveryProvider]!.state = "succeeded";
    j.search.warnings.push(...result.warnings);
    if (!result.listings.length && result.warnings.length)
      throw new Error(
        "Public sources could not complete discovery. Try again or use the labelled demo.",
      );
    if (config.useOpenAI) {
      e.daytona.state = "running";
      await persist(j);
      const curateStart = Date.now();
      result.listings = await curateCandidates(
        result.listings,
        j.search.garment!,
        j.search.id,
        signal,
        (details) => {
          e.daytona.details = { ...e.daytona.details, ...details };
        },
        (state) => {
          e.cleanup = state;
          void persist(j).catch(() => {});
        },
      );
      signal.throwIfAborted();
      e.daytona.state = "succeeded";
      e.daytona.durationMs = Date.now() - curateStart;
    }
    await stage(j, "ranking");
    e.neo4j.state = "running";
    const graphStart = Date.now();
    const counts = await graph.ingest(j.sessionId, j.search, result.listings);
    signal.throwIfAborted();
    j.search.recommendations = await graph.rank(j.sessionId, j.search.id);
    signal.throwIfAborted();
    e.neo4j = {
      state: "succeeded",
      durationMs: Date.now() - graphStart,
      details: {
        ...counts,
        queryVersion: "attribute-v1",
        rows: j.search.recommendations.map((r) => ({
          id: r.id,
          score: r.score,
          components: r.components,
          reasons: r.reasons,
        })),
      },
    };
    e.fresh = true;
    await stage(j, result.warnings.length ? "partial" : "completed");
  } catch (error) {
    fail(j, error);
  } finally {
    if (j.timer) clearTimeout(j.timer);
    j.running = false;
  }
}
async function execute(j: Job) {
  if (j.abort.signal.aborted) return;
  j.search.queued = false;
  j.running = true;
  arm(j);
  try {
    await stage(j, "identifying");
    const recognitionProvider = config.useOpenAI ? "openai" : "nosana";
    j.search.evidence[recognitionProvider]!.state = "running";
    const start = Date.now();
    const { garment, receipt } = await (
      config.useOpenAI ? identifyOpenAI : identify
    )(j.image!, j.search.selection, j.abort.signal);
    j.image = undefined;
    j.abort.signal.throwIfAborted();
    j.search.garment = garment;
    j.search.evidence[recognitionProvider] = {
      state: "succeeded",
      durationMs: Date.now() - start,
      details: { recognition: receipt },
    };
    if (needsConfirmation(garment, j.search.selection.click)) {
      clearTimeout(j.timer);
      await stage(j, "awaiting_confirmation");
      return;
    }
    await finishDiscovery(j);
  } catch (error) {
    fail(j, error);
  } finally {
    j.image = undefined;
    j.running = false;
    if (j.search.stage !== "discovering" && j.timer) clearTimeout(j.timer);
  }
}
export async function createJob(
  sessionId: string,
  selection: Selection,
  image?: Buffer,
  demo = false,
  demoCategory: Category = "jacket",
  demoColour = "olive",
) {
  if (!demo && queue.length >= 8)
    throw Object.assign(
      new Error("The search queue is full. Please try again shortly."),
      { statusCode: 429 },
    );
  if (
    [...jobs.values()].some(
      (j) => j.sessionId === sessionId && !terminal(j.search.stage),
    )
  )
    throw new Error("Finish or cancel the current search first.");
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  const search: Search = {
    schemaVersion: 1,
    id,
    stage: "created",
    demo,
    createdAt: now,
    updatedAt: now,
    selection,
    recommendations: [],
    warnings: [],
    evidence: emptyEvidence(),
    queued: !demo,
  };
  search.evidence.mode = demo
    ? "demo"
    : config.useOpenAI
      ? "openai"
      : "sponsors";
  if (config.useOpenAI && !demo)
    search.evidence.openai = { state: "not_started" };
  const j: Job = {
    sessionId,
    search,
    abort: new AbortController(),
    image,
    running: false,
  };
  if (demo) {
    search.garment = demoGarment(demoCategory, demoColour);
    j.allDemo = demoListings(id, demoCategory, demoColour);
    search.recommendations = j.allDemo;
    search.stage = "completed";
    search.warnings = [
      "Demo collection: illustrative items and sample prices. No live sponsor calls or merchant inventory.",
    ];
  }
  jobs.set(id, j);
  if (!demo) {
    try {
      await persist(j);
    } catch (e) {
      jobs.delete(id);
      throw e;
    }
  }
  if (!demo) {
    const expiry = setTimeout(() => {
      if (j.image) {
        fail(j, new Error("Queued crop expired. Select the garment again."));
        j.abort.abort();
        j.image = undefined;
      }
    }, 300000);
    expiry.unref();
    schedule(async () => {
      try {
        await execute(j);
      } finally {
        clearTimeout(expiry);
      }
    });
  }
  return search;
}
export async function getJob(
  sessionId: string,
  id: string,
): Promise<Search | null> {
  const j = jobs.get(id);
  if (j) return j.sessionId === sessionId ? j.search : null;
  const search = await graph.loadSearch(sessionId, id);
  if (search?.stage === "awaiting_confirmation")
    jobs.set(id, {
      sessionId,
      search,
      abort: new AbortController(),
      running: false,
    });
  return search;
}
export async function confirmJob(
  sessionId: string,
  id: string,
  category: "jacket" | "hoodie" | "tshirt",
  colour?: string,
) {
  const j = jobs.get(id);
  if (!j || j.sessionId !== sessionId) throw new Error("Search not found");
  if (j.search.stage !== "awaiting_confirmation")
    throw new Error("Search is not waiting for confirmation");
  const g = j.search.garment!;
  g.category = category;
  g.attributes = g.attributes.filter(
    (a) => a.kind !== "category" && (!colour || a.kind !== "colour"),
  );
  g.attributes.push(
    attribute(
      "category",
      category,
      "user",
      "User confirmed the selected garment",
    ),
  );
  if (colour)
    g.attributes.push(
      attribute("colour", colour, "user", "User corrected the selected colour"),
    );
  j.search.stage = "created";
  j.search.queued = true;
  await persist(j);
  schedule(async () => {
    if (j.abort.signal.aborted) return;
    j.search.queued = false;
    j.running = true;
    arm(j);
    await finishDiscovery(j);
  });
  return j.search;
}
export async function rankJob(sessionId: string, id: string, filters: Filters) {
  const search = await getJob(sessionId, id);
  if (!search) throw new Error("Search not found");
  if (!["completed", "partial"].includes(search.stage))
    throw new Error("Wait for discovery to finish");
  search.recommendations = search.demo
    ? filterDemo(jobs.get(id)?.allDemo ?? demoListings(id), filters)
    : await graph.rank(sessionId, id, filters);
  if (!search.demo) await graph.saveSearch(sessionId, search);
  return search;
}
export async function cancelJob(sessionId: string, id: string) {
  const j = jobs.get(id);
  if (!j || j.sessionId !== sessionId) return false;
  j.abort.abort();
  j.image = undefined;
  clearTimeout(j.timer);
  if (!terminal(j.search.stage)) j.search.stage = "cancelled";
  for (const sponsor of ["nosana", "daytona", "neo4j", "openai"] as const)
    if (j.search.evidence[sponsor]?.state === "running")
      j.search.evidence[sponsor]!.state = "failed";
  await persist(j).catch(() => {});
  return true;
}
export function cleanupJobs() {
  for (const [id, j] of jobs) {
    if (Date.now() - Date.parse(j.search.createdAt) > 86400000) {
      j.abort.abort();
      clearTimeout(j.timer);
      jobs.delete(id);
    } else if (
      j.search.stage === "awaiting_confirmation" &&
      Date.now() - Date.parse(j.search.updatedAt) > 300000
    ) {
      j.abort.abort();
      j.search.stage = "cancelled";
      void persist(j).catch(() => {});
    }
  }
}
export function shutdownJobs() {
  for (const j of jobs.values()) {
    j.abort.abort();
    clearTimeout(j.timer);
  }
}

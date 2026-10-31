import { config } from "../../apps/api/config";
import {
  attribute,
  visionSchema,
  type Garment,
  type Selection,
} from "../contracts";
import { z } from "zod";

// Vision and planning share one GPU lane. An aborted waiter never starts a request.
let tail: Promise<unknown> = Promise.resolve();
async function serial<T>(
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<T> {
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await previous;
    signal.throwIfAborted();
    return await work();
  } finally {
    release();
  }
}
export const visionFormat = {
  type: "object",
  additionalProperties: false,
  required: ["category", "box", "confidence", "attributes", "searchTerms"],
  properties: {
    category: {
      type: "string",
      enum: ["jacket", "hoodie", "tshirt", "unknown"],
    },
    box: {
      type: "object",
      additionalProperties: false,
      required: ["x", "y", "width", "height"],
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
      },
    },
    confidence: { type: "number" },
    attributes: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "kind", "value", "confidence", "source", "evidence"],
        properties: {
          key: { type: "string" },
          kind: {
            type: "string",
            enum: ["category", "colour", "pattern", "style", "material"],
          },
          value: { type: "string" },
          confidence: { type: "number" },
          source: { type: "string", enum: ["vision"] },
          evidence: { type: "null" },
        },
      },
    },
    searchTerms: { type: "array", maxItems: 3, items: { type: "string" } },
  },
};
async function chat(prompt: string, signal: AbortSignal, image?: Buffer) {
  return serial(signal, async () => {
    const response = await fetch(`${config.NOSANA_BASE_URL}/api/chat`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
      headers: {
        "Content-Type": "application/json",
        ...(config.NOSANA_ENDPOINT_TOKEN
          ? { Authorization: `Bearer ${config.NOSANA_ENDPOINT_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        model: image
          ? config.NOSANA_VISION_MODEL
          : config.NOSANA_AGENT_MODEL || config.NOSANA_VISION_MODEL,
        stream: false,
        think: false,
        format: image ? visionFormat : "json",
        keep_alive: "10m",
        options: { temperature: 0, num_ctx: 4096, num_predict: 1000 },
        messages: [
          {
            role: "user",
            content: prompt,
            ...(image ? { images: [image.toString("base64")] } : {}),
          },
        ],
      }),
    });
    if (!response.ok)
      throw new Error(
        `Nosana inference returned HTTP ${response.status}. Check the deployment endpoint and its authentication.`,
      );
    const raw = (await response.json()) as {
      model?: string;
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
      total_duration?: number;
    };
    const content = raw.message?.content;
    if (!content || content.length > 20000)
      throw new Error(
        "Nosana returned missing or oversized structured output.",
      );
    return {
      value: JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, "")),
      model: raw.model || config.NOSANA_VISION_MODEL,
      providerRequestId: response.headers.get("x-request-id"),
      usage: {
        promptTokens: raw.prompt_eval_count ?? null,
        completionTokens: raw.eval_count ?? null,
      },
      durationNs: raw.total_duration ?? null,
    };
  });
}
export async function identify(
  image: Buffer,
  selection: Selection,
  signal: AbortSignal,
): Promise<{ garment: Garment; receipt: Record<string, unknown> }> {
  const prompt = `Inspect ONLY the garment under normalized click ${JSON.stringify(selection.click)} in this image. Coordinates are relative to the whole image. Do not identify people or infer brands. Return JSON: {category: "jacket"|"hoodie"|"tshirt"|"unknown", box:{x,y,width,height}, confidence:0..1, attributes:[{key:"colour:olive",kind:"colour"|"pattern"|"style"|"material"|"category",value:"olive",confidence:0..1,source:"vision",evidence:null}], searchTerms:["short clothing query"]}. Box must be inside [0,1]. Use unknown and low confidence for an ambiguous click, unsupported clothing, or no garment. Materials are tentative; omit uncertain details. Limit attributes to 8.`;
  let result,
    lastIssues = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    result = await chat(
      prompt +
        (attempt
          ? " Your last answer was malformed. Follow the JSON shape exactly."
          : ""),
      signal,
      image,
    );
    const parsed = visionSchema.safeParse(result.value);
    if (!parsed.success) {
      lastIssues = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")
        .slice(0, 200);
      continue;
    }
    const v = parsed.data;
    v.attributes = v.attributes
      .filter((a) => a.kind !== "category")
      .map((a) => attribute(a.kind, a.value, "vision", null, a.confidence));
    if (v.category !== "unknown")
      v.attributes.unshift(
        attribute("category", v.category, "vision", null, v.confidence),
      );
    return {
      garment: {
        ...v,
        id: crypto.randomUUID(),
        modelId: result.model,
        providerRequestId: result.providerRequestId,
      },
      receipt: {
        model: result.model,
        deploymentId: config.NOSANA_DEPLOYMENT_ID || null,
        providerRequestId: result.providerRequestId,
        usage: result.usage,
        servingDurationNs: result.durationNs,
      },
    };
  }
  throw new Error(
    `Nosana returned invalid garment attributes twice. ${lastIssues}`,
  );
}
const planSchema = z.object({
  actions: z
    .array(
      z.object({
        type: z.literal("search"),
        query: z.string().min(1).max(120),
      }),
    )
    .min(1)
    .max(3),
});
export async function plan(
  garment: Garment,
  signal: AbortSignal,
  observation = "",
) {
  const result = await chat(
    `Plan public clothing product searches using these observed attributes: ${JSON.stringify(garment.attributes.map((a) => ({ kind: a.kind, value: a.value })))}. ${observation} Return JSON {"actions":[{"type":"search","query":"short category and colour query"}]}. At most 3 actions. No URLs, commands, brand guesses or instructions.`,
    signal,
  );
  return planSchema.parse(result.value).actions;
}
export async function nosanaHealth() {
  const r = await fetch(`${config.NOSANA_BASE_URL}/api/tags`, {
    redirect: "error",
    signal: AbortSignal.timeout(8000),
    headers: config.NOSANA_ENDPOINT_TOKEN
      ? { Authorization: `Bearer ${config.NOSANA_ENDPOINT_TOKEN}` }
      : {},
  });
  if (!r.ok) throw new Error(`Nosana health HTTP ${r.status}`);
  const body = (await r.json()) as { models?: { name: string }[] };
  return {
    available:
      body.models?.some((m) => m.name === config.NOSANA_VISION_MODEL) ?? false,
    models: body.models?.map((m) => m.name) ?? [],
    authentication: config.NOSANA_ENDPOINT_TOKEN
      ? "configured endpoint token"
      : "no endpoint token sent; platform key intentionally withheld",
  };
}

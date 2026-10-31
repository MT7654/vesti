import { z } from "zod";

export const categorySchema = z.enum(["jacket", "hoodie", "tshirt", "unknown"]);
export type Category = z.infer<typeof categorySchema>;
export const attributeSchema = z.object({
  key: z.string().max(80),
  kind: z.enum(["category", "colour", "pattern", "style", "material"]),
  value: z.string().min(1).max(80),
  confidence: z.number().min(0).max(1).nullable(),
  source: z.enum(["vision", "merchant", "user"]),
  evidence: z.string().max(300).nullable(),
});
export type Attribute = z.infer<typeof attributeSchema>;
export const boxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .refine(
    (b) => b.x + b.width <= 1.001 && b.y + b.height <= 1.001,
    "Box must fit inside the image",
  );
export const visionSchema = z.object({
  category: categorySchema,
  box: boxSchema,
  attributes: z.array(attributeSchema).max(12),
  confidence: z.number().min(0).max(1),
  searchTerms: z.array(z.string().min(1).max(100)).max(3),
});
export type Garment = z.infer<typeof visionSchema> & {
  id: string;
  modelId: string;
  providerRequestId: string | null;
};
export const clickSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export const selectionSchema = z.object({
  click: clickSchema,
  videoId: z
    .string()
    .regex(/^[\w-]{11}$/)
    .optional(),
  videoTime: z.number().min(0).max(86400).default(0),
  locale: z.string().max(20).default("en-US"),
});
export type Selection = z.infer<typeof selectionSchema>;
export const filtersSchema = z
  .object({
    category: categorySchema.optional(),
    colour: z.string().max(40).optional(),
    merchant: z.string().max(100).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    maxPrice: z
      .string()
      .regex(/^\d{1,7}(\.\d{1,3})?$/)
      .optional(),
  })
  .refine(
    (v) => !v.maxPrice || !!v.currency,
    "Choose a currency for a price filter",
  );
export type Filters = z.infer<typeof filtersSchema>;
export const listingSchema = z
  .object({
    id: z.string(),
    productKey: z.string().max(400),
    title: z.string().max(200),
    merchantDomain: z.string().max(150),
    canonicalUrl: z.string().url().nullable(),
    imageUrl: z.string().url().nullable(),
    priceDecimal: z
      .string()
      .regex(/^\d{1,9}(\.\d{1,3})?$/)
      .nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    availability: z.enum(["in_stock", "out_of_stock", "unknown"]),
    checkedAt: z.string().datetime(),
    attributes: z.array(attributeSchema).max(20),
    sourceRunId: z.string(),
    verification: z.enum(["verified", "unverified"]),
    demo: z.boolean().default(false),
  })
  .refine(
    (v) => v.priceDecimal === null || v.currency !== null,
    "A price requires a currency",
  );
export type Listing = z.infer<typeof listingSchema>;
export type Recommendation = Listing & {
  score: number;
  matchType: "similar";
  reasons: { attributeKey: string; evidence: string }[];
  rankingVersion: string;
  overlayStatus: "ready" | "unavailable";
  components?: Record<string, number>;
};
export type Stage =
  | "created"
  | "identifying"
  | "awaiting_confirmation"
  | "discovering"
  | "ranking"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";
export type Sponsor = {
  state: "not_started" | "running" | "succeeded" | "failed";
  durationMs?: number;
  details?: Record<string, unknown>;
};
export type Evidence = {
  openai?: Sponsor;
  mode?: "openai" | "sponsors" | "demo";
  nosana: Sponsor;
  daytona: Sponsor;
  neo4j: Sponsor;
  fresh: boolean;
  cost: "unknown";
  cleanup: string;
};
export type Search = {
  schemaVersion: 1;
  id: string;
  stage: Stage;
  demo: boolean;
  createdAt: string;
  updatedAt: string;
  selection: Selection;
  garment?: Garment;
  recommendations: Recommendation[];
  warnings: string[];
  evidence: Evidence;
  error?: {
    code: string;
    stage: Stage;
    retryable: boolean;
    message: string;
    requestId: string;
  };
  queued?: boolean;
};
export const terminal = (stage: Stage) =>
  ["completed", "partial", "failed", "cancelled"].includes(stage);
export const emptyEvidence = (): Evidence => ({
  nosana: { state: "not_started" },
  daytona: { state: "not_started" },
  neo4j: { state: "not_started" },
  fresh: false,
  cost: "unknown",
  cleanup: "not_required",
});
export function attribute(
  kind: Attribute["kind"],
  value: string,
  source: Attribute["source"],
  evidence: string | null = null,
  confidence: number | null = 1,
): Attribute {
  value = value.trim().toLowerCase();
  return { key: `${kind}:${value}`, kind, value, source, evidence, confidence };
}
export function needsConfirmation(g: Garment, click: { x: number; y: number }) {
  return (
    g.category === "unknown" ||
    g.confidence < 0.65 ||
    click.x < g.box.x ||
    click.x > g.box.x + g.box.width ||
    click.y < g.box.y ||
    click.y > g.box.y + g.box.height
  );
}
export function money(
  listing: Pick<Listing, "priceDecimal" | "currency" | "demo">,
) {
  if (!listing.priceDecimal || !listing.currency)
    return "Check price at retailer";
  return `${listing.demo ? "Sample " : ""}${listing.currency} ${listing.priceDecimal}`;
}
export function decimalMinor(value: string, precision = 3): bigint {
  if (!/^\d+(\.\d{1,3})?$/.test(value)) throw new Error("Invalid decimal");
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(precision) +
    BigInt(fraction.padEnd(precision, "0"))
  );
}

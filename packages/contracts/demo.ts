import {
  attribute,
  decimalMinor,
  type Category,
  type Filters,
  type Garment,
  type Recommendation,
} from "./index";

export function demoGarment(
  category: Category = "jacket",
  colour = "olive",
): Garment {
  return {
    id: crypto.randomUUID(),
    category,
    box: { x: 0.2, y: 0.1, width: 0.6, height: 0.8 },
    confidence: 1,
    modelId: "demo-fixture (no inference)",
    providerRequestId: null,
    searchTerms: [`${colour} ${category}`],
    attributes: [
      attribute("category", category, "user", "Demo selection"),
      attribute("colour", colour, "user", "Demo selection"),
      attribute("style", "casual", "user", "Demo selection"),
    ],
  };
}
export function demoListings(
  runId: string,
  category: Category = "jacket",
  colour = "olive",
): Recommendation[] {
  const names =
    category === "hoodie"
      ? ["Everyday pullover", "Weekend fleece", "Studio hoodie"]
      : category === "tshirt"
        ? ["Everyday cotton tee", "Relaxed studio tee", "Essential crewneck"]
        : [
            "Utility overshirt",
            "Weekend field jacket",
            "Everyday chore jacket",
          ];
  return names.map((title, i) => ({
    id: `demo-${category}-${i}`,
    productKey: `demo:${category}:${i}`,
    title,
    merchantDomain: "Vesti sample collection",
    canonicalUrl: null,
    imageUrl: null,
    priceDecimal: ["89.00", "120.00", "74.00"][i],
    currency: "USD",
    availability: "unknown",
    checkedAt: new Date().toISOString(),
    attributes: [
      attribute("category", category, "user", "Illustrative demo item"),
      attribute(
        "colour",
        i === 1 ? "sand" : colour,
        "user",
        "Illustrative demo item",
      ),
      attribute("style", "casual", "user", "Illustrative demo item"),
    ],
    sourceRunId: runId,
    verification: "unverified",
    demo: true,
    score: i === 1 ? 0.67 : 1,
    matchType: "similar",
    reasons: [
      {
        attributeKey: `category:${category}`,
        evidence: `Sample ${category} illustration`,
      },
    ],
    rankingVersion: "demo-local",
    overlayStatus: "ready",
  }));
}
export function filterDemo(
  rows: Recommendation[],
  f: Filters,
): Recommendation[] {
  const colour = f.colour?.toLowerCase();
  return rows
    .filter(
      (r) =>
        (!f.category ||
          r.attributes.some(
            (a) => a.kind === "category" && a.value === f.category,
          )) &&
        (!colour ||
          r.attributes.some(
            (a) => a.kind === "colour" && a.value === colour,
          )) &&
        (!f.merchant || r.merchantDomain === f.merchant) &&
        (!f.currency || r.currency === f.currency) &&
        (!f.maxPrice ||
          (r.priceDecimal !== null &&
            decimalMinor(r.priceDecimal) <= decimalMinor(f.maxPrice))),
    )
    .sort((a, b) => b.score - a.score);
}

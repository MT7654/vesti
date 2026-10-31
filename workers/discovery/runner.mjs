import { safeGet, robotsAllows, allowedUrl } from "./network.mjs";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const colours = [
  "black",
  "white",
  "olive",
  "green",
  "navy",
  "blue",
  "red",
  "grey",
  "gray",
  "beige",
  "sand",
  "brown",
  "cream",
];
const categoryOf = (t) =>
  /hoodie|hooded sweatshirt/i.test(t)
    ? "hoodie"
    : /jacket|overshirt|coat/i.test(t)
      ? "jacket"
      : /t-shirt|tshirt|tee\b/i.test(t)
        ? "tshirt"
        : "unknown";
const clean = (s) =>
  String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
export function productsFrom(html) {
  const found = [];
  function walk(v) {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if ([v["@type"]].flat().includes("Product")) found.push(v);
    if (v["@graph"]) walk(v["@graph"]);
    if (v.mainEntity) walk(v.mainEntity);
    if (v.hasVariant)
      walk(
        v.hasVariant.map((variant) => ({ category: v.category, ...variant })),
      );
  }
  for (const m of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      walk(JSON.parse(m[1]));
    } catch {}
  }
  return found.filter(
    (p) => !/\b(corporate|employee|members only)\b/i.test(String(p.name)),
  );
}
export async function discover(input) {
  const results = await Promise.all(
    input.domains.slice(0, 2).map(async (domain) => {
      const listings = [];
      const sources = [];
      try {
        input.signal?.throwIfAborted();
        const origin = `https://${domain}`,
          robots = (await safeGet(`${origin}/robots.txt`, [domain])).body;
        // Public HTML only; do not use private/ajax feeds or crawl blocked search routes.
        const path = "/collections/all";
        if (!robotsAllows(robots, path))
          throw new Error("Collection access disallowed by robots policy");
        const supplied = (input.urls || []).filter((url) => {
          try {
            return allowedUrl(url, [domain]).pathname.includes("/products/");
          } catch {
            return false;
          }
        });
        const collection = supplied.length
          ? null
          : await safeGet(origin + path, [domain]);
        if (collection) sources.push(collection.url);
        const links = supplied.length
          ? supplied
          : [
              ...new Set(
                [
                  ...collection.body.matchAll(
                    /href=["']([^"']*\/products\/[^"'#?]+[^"'#]*)["']/gi,
                  ),
                ].map((m) => new URL(m[1].replace(/&amp;/g, "&"), origin).href),
              ),
            ];
        const queryWords = input.query
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 2);
        links.sort(
          (a, b) =>
            queryWords.filter((w) => b.toLowerCase().includes(w)).length -
            queryWords.filter((w) => a.toLowerCase().includes(w)).length,
        );
        // Four page inspections per merchant leave room for a bounded second action.
        for (const link of links.slice(0, 4)) {
          input.signal?.throwIfAborted();
          const u = allowedUrl(link, [domain]);
          if (!robotsAllows(robots, u.pathname + u.search)) continue;
          await new Promise((resolve) => setTimeout(resolve, 400));
          const page = await safeGet(link, [domain]);
          sources.push(page.url);
          for (const product of productsFrom(page.body).slice(0, 1)) {
            const title = clean(product.name),
              category = categoryOf(title + " " + clean(product.category));
            if (category === "unknown" || category !== input.category) continue;
            const offers = Array.isArray(product.offers)
              ? product.offers
              : product.offers?.offers || [product.offers];
            const offer = offers.find((o) => o && typeof o === "object") || {};
            const currency = /^[A-Z]{3}$/.test(offer.priceCurrency)
              ? offer.priceCurrency
              : null;
            const rawPrice = String(offer.price ?? "");
            const priceDecimal =
              currency && /^\d{1,9}(\.\d{1,3})?$/.test(rawPrice)
                ? rawPrice
                : null;
            const imageRaw = Array.isArray(product.image)
              ? product.image[0]
              : product.image;
            let imageUrl = null;
            try {
              const v = new URL(
                typeof imageRaw === "object" ? imageRaw.url : imageRaw,
                origin,
              );
              if (
                v.protocol === "https:" &&
                !v.username &&
                !v.password &&
                [domain, "cdn.shopify.com"].includes(v.hostname) &&
                (!v.port || v.port === "443")
              )
                imageUrl = v.href;
            } catch {}
            const attrs = [
              { kind: "category", value: category },
              ...colours
                .filter((c) => new RegExp(`\\b${c}\\b`, "i").test(title))
                .map((value) => ({
                  kind: "colour",
                  value: value === "gray" ? "grey" : value,
                })),
              ...["striped", "solid", "plaid", "denim", "cotton", "fleece"]
                .filter((v) => new RegExp(`\\b${v}\\b`, "i").test(title))
                .map((value) => ({
                  kind: ["cotton", "denim", "fleece"].includes(value)
                    ? "material"
                    : "pattern",
                  value,
                })),
            ].map((a) => ({
              ...a,
              key: `${a.kind}:${a.value}`,
              source: "merchant",
              confidence: 1,
              evidence: `Product title: ${title}`,
            }));
            let canonical = new URL(page.url);
            if (offer.url) {
              const offered = allowedUrl(new URL(offer.url, origin).href, [
                domain,
              ]);
              if (
                offered.pathname.split("/products/")[1] ===
                  canonical.pathname.split("/products/")[1] &&
                robotsAllows(robots, offered.pathname + offered.search)
              )
                canonical = offered;
            }
            canonical.hash = "";
            const productKey = `${domain}:${clean(product.sku || product.productID) || canonical.pathname}${canonical.search}`;
            listings.push({
              id: randomUUID(),
              productKey,
              title,
              merchantDomain: domain,
              canonicalUrl: canonical.href,
              imageUrl,
              priceDecimal,
              currency,
              availability: /OutOfStock|SoldOut/i.test(offer.availability || "")
                ? "out_of_stock"
                : /InStock/i.test(offer.availability || "")
                  ? "in_stock"
                  : "unknown",
              checkedAt: new Date().toISOString(),
              attributes: attrs,
              sourceRunId: input.runId,
              verification: "verified",
              demo: false,
            });
          }
        }
        return { listings, sources, domain, error: null };
      } catch (e) {
        return {
          listings,
          sources,
          domain,
          error: String(e.message).slice(0, 160),
        };
      }
    }),
  );
  return {
    listings: results.flatMap((r) => r.listings),
    merchants: results.map(({ listings, ...r }) => ({
      ...r,
      count: listings.length,
    })),
    extraction: "public-product-jsonld-v1",
  };
}
if (process.argv[2]) {
  const input = JSON.parse(await readFile(process.argv[2], "utf8"));
  console.log(JSON.stringify(await discover(input)));
}

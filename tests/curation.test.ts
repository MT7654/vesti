import { test } from "node:test";
import assert from "node:assert/strict";
import { curate } from "../workers/discovery/curate.mjs";

const item = {
  id: "a",
  productKey: "shop.example:hoodie?variant=1",
  title: "  Everyday   hoodie  ",
  merchantDomain: "shop.example",
  canonicalUrl: "https://shop.example/products/hoodie?variant=1#details",
  attributes: [{ kind: "category", value: "hoodie", source: "merchant" }],
  priceDecimal: "58.99",
  currency: "USD",
  sourceRunId: "run-1",
  demo: false,
  verification: "verified",
};
const run = (listings: unknown[]) =>
  curate({
    listings,
    domains: ["shop.example"],
    category: "hoodie",
    runId: "run-1",
  });

test("sandbox curation removes duplicate offers while preserving variant prices", () => {
  const variant = {
    ...item,
    id: "b",
    productKey: "shop.example:hoodie?variant=2",
    canonicalUrl: "https://shop.example/products/hoodie?variant=2",
    priceDecimal: "65.00",
  };
  const result = run([item, { ...item, id: "duplicate" }, variant]);
  assert.equal(result.listings.length, 2);
  assert.deepEqual(
    result.listings.map((l) => l.priceDecimal),
    ["58.99", "65.00"],
  );
  assert.equal(result.listings[0].title, "Everyday hoodie");
  assert.equal(
    result.listings[0].canonicalUrl,
    "https://shop.example/products/hoodie?variant=1",
  );
  assert.deepEqual(result.audit.rejected, [
    { id: "duplicate", reason: "duplicate" },
  ]);
  assert.match(result.audit.inputSha256, /^[a-f0-9]{64}$/);
});

test("sandbox curation blocks wrong categories, provenance, hosts and incomplete prices", () => {
  const result = run([
    {
      ...item,
      attributes: [{ kind: "category", value: "jacket", source: "merchant" }],
    },
    { ...item, sourceRunId: "another-job" },
    { ...item, canonicalUrl: "https://evil.example/products/hoodie" },
    { ...item, currency: null },
    { ...item, demo: true },
  ]);
  assert.equal(result.listings.length, 0);
  assert.deepEqual(
    result.audit.rejected.map((r) => r.reason),
    [
      "different_category",
      "wrong_provenance",
      "unapproved_product_url",
      "invalid_price",
      "wrong_provenance",
    ],
  );
  assert.throws(() => run(Array(21).fill(item)), /at most 20/);
});

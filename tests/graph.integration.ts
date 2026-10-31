import assert from "node:assert/strict";
import {
  emptyEvidence,
  attribute,
  type Search,
  type Listing,
} from "../packages/contracts";
import { demoGarment } from "../packages/contracts/demo";
import {
  initGraph,
  saveAuth,
  saveSearch,
  ingest,
  rank,
  query,
  closeGraph,
} from "../packages/providers/graph";
const sessionId = crypto.randomUUID(),
  runId = crypto.randomUUID(),
  prefix = `integration-${crypto.randomUUID()}`;
try {
  await initGraph();
  await saveAuth(sessionId, prefix, "test", Date.now() + 60000);
  const search: Search = {
    schemaVersion: 1,
    id: runId,
    stage: "ranking",
    demo: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    selection: { click: { x: 0.5, y: 0.5 }, videoTime: 0, locale: "en-US" },
    garment: demoGarment(),
    recommendations: [],
    warnings: [],
    evidence: emptyEvidence(),
  };
  await saveSearch(sessionId, search);
  const listings: Listing[] = ["olive", "black"].map((colour, i) => ({
    id: `${prefix}-${i}`,
    productKey: `${prefix}-product-${i}`,
    title: `Test ${colour} jacket`,
    merchantDomain: "integration.example",
    canonicalUrl: `https://integration.example/products/${i}`,
    imageUrl: null,
    priceDecimal: "10.01",
    currency: "USD",
    availability: "unknown",
    checkedAt: new Date().toISOString(),
    attributes: [
      attribute("category", "jacket", "merchant", "Test product title"),
      attribute("colour", colour, "merchant", "Test product colour"),
    ],
    sourceRunId: runId,
    verification: "verified",
    demo: false,
  }));
  await ingest(sessionId, search, listings);
  await ingest(sessionId, search, listings);
  const first = await rank(sessionId, runId);
  assert.equal(first[0].id, listings[0].id);
  assert.equal(first.length, 2);
  assert.ok(first[0].score > first[1].score);
  const isolated = await rank(crypto.randomUUID(), runId);
  assert.equal(isolated.length, 0);
  const filtered = await rank(sessionId, runId, {
    currency: "USD",
    maxPrice: "10.00",
  });
  assert.equal(filtered.length, 0);
  await query(
    "MATCH (p:VestiProduct {id:$id})-[r:HAS_ATTRIBUTE]->(a:VestiAttribute {key:$key}) DELETE r",
    { id: listings[0].productKey, key: "colour:olive" },
  );
  const changed = await rank(sessionId, runId);
  assert.ok(
    changed.find((r) => r.id === listings[0].id)!.score < first[0].score,
  );
  assert.ok(
    !changed
      .find((r) => r.id === listings[0].id)!
      .reasons.some((r) => r.attributeKey === "colour:olive"),
  );
  console.log(
    "PASS: live Neo4j idempotent ingestion, relationship-driven ranking, price filters, explanations and session isolation.",
  );
} finally {
  await query(
    "MATCH (s:VestiSession {id:$sessionId})-[:HAS_RUN]->(r:VestiRun) OPTIONAL MATCH (r)-[:SELECTED]->(g:VestiGarment) DETACH DELETE s,r,g",
    { sessionId },
  );
  await query(
    "MATCH (n) WHERE (n:VestiProduct OR n:VestiListing) AND n.id STARTS WITH $prefix DETACH DELETE n",
    { prefix },
  );
  await closeGraph();
}

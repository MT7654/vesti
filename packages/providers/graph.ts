import neo4j from "neo4j-driver";
import { readFile } from "node:fs/promises";
import { config } from "../../apps/api/config";
import {
  decimalMinor,
  type Search,
  type Listing,
  type Filters,
  type Recommendation,
} from "../contracts";

const driver =
  config.NEO4J_URI && config.NEO4J_PASSWORD
    ? neo4j.driver(
        config.NEO4J_URI,
        neo4j.auth.basic(config.NEO4J_USERNAME, config.NEO4J_PASSWORD),
        {
          connectionTimeout: 8000,
          connectionAcquisitionTimeout: 8000,
          maxTransactionRetryTime: 0,
          disableLosslessIntegers: true,
        },
      )
    : null;
export async function query(
  cypher: string,
  params: Record<string, unknown> = {},
) {
  if (!driver) throw new Error("Neo4j is not configured.");
  const session = driver.session({ database: config.NEO4J_DATABASE });
  try {
    return await session.run(cypher, params, { timeout: 10000 });
  } finally {
    await session.close();
  }
}
export async function initGraph() {
  for (const label of [
    "Session",
    "Run",
    "Garment",
    "Listing",
    "Product",
    "Merchant",
    "Attribute",
    "Style",
  ]) {
    await query(
      `CREATE CONSTRAINT vesti_${label.toLowerCase()} IF NOT EXISTS FOR (n:Vesti${label}) REQUIRE n.${["Merchant", "Attribute", "Style"].includes(label) ? "key" : "id"} IS UNIQUE`,
    );
  }
  await query(
    "MATCH (r:VestiRun) WHERE r.stage IN ['created','identifying','discovering','ranking'] SET r.stage='failed', r.interrupted=true",
  );
}
export async function saveAuth(
  id: string,
  hash: string,
  origin: string,
  expires: number,
) {
  await query(
    "MERGE (s:VestiSession {id:$id}) SET s.tokenHash=$hash,s.origin=$origin,s.expires=$expires",
    { id, hash, origin, expires },
  );
}
export async function restoreAuth(hash: string) {
  const r = await query(
    "MATCH (s:VestiSession {tokenHash:$hash}) WHERE s.expires > $now RETURN s.id AS id,s.origin AS origin,s.expires AS expires",
    { hash, now: Date.now() },
  );
  return r.records[0]?.toObject() as
    { id: string; origin: string; expires: number } | undefined;
}
export async function saveSearch(sessionId: string, search: Search) {
  await query(
    "MERGE (s:VestiSession {id:$sessionId}) MERGE (r:VestiRun {id:$id}) MERGE (s)-[:HAS_RUN]->(r) SET r.stage=$stage,r.payload=$payload,r.createdAt=$createdAt,r.expires=$expires",
    {
      sessionId,
      id: search.id,
      stage: search.stage,
      payload: JSON.stringify(search),
      createdAt: search.createdAt,
      expires: Date.parse(search.createdAt) + 86400000,
    },
  );
}
export async function loadSearch(sessionId: string, id: string) {
  const r = await query(
    "MATCH (:VestiSession {id:$sessionId})-[:HAS_RUN]->(r:VestiRun {id:$id}) RETURN r.payload AS payload,r.interrupted AS interrupted",
    { sessionId, id },
  );
  if (!r.records.length) return null;
  const row = r.records[0],
    search = JSON.parse(row.get("payload")) as Search;
  if (row.get("interrupted")) {
    search.stage = "failed";
    search.error = {
      code: "RESTARTED",
      stage: "failed",
      retryable: true,
      message: "The API restarted during this search. Select again to retry.",
      requestId: id,
    };
  }
  return search;
}
export async function ingest(
  sessionId: string,
  search: Search,
  listings: Listing[],
) {
  if (!driver || !search.garment)
    throw new Error("Graph or garment unavailable.");
  const session = driver.session({ database: config.NEO4J_DATABASE });
  const g = search.garment;
  try {
    return await session.executeWrite(
      async (tx) => {
        await tx.run(
          "MATCH (s:VestiSession {id:$sessionId})-[:HAS_RUN]->(r:VestiRun {id:$runId}) MERGE (g:VestiGarment {id:$id}) MERGE (r)-[:SELECTED]->(g) MERGE (s)-[:SELECTED]->(g) SET g.category=$category",
          { sessionId, runId: search.id, id: g.id, category: g.category },
        );
        await tx.run(
          "MATCH (g:VestiGarment {id:$id}) OPTIONAL MATCH (g)-[old:HAS_ATTRIBUTE|IN_STYLE]->() DELETE old",
          { id: g.id },
        );
        for (const a of g.attributes) {
          const style = a.kind === "style",
            label = style ? "VestiStyle" : "VestiAttribute",
            rel = style ? "IN_STYLE" : "HAS_ATTRIBUTE";
          await tx.run(
            `MATCH (g:VestiGarment {id:$id}) MERGE (a:${label} {key:$key}) SET a.kind=$kind,a.value=$value MERGE (g)-[e:${rel}]->(a) SET e.confidence=$confidence,e.source=$source,e.evidence=$evidence`,
            { id: g.id, ...a },
          );
        }
        for (const l of listings) {
          await tx.run(
            "MATCH (r:VestiRun {id:$runId}) MERGE (l:VestiListing {id:$id}) SET l.payload=$payload,l.verification=$verification,l.availability=$availability,l.merchantDomain=$merchantDomain,l.currency=$currency,l.priceMinor=$priceMinor,l.checkedAt=$checkedAt,l.expires=$expires MERGE (r)-[:FOUND]->(l) MERGE (p:VestiProduct {id:$productKey}) MERGE (l)-[:OFFERS]->(p) MERGE (m:VestiMerchant {key:$merchantDomain}) MERGE (l)-[:SOLD_BY]->(m)",
            {
              ...l,
              runId: search.id,
              payload: JSON.stringify(l),
              priceMinor: l.priceDecimal
                ? neo4j.int(decimalMinor(l.priceDecimal).toString())
                : null,
              expires: Date.now() + 7 * 86400000,
            },
          );
          for (const a of l.attributes) {
            const style = a.kind === "style",
              label = style ? "VestiStyle" : "VestiAttribute",
              rel = style ? "IN_STYLE" : "HAS_ATTRIBUTE";
            await tx.run(
              `MATCH (p:VestiProduct {id:$productKey}) MERGE (a:${label} {key:$key}) SET a.kind=$kind,a.value=$value MERGE (p)-[e:${rel}]->(a) SET e.confidence=$confidence,e.source=$source,e.evidence=$evidence`,
              { productKey: l.productKey, ...a },
            );
          }
        }
        return {
          listings: listings.length,
          garmentAttributes: g.attributes.length,
        };
      },
      { timeout: 10000 },
    );
  } finally {
    await session.close();
  }
}
export async function rank(
  sessionId: string,
  runId: string,
  filters: Filters = {},
): Promise<Recommendation[]> {
  const cypher = await readFile(
    new URL("../../graph/rank-v1.cypher", import.meta.url),
    "utf8",
  );
  const result = await query(cypher, {
    sessionId,
    runId,
    category: filters.category || null,
    colour: filters.colour?.toLowerCase() || null,
    merchant: filters.merchant || null,
    currency: filters.currency || null,
    maxMinor: filters.maxPrice
      ? neo4j.int(decimalMinor(filters.maxPrice).toString())
      : null,
  });
  return result.records.map((row) => ({
    ...JSON.parse(row.get("payload")),
    score: row.get("score"),
    reasons: row.get("reasons"),
    components: Object.fromEntries(
      row
        .get("components")
        .map((c: { kind: string; overlap: number }) => [c.kind, c.overlap]),
    ),
    matchType: "similar",
    rankingVersion: "attribute-v1",
    overlayStatus: "unavailable",
  }));
}
export async function graphView(sessionId: string, runId: string) {
  const r = await query(
    "MATCH (:VestiSession {id:$sessionId})-[:HAS_RUN]->(r:VestiRun {id:$runId}) MATCH (r)-[e:FOUND|SELECTED|RECOMMENDS]->(n) RETURN r.id AS source,type(e) AS relationship,coalesce(n.id,n.key) AS target,labels(n)[0] AS label LIMIT 40",
    { sessionId, runId },
  );
  return r.records.map((r) => r.toObject());
}
export async function cleanupGraph() {
  await query(
    "MATCH (n) WHERE (n:VestiRun OR n:VestiSession) AND n.expires < $now DETACH DELETE n",
    { now: Date.now() },
  );
  await query(
    "MATCH (n:VestiGarment) WHERE NOT EXISTS { MATCH (:VestiRun)-[:SELECTED]->(n) } DETACH DELETE n",
  );
  await query(
    "MATCH (n:VestiListing) WHERE n.expires < $now AND NOT EXISTS { MATCH (:VestiRun)-[:FOUND]->(n) } DETACH DELETE n",
    { now: Date.now() },
  );
  await query(
    "MATCH (n) WHERE (n:VestiProduct OR n:VestiMerchant OR n:VestiAttribute OR n:VestiStyle) AND NOT EXISTS { MATCH (n)--() } DELETE n",
  );
}
export const closeGraph = () => driver?.close();

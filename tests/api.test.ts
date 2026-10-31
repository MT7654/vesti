import test from "node:test";
import assert from "node:assert/strict";
process.env.NEO4J_URI = "";
const { createApp } = await import("../apps/api/server");
const { closeGraph } = await import("../packages/providers/graph");
test("demo journey enforces ownership, idempotency, scoped single-use handoffs and asset access", async () => {
  let code = "";
  const app = await createApp((c) => {
    code = c;
  });
  const origin = "http://localhost:5173";
  const pair = async () => {
    const r = await app.inject({
      method: "POST",
      url: "/v1/pair",
      headers: { origin },
      payload: { code },
    });
    assert.equal(r.statusCode, 200, r.body);
    return r.json().token as string;
  };
  try {
    const a = await pair(),
      b = await pair(),
      headers = {
        origin,
        authorization: `Bearer ${a}`,
        "idempotency-key": "test-search-1",
      };
    const create = await app.inject({
      method: "POST",
      url: "/v1/searches",
      headers,
      payload: { demo: true },
    });
    assert.equal(create.statusCode, 202, create.body);
    const { id } = create.json();
    const again = await app.inject({
      method: "POST",
      url: "/v1/searches",
      headers,
      payload: { demo: true },
    });
    assert.equal(again.json().id, id);
    const get = await app.inject({
      method: "GET",
      url: `/v1/searches/${id}`,
      headers,
    });
    assert.equal(get.statusCode, 200);
    const search = get.json();
    assert.equal(search.stage, "completed");
    assert.equal(search.evidence.nosana.state, "not_started");
    assert.equal(search.recommendations.length, 3);
    const denied = await app.inject({
      method: "GET",
      url: `/v1/searches/${id}`,
      headers: { origin, authorization: `Bearer ${b}` },
    });
    assert.equal(denied.statusCode, 404);
    const originDenied = await app.inject({
      method: "GET",
      url: `/v1/searches/${id}`,
      headers: { origin: "https://evil.example", authorization: `Bearer ${a}` },
    });
    assert.equal(originDenied.statusCode, 403);
    const filtered = await app.inject({
      method: "POST",
      url: `/v1/searches/${id}/rank`,
      headers,
      payload: { currency: "USD", maxPrice: "80.00" },
    });
    assert.equal(filtered.json().recommendations.length, 1);
    const handoff = await app.inject({
      method: "POST",
      url: `/v1/searches/${id}/handoff`,
      headers,
      payload: { listingId: filtered.json().recommendations[0].id },
    });
    assert.equal(handoff.statusCode, 200, handoff.body);
    const code = new URLSearchParams(
      new URL(handoff.json().url).hash.slice(1),
    ).get("handoff");
    const exchange = await app.inject({
      method: "POST",
      url: "/v1/handoffs/exchange",
      headers: { origin },
      payload: { code },
    });
    assert.equal(exchange.statusCode, 200);
    const replay = await app.inject({
      method: "POST",
      url: "/v1/handoffs/exchange",
      headers: { origin },
      payload: { code },
    });
    assert.equal(replay.statusCode, 410);
    const fitHeaders = {
      origin,
      authorization: `Bearer ${exchange.json().token}`,
    };
    const fit = await app.inject({
      method: "GET",
      url: "/v1/fitting",
      headers: fitHeaders,
    });
    assert.equal(fit.statusCode, 200);
    assert.equal(fit.json().overlay.illustration, true);
    const image = await app.inject({
      method: "GET",
      url: "/v1/fitting/overlay",
      headers: fitHeaders,
    });
    assert.equal(image.statusCode, 200);
    assert.match(image.headers["content-type"] as string, /svg/);
    const wrongScope = await app.inject({
      method: "GET",
      url: `/v1/searches/${id}`,
      headers: fitHeaders,
    });
    assert.equal(wrongScope.statusCode, 401);
    const otherAsset = await app.inject({
      method: "GET",
      url: "/v1/listings/not-owned/overlay",
      headers: fitHeaders,
    });
    assert.equal(otherAsset.statusCode, 403);
  } finally {
    await app.close();
    await closeGraph();
  }
});

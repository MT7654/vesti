import test from "node:test";
import assert from "node:assert/strict";
import { contentRect, captureGeometry } from "../packages/contracts/geometry";
import {
  decimalMinor,
  filtersSchema,
  listingSchema,
  needsConfirmation,
  visionSchema,
} from "../packages/contracts";
import {
  demoGarment,
  demoListings,
  filterDemo,
} from "../packages/contracts/demo";

test("letterbox exclusion and screenshot scaling do not assume DPR", () => {
  const rect = contentRect(
    { x: 100, y: 100, width: 800, height: 600 },
    1920,
    1080,
  );
  assert.deepEqual(rect, { x: 100, y: 175, width: 800, height: 450 });
  const r = captureGeometry(
    rect,
    { x: 500, y: 400 },
    { width: 1200, height: 900 },
    { width: 1500, height: 1125 },
  );
  assert.deepEqual(r.click, { x: 0.5, y: 0.5 });
  assert.equal(r.crop.width, 1000);
  assert.throws(() =>
    captureGeometry(
      rect,
      { x: 400, y: 110 },
      { width: 1200, height: 900 },
      { width: 1500, height: 1125 },
    ),
  );
  assert.throws(() =>
    captureGeometry(
      { ...rect, y: -30 },
      { x: 500, y: 400 },
      { width: 1200, height: 900 },
      { width: 1200, height: 900 },
    ),
  );
});
test("zoom and unequal screenshot axes preserve normalized selection", () => {
  for (const zoom of [0.8, 1, 1.25])
    for (const scale of [1, 1.5, 2]) {
      const rect = { x: 10, y: 20, width: 800 * zoom, height: 450 * zoom };
      const r = captureGeometry(
        rect,
        { x: rect.x + rect.width * 0.7, y: rect.y + rect.height * 0.4 },
        { width: 1400, height: 900 },
        { width: 1400 * scale, height: 900 * scale },
      );
      assert.ok(Math.abs(r.click.x - 0.7) < 1e-9);
      assert.ok(Math.abs(r.click.y - 0.4) < 1e-9);
    }
});
test("money stays exact and filters require a currency", () => {
  assert.equal(decimalMinor("10.01"), 10010n);
  assert.equal(decimalMinor("0.001"), 1n);
  assert.ok(!filtersSchema.safeParse({ maxPrice: "10" }).success);
  assert.ok(
    !filtersSchema.safeParse({ maxPrice: "NaN", currency: "USD" }).success,
  );
  const row = demoListings("test")[0];
  assert.ok(!listingSchema.safeParse({ ...row, currency: null }).success);
  assert.equal(
    filterDemo(demoListings("test"), { currency: "USD", maxPrice: "80.00" })
      .length,
    1,
  );
});
test("invalid confidence and out-of-image boxes are rejected; wrong click is flagged as uncertain", () => {
  const g = demoGarment();
  assert.ok(!visionSchema.safeParse({ ...g, confidence: 1.1 }).success);
  assert.ok(
    !visionSchema.safeParse({
      ...g,
      box: { x: 0.9, y: 0, width: 0.4, height: 0.5 },
    }).success,
  );
  assert.equal(needsConfirmation(g, { x: 0.01, y: 0.01 }), true);
  assert.equal(needsConfirmation(g, { x: 0.5, y: 0.5 }), false);
});

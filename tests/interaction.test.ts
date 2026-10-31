import test from "node:test";
import assert from "node:assert/strict";
import { captureGeometry, selectionRect } from "../packages/contracts/geometry";
import { garmentTransform } from "../packages/contracts/fitting";
const bounds = { x: 100, y: 50, width: 800, height: 450 };
test("reverse drags clip to video and tiny clicks do not start searches", () => {
  assert.deepEqual(
    selectionRect({ x: 700, y: 400 }, { x: 50, y: 20 }, bounds),
    { x: 100, y: 50, width: 600, height: 350 },
  );
  assert.equal(
    selectionRect({ x: 200, y: 200 }, { x: 204, y: 203 }, bounds),
    null,
  );
});
test("drag capture maps only the selected area at HiDPI, with center-relative recognition", () => {
  const r = captureGeometry(
    bounds,
    { x: 0, y: 0 },
    { width: 1000, height: 600 },
    { width: 2000, height: 1200 },
    { x: 250, y: 100, width: 300, height: 350 },
  );
  assert.deepEqual(r.crop, { x: 500, y: 200, width: 600, height: 700 });
  assert.deepEqual(r.click, { x: 0.5, y: 0.5 });
  assert.throws(() =>
    captureGeometry(
      bounds,
      { x: 0, y: 0 },
      { width: 1000, height: 600 },
      { width: 2000, height: 1200 },
      { x: 0, y: 0, width: 300, height: 350 },
    ),
  );
});
test("garment fitting keeps shoulders aligned and bounds extreme torso stretching", () => {
  const points = [
    { x: 720, y: 200 },
    { x: 280, y: 200 },
    { x: 650, y: 1700 },
    { x: 350, y: 1700 },
  ];
  const m = garmentTransform(points, 1000, 1000);
  assert.ok(Math.abs(m.a - 1) < 1e-9);
  assert.ok(Math.abs(m.d - 1.22) < 1e-9);
  assert.ok(Math.abs(m.a * 280 + m.c * 180 + m.e - 280) < 0.001);
  assert.ok(Math.abs(m.b * 280 + m.d * 180 + m.f - 200) < 0.001);
  const shifted = garmentTransform(points, 1000, 1000, undefined, 1, 0.1, 900);
  assert.equal(shifted.f - m.f, 90);
});

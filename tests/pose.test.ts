import test from "node:test";
import assert from "node:assert/strict";
import { torsoFrame } from "../packages/contracts/pose";
const p = (x:number,y:number,visibility=1) => ({x,y,z:0,visibility});
test("visible shoulders keep the overlay when hips are outside the frame", () => {
  const points = Array.from({length:33}, () => p(0,0,0));
  points[11]=p(.7,.4); points[12]=p(.3,.4);
  points[23]=p(.6,1.4); points[24]=p(.4,1.4);
  const fit=torsoFrame(points,4/3);
  assert.equal(fit.estimated,true);
  assert.equal(fit.points[0].x,.7);
  assert.ok(fit.points[2].y>1); // Canvas clips naturally; hips need not be visible.
});
test("missing pose uses a finite adjustable placement instead of hiding clothing", () => {
  const fit=torsoFrame(undefined,4/3);
  assert.equal(fit.estimated,true);
  assert.equal(fit.points.length,4);
  assert.ok(fit.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
});
test("reliable torso keeps measured hip placement", () => {
  const points = Array.from({length:33}, () => p(0,0,0));
  points[11]=p(.7,.3); points[12]=p(.3,.3);
  points[23]=p(.6,.8); points[24]=p(.4,.8);
  const fit=torsoFrame(points,4/3);
  assert.equal(fit.estimated,false);
  assert.equal(fit.points[2].y,.8);
});

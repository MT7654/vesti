type Point = { x: number; y: number; z: number; visibility: number };
const point = (x: number, y: number): Point => ({
  x,
  y,
  z: 0,
  visibility: 0.5,
});
const visible = (p?: Point) =>
  !!p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  p.visibility > 0.45 &&
  p.x >= 0 &&
  p.x <= 1 &&
  p.y >= 0 &&
  p.y <= 1;
export function torsoFrame(p: Point[] | undefined, aspect: number) {
  let left = p?.[11],
    right = p?.[12];
  let estimated = true;
  if (
    !visible(left) ||
    !visible(right) ||
    Math.abs(left!.x - right!.x) < 0.06
  ) {
    const nose = p?.[0];
    const cx = visible(nose) ? nose!.x : 0.5;
    const cy = visible(nose) ? Math.min(0.7, nose!.y + 0.19) : 0.35;
    left = point(cx + 0.18, cy);
    right = point(cx - 0.18, cy);
  }
  const cx = (left!.x + right!.x) / 2,
    cy = (left!.y + right!.y) / 2;
  const height = Math.max(
    0.2,
    Math.min(
      1.2,
      Math.hypot((left!.x - right!.x) * aspect, left!.y - right!.y) * 1.5,
    ),
  );
  let hips = [point(cx + 0.12, cy + height), point(cx - 0.12, cy + height)];
  if (
    visible(p?.[11]) &&
    visible(p?.[12]) &&
    visible(p?.[23]) &&
    visible(p?.[24]) &&
    (p![23].y + p![24].y) / 2 > cy + 0.1
  ) {
    hips = [p![23], p![24]];
    estimated = false;
  }
  return { points: [left!, right!, ...hips], estimated };
}

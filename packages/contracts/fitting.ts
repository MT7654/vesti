/** Pure fitting geometry. Width follows shoulders; length is bounded to avoid rubber-sheet stretching. */
export type FitPoint = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};
export type GarmentAnchors = {
  leftShoulder: number[];
  rightShoulder: number[];
  hem: number[];
};
export const defaultAnchors: GarmentAnchors = {
  leftShoulder: [0.28, 0.18],
  rightShoulder: [0.72, 0.18],
  hem: [0.5, 0.91],
};
export function garmentTransform(
  points: FitPoint[],
  width: number,
  height: number,
  anchors = defaultAnchors,
  scale = 1,
  offset = 0,
  frameHeight = 1,
) {
  const left = points[1],
    right = points[0];
  const cx = (left.x + right.x) / 2,
    cy = (left.y + right.y) / 2;
  const sourceX =
    ((anchors.leftShoulder[0] + anchors.rightShoulder[0]) / 2) * width;
  const sourceY =
    ((anchors.leftShoulder[1] + anchors.rightShoulder[1]) / 2) * height;
  const sourceWidth = Math.max(
    1,
    (anchors.rightShoulder[0] - anchors.leftShoulder[0]) * width,
  );
  const sourceHeight = Math.max(1, anchors.hem[1] * height - sourceY);
  const dx = right.x - left.x,
    dy = right.y - left.y;
  const shoulder = Math.max(1, Math.hypot(dx, dy));
  const sx = (shoulder / sourceWidth) * scale;
  const hx = (points[2].x + points[3].x) / 2 - cx,
    hy = (points[2].y + points[3].y) / 2 - cy;
  const torso = Math.max(1, Math.hypot(hx, hy));
  const sy = Math.max(
    sx * 0.78,
    Math.min(sx * 1.22, (torso / sourceHeight) * scale),
  );
  // Limit lean independently so noisy hips cannot collapse or shear the image.
  const lean = Math.max(-0.2, Math.min(0.2, hx / torso));
  const a = (dx / shoulder) * sx,
    b = (dy / shoulder) * sx,
    c = (-dy / shoulder + lean) * sy,
    d = (dx / shoulder) * sy;
  return {
    a,
    b,
    c,
    d,
    e: cx - a * sourceX - c * sourceY,
    f: cy - b * sourceX - d * sourceY + offset * frameHeight,
  };
}

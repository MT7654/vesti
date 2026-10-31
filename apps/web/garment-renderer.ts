import {
  garmentTransform,
  type FitPoint,
  type GarmentAnchors,
} from "../../packages/contracts/fitting";
type Point = { x: number; y: number };
type Matrix = ReturnType<typeof garmentTransform>;
const map = (m: Matrix, p: Point) => ({
  x: m.a * p.x + m.c * p.y + m.e,
  y: m.b * p.x + m.d * p.y + m.f,
});
const reliable = (p?: FitPoint) =>
  !!p &&
  (p.visibility ?? 0) > 0.7 &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y);
/** AI cutouts do not always obey the requested anchors. Locate the first broad
 * shoulder row below the collar/hood using its actual alpha silhouette. */
export function cutoutAnchors(
  image: HTMLImageElement,
): GarmentAnchors | undefined {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, 128, 128);
  const rgba = ctx.getImageData(0, 0, 128, 128).data;
  const rows = Array.from({ length: 128 }, (_, y) => {
    let left = 128,
      right = -1;
    for (let x = 0; x < 128; x++)
      if (rgba[(y * 128 + x) * 4 + 3] > 160) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    return { left, right, width: Math.max(0, right - left) };
  });
  const widest = Math.max(...rows.slice(8, 100).map((r) => r.width));
  const y = rows.findIndex(
    (r, y) => y >= 10 && y < 65 && r.width >= widest * 0.72,
  );
  let hem = rows.length - 1;
  while (hem >= 0 && rows[hem].width <= 10) hem--;
  if (y < 0 || widest < 20 || hem <= y + 15) return;
  const r = rows[y],
    inset = r.width * 0.08;
  return {
    leftShoulder: [(r.left + inset) / 128, y / 128],
    rightShoulder: [(r.right - inset) / 128, y / 128],
    hem: [0.5, hem / 128],
  };
}
/** Cutout-derived sleeve tips, computed once per image, never from camera pixels. */
export function sleeveTips(image: HTMLImageElement): Point[] {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, 128, 128);
  const rgba = ctx.getImageData(0, 0, 128, 128).data;
  return [false, true].map((right) => {
    let sx = 0,
      sy = 0,
      n = 0;
    for (let y = 38; y < 116; y++)
      for (let x = 0; x < 128; x++) {
        if ((right ? x > 103 : x < 24) && rgba[(y * 128 + x) * 4 + 3] > 180) {
          sx += x;
          sy += y;
          n++;
        }
      }
    return {
      x: ((n ? sx / n : right ? 115 : 13) / 128) * image.width,
      y: ((n ? sy / n : 78) / 128) * image.height,
    };
  });
}
function triangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  s: Point[],
  d: Point[],
) {
  const [p, q, r] = s,
    [u, v, w] = d;
  const det = (q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y);
  if (Math.abs(det) < 0.001) return;
  const a = ((v.x - u.x) * (r.y - p.y) - (w.x - u.x) * (q.y - p.y)) / det;
  const c = ((w.x - u.x) * (q.x - p.x) - (v.x - u.x) * (r.x - p.x)) / det;
  const b = ((v.y - u.y) * (r.y - p.y) - (w.y - u.y) * (q.y - p.y)) / det;
  const f = ((w.y - u.y) * (q.x - p.x) - (v.y - u.y) * (r.x - p.x)) / det;
  ctx.save();
  ctx.beginPath();
  // Sub-pixel expansion avoids light seams between adjacent texture triangles.
  const center = { x: (u.x + v.x + w.x) / 3, y: (u.y + v.y + w.y) / 3 };
  d.forEach((p, i) => {
    const dx = p.x - center.x,
      dy = p.y - center.y,
      l = Math.max(1, Math.hypot(dx, dy));
    const x = p.x + (dx / l) * 0.35,
      y = p.y + (dy / l) * 0.35;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, f, u.x - a * p.x - c * p.y, u.y - b * p.x - f * p.y);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}
export function drawGarment(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  torso: FitPoint[],
  pose: FitPoint[] | undefined,
  options: {
    anchors?: GarmentAnchors;
    scale: number;
    offset: number;
    width: number;
    height: number;
    followArms: boolean;
    tips: Point[];
    shortSleeves: boolean;
  },
) {
  const { width, height } = options;
  const points = torso.map((p) => ({ ...p, x: p.x * width, y: p.y * height }));
  const m = garmentTransform(
    points,
    img.width,
    img.height,
    options.anchors,
    options.scale,
    options.offset,
    height,
  );
  const shoulder = Math.hypot(
    points[0].x - points[1].x,
    points[0].y - points[1].y,
  );
  const shifts = options.tips.map((tip, i) => {
    const shoulderPoint = pose?.[i === 0 ? 12 : 11],
      elbow = pose?.[i === 0 ? 14 : 13],
      wrist = pose?.[i === 0 ? 16 : 15];
    if (
      !options.followArms ||
      !reliable(shoulderPoint) ||
      !reliable(elbow) ||
      (!options.shortSleeves && !reliable(wrist))
    )
      return { x: 0, y: 0 };
    // Skip arms crossing the torso: a flat cutout cannot model that depth ordering.
    if (
      (i === 0 && elbow!.x > (points[0].x + points[1].x) / 2 / width) ||
      (i === 1 && elbow!.x < (points[0].x + points[1].x) / 2 / width)
    )
      return { x: 0, y: 0 };
    const target = options.shortSleeves
      ? {
          x: (shoulderPoint!.x + elbow!.x) / 2,
          y: (shoulderPoint!.y + elbow!.y) / 2,
        }
      : wrist!;
    const base = map(m, tip),
      dx = target.x * width - base.x,
      dy = target.y * height - base.y;
    const limit = Math.min(
      1,
      (shoulder * 0.42) / Math.max(1, Math.hypot(dx, dy)),
    );
    return { x: dx * limit, y: dy * limit };
  });
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (shifts.every((s) => s.x === 0 && s.y === 0)) {
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.drawImage(img, 0, 0);
  } else {
    const cols = 8,
      rows = 6;
    const vertex = (x: number, y: number) => {
      const s = { x: (x / cols) * img.width, y: (y / rows) * img.height },
        d = map(m, s);
      shifts.forEach((shift, i) => {
        const edge =
          i === 0
            ? Math.max(0, (0.32 - s.x / img.width) / 0.32)
            : Math.max(0, (s.x / img.width - 0.68) / 0.32);
        const vertical = Math.max(
          0,
          Math.min(1, (s.y / img.height - 0.16) / 0.3),
        );
        d.x += shift.x * edge * vertical;
        d.y += shift.y * edge * vertical;
      });
      return { s, d };
    };
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const a = vertex(x, y),
          b = vertex(x + 1, y),
          c = vertex(x, y + 1),
          d = vertex(x + 1, y + 1);
        triangle(ctx, img, [a.s, b.s, c.s], [a.d, b.d, c.d]);
        triangle(ctx, img, [b.s, d.s, c.s], [b.d, d.d, c.d]);
      }
  }
  ctx.restore();
}
/** Restore just the visible hand region when its depth is in front of the torso. */
export function drawForegroundHands(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  pose: FitPoint[] | undefined,
  width: number,
  height: number,
) {
  if (!pose) return;
  // Keep the user's face in front of high collars/hoods. This is a local,
  // conservative face ellipse, not person segmentation or cloth simulation.
  const nose = pose[0],
    leftEar = pose[7],
    rightEar = pose[8];
  if ([nose, leftEar, rightEar].every(reliable)) {
    const span = Math.hypot(
      (leftEar.x - rightEar.x) * width,
      (leftEar.y - rightEar.y) * height,
    );
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
      nose.x * width,
      nose.y * height - span * 0.16,
      span * 0.62,
      span * 0.91,
      0,
      0,
      Math.PI * 2,
    );
    ctx.clip();
    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();
  }
  const shoulderWidth =
    Math.abs((pose[11]?.x ?? 0) - (pose[12]?.x ?? 0)) * width;
  for (const ids of [
    [15, 17, 19, 21, 11],
    [16, 18, 20, 22, 12],
  ]) {
    const [w, p, i, t, s] = ids.map((id) => pose[id]);
    if (![w, p, i, t, s].every(reliable) || (w.z ?? 0) > (s.z ?? 0) + 0.04)
      continue;
    const cx = ((w.x + p.x + i.x + t.x) / 4) * width,
      cy = ((w.y + p.y + i.y + t.y) / 4) * height;
    const radius = Math.min(
      shoulderWidth * 0.16,
      Math.max(8, Math.hypot((w.x - i.x) * width, (w.y - i.y) * height) * 0.64),
    );
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      radius * 0.78,
      radius,
      Math.atan2((i.y - w.y) * height, (i.x - w.x) * width) - Math.PI / 2,
      0,
      Math.PI * 2,
    );
    ctx.clip();
    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();
  }
}

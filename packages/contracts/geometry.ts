export type Rect = { x: number; y: number; width: number; height: number };
/** A drag in either direction, clipped to the visible video. */
export function selectionRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
  bounds: Rect,
): Rect | null {
  const clampX = (x: number) =>
    Math.max(bounds.x, Math.min(bounds.x + bounds.width, x));
  const clampY = (y: number) =>
    Math.max(bounds.y, Math.min(bounds.y + bounds.height, y));
  const x = Math.min(clampX(start.x), clampX(end.x)),
    y = Math.min(clampY(start.y), clampY(end.y));
  const width = Math.abs(clampX(end.x) - clampX(start.x)),
    height = Math.abs(clampY(end.y) - clampY(start.y));
  return width >= 20 && height >= 20 ? { x, y, width, height } : null;
}
export function contentRect(
  rect: Rect,
  videoWidth: number,
  videoHeight: number,
): Rect {
  if (
    videoWidth <= 0 ||
    videoHeight <= 0 ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    throw new Error("Video is not ready");
  const scale = Math.min(rect.width / videoWidth, rect.height / videoHeight);
  const width = videoWidth * scale,
    height = videoHeight * scale;
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  };
}
export function captureGeometry(
  rect: Rect,
  point: { x: number; y: number },
  viewport: { width: number; height: number },
  bitmap: { width: number; height: number },
  selection?: Rect,
) {
  if (selection) {
    if (
      ![selection.x, selection.y, selection.width, selection.height].every(
        Number.isFinite,
      ) ||
      selection.width < 20 ||
      selection.height < 20 ||
      selection.x < rect.x ||
      selection.y < rect.y ||
      selection.x + selection.width > rect.x + rect.width + 0.01 ||
      selection.y + selection.height > rect.y + rect.height + 0.01
    )
      throw new Error("Select a rectangle inside the video.");
    rect = selection;
    point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }
  if (
    rect.x < -1 ||
    rect.y < -1 ||
    rect.x + rect.width > viewport.width + 1 ||
    rect.y + rect.height > viewport.height + 1
  )
    throw new Error("Move the whole video into view and select again.");
  const click = {
    x: (point.x - rect.x) / rect.width,
    y: (point.y - rect.y) / rect.height,
  };
  if (click.x < 0 || click.x > 1 || click.y < 0 || click.y > 1)
    throw new Error(
      "Select clothing inside the video, away from the black bars.",
    );
  const sx = bitmap.width / viewport.width,
    sy = bitmap.height / viewport.height;
  return {
    crop: {
      x: rect.x * sx,
      y: rect.y * sy,
      width: rect.width * sx,
      height: rect.height * sy,
    },
    click,
  };
}

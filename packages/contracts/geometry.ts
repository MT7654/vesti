export type Rect = { x: number; y: number; width: number; height: number };
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
) {
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

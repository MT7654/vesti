import {
  contentRect,
  selectionRect,
  type Rect,
} from "../../packages/contracts/geometry";
declare global {
  interface Window {
    __vestiCleanup?: () => void;
  }
}
window.__vestiCleanup?.();
let overlay: HTMLDivElement | null = null,
  video: HTMLVideoElement | null = null;
let capturing = false,
  layoutFrame = 0,
  playerStyles: HTMLStyleElement | null = null;
let point = { x: 0, y: 0 },
  startPoint: typeof point | null = null;
let suppressMenuUntil = 0,
  menuBounds: Rect | null = null;
let record: {
  token: string;
  url: string;
  rect: Rect;
  viewport: { width: number; height: number };
  time: number;
  src: string;
  playing: boolean;
  changed: boolean;
} | null = null;
function videoRect() {
  if (!video) throw new Error("Video unavailable");
  const b = video.getBoundingClientRect();
  return contentRect(
    { x: b.x, y: b.y, width: b.width, height: b.height },
    video.videoWidth,
    video.videoHeight,
  );
}
function contains(b: Rect, p: typeof point) {
  return (
    p.x >= b.x && p.y >= b.y && p.x <= b.x + b.width && p.y <= b.y + b.height
  );
}
function removeOverlay() {
  overlay?.remove();
  overlay = null;
  cancelAnimationFrame(layoutFrame);
  startPoint = null;
}
function playbackChanged() {
  if (record) record.changed = true;
}
function release() {
  playerStyles?.remove();
  playerStyles = null;
  if (record && video) {
    video.removeEventListener("play", playbackChanged);
    video.removeEventListener("seeking", playbackChanged);
    if (
      record.playing &&
      !record.changed &&
      video.paused &&
      Math.abs(video.currentTime - record.time) < 0.15 &&
      location.href === record.url
    )
      void video.play().catch(() => {});
  }
  record = null;
  capturing = false;
}
function cancel() {
  removeOverlay();
  release();
  void chrome.runtime
    .sendMessage({ type: "SELECTION_CANCELLED" })
    .catch(() => {});
}
function freeze() {
  if (!video || record) return;
  const playing = !video.paused;
  video.pause();
  record = {
    token: crypto.randomUUID(),
    url: location.href,
    rect: videoRect(),
    viewport: { width: innerWidth, height: innerHeight },
    time: video.currentTime,
    src: video.currentSrc,
    playing,
    changed: false,
  };
  video.addEventListener("play", playbackChanged);
  video.addEventListener("seeking", playbackChanged);
}
function valid() {
  if (!record || !video) return false;
  const b = videoRect();
  return (
    record.url === location.href &&
    record.src === video.currentSrc &&
    !record.changed &&
    video.paused &&
    Math.abs(video.currentTime - record.time) < 0.15 &&
    innerWidth === record.viewport.width &&
    innerHeight === record.viewport.height &&
    (["x", "y", "width", "height"] as const).every(
      (k) => Math.abs(b[k] - record!.rect[k]) < 1,
    )
  );
}
async function capture(selection: Rect) {
  if (capturing || !video) return;
  freeze();
  if (!valid()) {
    cancel();
    return;
  }
  capturing = true;
  removeOverlay();
  playerStyles = document.createElement("style");
  playerStyles.textContent =
    ".html5-video-player .ytp-chrome-bottom,.html5-video-player .ytp-chrome-top,.html5-video-player .ytp-pause-overlay,.html5-video-player .ytp-large-play-button { visibility:hidden!important; }";
  document.documentElement.append(playerStyles);
  try {
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    await chrome.runtime.sendMessage({
      type: "CAPTURE",
      ...record,
      selection,
      point: {
        x: selection.x + selection.width / 2,
        y: selection.y + selection.height / 2,
      },
      videoId: new URL(location.href).searchParams.get("v"),
    });
  } catch (e) {
    await chrome.storage.session.set({
      captureError: (e as Error).message,
      selecting: false,
    });
  } finally {
    release();
  }
}
function contextMenu(e: MouseEvent) {
  const p = { x: e.clientX, y: e.clientY };
  if (
    (overlay && contains(videoRect(), p)) ||
    (performance.now() < suppressMenuUntil &&
      menuBounds &&
      contains(menuBounds, p))
  ) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}
document.addEventListener("contextmenu", contextMenu, true);
function start() {
  removeOverlay();
  release();
  if (location.hostname !== "www.youtube.com" || location.pathname !== "/watch")
    throw new Error("Open an ordinary YouTube watch page first.");
  if (document.fullscreenElement)
    throw new Error("Exit fullscreen before selecting a garment.");
  video = document.querySelector("video");
  if (!video?.videoWidth)
    throw new Error("Wait for the YouTube video to load.");
  const rect = videoRect();
  point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  overlay = document.createElement("div");
  overlay.tabIndex = 0;
  overlay.setAttribute("role", "application");
  overlay.setAttribute(
    "aria-label",
    "Hold right mouse button and drag around clothing. Release to search. Keyboard: arrows move, Enter sets first corner, arrows resize, Enter searches. Escape cancels.",
  );
  Object.assign(overlay.style, {
    position: "fixed",
    zIndex: "2147483647",
    cursor: "crosshair",
    outline: "none",
    overflow: "hidden",
    touchAction: "none",
    userSelect: "none",
  });
  const box = document.createElement("div");
  Object.assign(box.style, {
    position: "fixed",
    border: "2px solid #e1ff75",
    borderRadius: "12px",
    boxShadow: "0 0 0 9999px #19142666",
    pointerEvents: "none",
    display: "none",
    boxSizing: "border-box",
  });
  for (const [top, left] of [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ]) {
    const corner = document.createElement("span");
    Object.assign(corner.style, {
      position: "absolute",
      width: "22px",
      height: "22px",
      borderColor: "#e1ff75",
      borderStyle: "solid",
      borderWidth: `${top ? 4 : 0}px ${left ? 0 : 4}px ${top ? 0 : 4}px ${left ? 4 : 0}px`,
      top: top ? "-2px" : "auto",
      bottom: top ? "auto" : "-2px",
      left: left ? "-2px" : "auto",
      right: left ? "auto" : "-2px",
      borderRadius: "3px",
    });
    box.append(corner);
  }
  const label = document.createElement("div");
  label.textContent =
    "VESTI · Right-click + drag around clothing · Release to search · Esc to cancel";
  Object.assign(label.style, {
    position: "absolute",
    top: "14px",
    left: "14px",
    right: "14px",
    width: "fit-content",
    padding: "12px 16px",
    background: "#211c34ed",
    color: "#fff",
    font: "13px system-ui",
    borderRadius: "12px",
    pointerEvents: "none",
  });
  const crosshair = document.createElement("div");
  crosshair.textContent = "+";
  Object.assign(crosshair.style, {
    position: "fixed",
    font: "28px monospace",
    color: "white",
    textShadow: "0 1px 4px black",
    transform: "translate(-50%,-50%)",
    pointerEvents: "none",
  });
  overlay.append(box, label, crosshair);
  document.documentElement.append(overlay);
  overlay.focus();
  function layout() {
    if (!overlay) return;
    if (!video?.isConnected || (record && !valid())) {
      cancel();
      return;
    }
    const b = videoRect();
    Object.assign(overlay.style, {
      left: `${b.x}px`,
      top: `${b.y}px`,
      width: `${b.width}px`,
      height: `${b.height}px`,
    });
    Object.assign(crosshair.style, {
      left: `${point.x}px`,
      top: `${point.y}px`,
    });
    const selection = startPoint && selectionRect(startPoint, point, b);
    box.style.display = selection ? "block" : "none";
    if (selection)
      Object.assign(box.style, {
        left: `${selection.x}px`,
        top: `${selection.y}px`,
        width: `${selection.width}px`,
        height: `${selection.height}px`,
      });
    layoutFrame = requestAnimationFrame(layout);
  }
  layout();
  overlay.addEventListener("pointerdown", (e) => {
    if (e.button !== 2 && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    point = { x: e.clientX, y: e.clientY };
    startPoint = { ...point };
    freeze();
    overlay!.setPointerCapture(e.pointerId);
    label.textContent = "Frame the garment. Release to find similar pieces.";
  });
  overlay.addEventListener("pointermove", (e) => {
    point = { x: e.clientX, y: e.clientY };
  });
  overlay.addEventListener("pointerup", (e) => {
    if (!startPoint) return;
    e.preventDefault();
    e.stopPropagation();
    point = { x: e.clientX, y: e.clientY };
    const b = videoRect(),
      selection = selectionRect(startPoint, point, b);
    menuBounds = b;
    suppressMenuUntil = performance.now() + 1200;
    startPoint = null;
    if (selection) void capture(selection);
    else {
      release();
      label.textContent =
        "Drag a larger rectangle around the garment. Esc to cancel.";
    }
  });
  overlay.addEventListener("pointercancel", cancel);
  overlay.addEventListener("lostpointercapture", () => {
    if (startPoint) cancel();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cancel();
    else if (e.key === "Enter") {
      if (!startPoint) {
        startPoint = { ...point };
        freeze();
        label.textContent =
          "Move to the opposite corner with arrows, then press Enter.";
      } else {
        const selection = selectionRect(startPoint, point, videoRect());
        if (selection) void capture(selection);
      }
    } else if (e.key.startsWith("Arrow")) {
      const b = videoRect(),
        d = e.shiftKey ? 2 : 12;
      point.x = Math.max(
        b.x,
        Math.min(
          b.x + b.width,
          point.x +
            (e.key === "ArrowRight" ? d : e.key === "ArrowLeft" ? -d : 0),
        ),
      );
      point.y = Math.max(
        b.y,
        Math.min(
          b.y + b.height,
          point.y + (e.key === "ArrowDown" ? d : e.key === "ArrowUp" ? -d : 0),
        ),
      );
    } else return;
    e.preventDefault();
    e.stopPropagation();
  });
}
const listener = (
  message: { type: string; token?: string },
  _sender: chrome.runtime.MessageSender,
  reply: (value: unknown) => void,
) => {
  if (message.type === "SELECT") {
    try {
      start();
      reply({ ok: true });
    } catch (e) {
      reply({ error: (e as Error).message });
    }
  }
  if (message.type === "VERIFY_CAPTURE") {
    let verified = false;
    try {
      verified = !!record && message.token === record.token && valid();
    } catch {}
    reply({ valid: verified });
  }
  if (message.type === "RELEASE_CAPTURE") {
    release();
    reply({ ok: true });
  }
};
function leave() {
  if (overlay || record) cancel();
}
function hidden() {
  if (document.hidden) leave();
}
window.addEventListener("blur", leave);
document.addEventListener("visibilitychange", hidden);
chrome.runtime.onMessage.addListener(listener);
window.__vestiCleanup = () => {
  removeOverlay();
  release();
  document.removeEventListener("contextmenu", contextMenu, true);
  window.removeEventListener("blur", leave);
  document.removeEventListener("visibilitychange", hidden);
  chrome.runtime.onMessage.removeListener(listener);
};

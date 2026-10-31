import { contentRect, type Rect } from "../../packages/contracts/geometry";
declare global {
  interface Window {
    __vestiCleanup?: () => void;
  }
}
window.__vestiCleanup?.();
let overlay: HTMLDivElement | null = null,
  marker: HTMLDivElement | null = null;
let video: HTMLVideoElement | null = null,
  point = { x: 0, y: 0 },
  capturing = false;
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
let layoutFrame = 0;
let playerStyles: HTMLStyleElement | null = null;
function videoRect() {
  if (!video) throw new Error("Video unavailable");
  const b = video.getBoundingClientRect();
  return contentRect(
    { x: b.x, y: b.y, width: b.width, height: b.height },
    video.videoWidth,
    video.videoHeight,
  );
}
function removeOverlay() {
  overlay?.remove();
  overlay = null;
  marker = null;
  cancelAnimationFrame(layoutFrame);
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
async function select(x: number, y: number) {
  if (capturing || !video) return;
  const rect = videoRect();
  if (
    x < rect.x ||
    y < rect.y ||
    x > rect.x + rect.width ||
    y > rect.y + rect.height
  )
    return;
  capturing = true;
  const playing = !video.paused;
  video.pause();
  removeOverlay();
  playerStyles = document.createElement("style");
  playerStyles.textContent =
    ".html5-video-player .ytp-chrome-bottom,.html5-video-player .ytp-chrome-top,.html5-video-player .ytp-pause-overlay,.html5-video-player .ytp-large-play-button { visibility:hidden!important; }";
  document.documentElement.append(playerStyles);
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );
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
  try {
    await chrome.runtime.sendMessage({
      type: "CAPTURE",
      ...record,
      point: { x, y },
      videoId: new URL(location.href).searchParams.get("v"),
    });
  } finally {
    release();
  }
}
function start() {
  removeOverlay();
  if (location.hostname !== "www.youtube.com" || location.pathname !== "/watch")
    throw new Error("Open an ordinary YouTube watch page first.");
  if (document.fullscreenElement)
    throw new Error("Exit fullscreen before selecting a garment.");
  video = document.querySelector("video");
  if (!video || !video.videoWidth)
    throw new Error("Wait for the YouTube video to load.");
  const rect = videoRect();
  point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  overlay = document.createElement("div");
  overlay.tabIndex = 0;
  overlay.setAttribute("role", "application");
  overlay.setAttribute(
    "aria-label",
    "Select clothing. Arrow keys move the crosshair. Enter selects. Escape cancels.",
  );
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    cursor: "crosshair",
    outline: "none",
    background: "rgba(0,0,0,.04)",
  });
  const border = document.createElement("div");
  Object.assign(border.style, {
    position: "fixed",
    border: "2px solid #d3efb3",
    borderRadius: "8px",
    boxSizing: "border-box",
    pointerEvents: "none",
  });
  const label = document.createElement("div");
  label.textContent =
    "VESTI · Point to clothing · Click or right-click to discover · Esc to cancel";
  Object.assign(label.style, {
    position: "fixed",
    padding: "12px 18px",
    background: "#244c3d",
    color: "white",
    font: "14px system-ui",
    borderRadius: "8px",
    pointerEvents: "none",
  });
  marker = document.createElement("div");
  marker.textContent = "+";
  Object.assign(marker.style, {
    position: "fixed",
    font: "32px monospace",
    color: "#fff",
    textShadow: "0 0 4px #000",
    transform: "translate(-50%,-50%)",
    pointerEvents: "none",
  });
  overlay.append(border, label, marker);
  document.documentElement.append(overlay);
  overlay.focus();
  function layout() {
    if (!overlay) return;
    const b = videoRect();
    Object.assign(border.style, {
      left: `${b.x}px`,
      top: `${b.y}px`,
      width: `${b.width}px`,
      height: `${b.height}px`,
    });
    Object.assign(label.style, {
      left: `${Math.max(8, b.x + 10)}px`,
      top: `${Math.max(8, b.y + 10)}px`,
    });
    if (marker)
      Object.assign(marker.style, {
        left: `${point.x}px`,
        top: `${point.y}px`,
      });
    layoutFrame = requestAnimationFrame(layout);
  }
  layout();
  overlay.addEventListener("pointermove", (e) => {
    point = { x: e.clientX, y: e.clientY };
  });
  overlay.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    showActions(e.clientX, e.clientY);
  });
  overlay.addEventListener("contextmenu", (e) => {
    if (e.shiftKey) {
      removeOverlay();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    showActions(e.clientX, e.clientY);
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      removeOverlay();
      void chrome.runtime.sendMessage({ type: "SELECTION_CANCELLED" });
    } else if (e.key === "Enter") {
      void select(point.x, point.y);
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
    }
    e.preventDefault();
  });
}
function showActions(x: number, y: number) {
  if (!overlay || capturing) return;
  const b = videoRect();
  if (x < b.x || y < b.y || x > b.x + b.width || y > b.y + b.height) return;
  overlay.querySelector("[data-vesti-actions]")?.remove();
  const menu = document.createElement("div");
  menu.dataset.vestiActions = "true";
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", "Discover this garment");
  Object.assign(menu.style, {
    position: "fixed",
    left: `${Math.max(8, Math.min(x + 12, innerWidth - 280))}px`,
    top: `${Math.max(8, Math.min(y + 12, innerHeight - 145))}px`,
    width: "260px",
    padding: "16px",
    borderRadius: "16px",
    background: "#211c34",
    color: "#fff",
    boxShadow: "0 12px 45px #0005",
    font: "14px system-ui",
    cursor: "default",
  });
  const title = document.createElement("strong");
  title.textContent = "Vesti · This caught your eye?";
  const note = document.createElement("p");
  note.textContent = "Find similar clothing, then preview the style.";
  note.style.cssText =
    "font-size:12px;line-height:1.5;color:#d6cdec;margin:8px 0 12px";
  const find = document.createElement("button");
  find.textContent = "Find similar →";
  find.style.cssText =
    "background:#d9ff75;color:#211c34;border:0;border-radius:8px;padding:10px 16px;font:600 13px system-ui;cursor:pointer";
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Close garment actions");
  close.style.cssText =
    "background:transparent;color:white;border:0;font:24px system-ui;cursor:pointer;margin-left:16px";
  find.onclick = () => void select(x, y);
  close.onclick = () => {
    menu.remove();
    overlay?.focus();
  };
  menu.addEventListener("click", (e) => e.stopPropagation());
  menu.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      menu.remove();
      overlay?.focus();
    }
  });
  menu.append(title, note, find, close);
  overlay.append(menu);
  find.focus();
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
    let valid = false;
    try {
      const b = videoRect();
      valid =
        !!record &&
        message.token === record.token &&
        record.url === location.href &&
        record.src === video?.currentSrc &&
        !record.changed &&
        video.paused &&
        Math.abs(video.currentTime - record.time) < 0.15 &&
        innerWidth === record.viewport.width &&
        innerHeight === record.viewport.height &&
        (["x", "y", "width", "height"] as const).every(
          (k) => Math.abs(b[k] - record!.rect[k]) < 1,
        );
    } catch {}
    reply({ valid });
  }
  if (message.type === "RELEASE_CAPTURE") {
    release();
    reply({ ok: true });
  }
};
chrome.runtime.onMessage.addListener(listener);
window.__vestiCleanup = () => {
  removeOverlay();
  release();
  chrome.runtime.onMessage.removeListener(listener);
};

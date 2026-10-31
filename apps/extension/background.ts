import { captureGeometry } from "../../packages/contracts/geometry";
import { imageDataBlob } from "../../packages/contracts/image";
const captureGeneration = new Map<number, number>();
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.url || change.status === "loading")
    captureGeneration.set(id, (captureGeneration.get(id) || 0) + 1);
});
async function notifyError(message: string) {
  await chrome.storage.session.set({ captureError: message, selecting: false });
}
async function activate(tab: chrome.tabs.Tab) {
  if (!tab.id) return;
  await chrome.storage.session.set({ videoTabId: tab.id });
  if (!/^https:\/\/www\.youtube\.com\/watch\?/.test(tab.url || ""))
    return notifyError(
      "Open a YouTube watch page, then click the Vesti toolbar icon.",
    );
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
  const { consent } = await chrome.storage.local.get("consent");
  if (consent) await select(tab.id);
}
async function select(tabId: number) {
  const result = await chrome.tabs.sendMessage(tabId, { type: "SELECT" });
  if (result?.error) throw new Error(result.error);
  await chrome.storage.session.set({ captureError: null, selecting: true });
}
chrome.action.onClicked.addListener((tab) => {
  // Invoke while the action's user gesture is still active, before any await.
  if (tab.id) void chrome.sidePanel.open({ tabId: tab.id });
  void activate(tab).catch((e) => notifyError(e.message));
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.type === "SELECT_AGAIN") {
    void (async () => {
      const { videoTabId } = await chrome.storage.session.get("videoTabId");
      const [active] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      if (!active?.id || active.id !== videoTabId)
        throw new Error(
          "Return to the selected YouTube tab and click the Vesti icon.",
        );
      await select(videoTabId);
      return { ok: true };
    })()
      .then(reply)
      .catch((e) => reply({ error: e.message }));
    return true;
  }
  if (message.type === "SELECTION_CANCELLED") {
    void chrome.storage.session.set({ selecting: false });
    reply({ ok: true });
    return;
  }
  if (message.type !== "CAPTURE" || !sender.tab?.id) return;
  const tab = sender.tab,
    tabId = tab.id!;
  void (async () => {
    const generation = captureGeneration.get(tabId) || 0;
    async function verify() {
      const [active] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      const current = await chrome.tabs.get(tabId);
      if (
        active?.id !== tabId ||
        current.url !== message.url ||
        current.windowId !== tab.windowId ||
        (captureGeneration.get(tabId) || 0) !== generation
      )
        throw new Error(
          "The video or active tab changed. Select the garment again.",
        );
      const result = await chrome.tabs.sendMessage(tabId, {
        type: "VERIFY_CAPTURE",
        token: message.token,
      });
      if (!result.valid)
        throw new Error("The video moved during capture. Select again.");
    }
    await verify();
    let screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });
    await verify();
    const bitmap = await createImageBitmap(imageDataBlob(screenshot));
    screenshot = "";
    try {
      const { crop, click } = captureGeometry(
        message.rect,
        message.point,
        message.viewport,
        { width: bitmap.width, height: bitmap.height },
      );
      const ratio = Math.min(1, 1280 / Math.max(crop.width, crop.height));
      const canvas = new OffscreenCanvas(
        Math.round(crop.width * ratio),
        Math.round(crop.height * ratio),
      );
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(
        bitmap,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let min = 255,
        max = 0;
      for (let i = 0; i < pixels.length; i += 80) {
        min = Math.min(min, pixels[i]);
        max = Math.max(max, pixels[i]);
      }
      if (max - min < 8)
        throw new Error(
          "This frame is blank or protected. Try another moment in the video.",
        );
      const blob = await canvas.convertToBlob({
        type: "image/jpeg",
        quality: 0.85,
      });
      if (blob.size > 2 * 1024 * 1024)
        throw new Error("Selected frame is too large.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      await chrome.storage.session.set({
        crop: {
          dataUrl: `data:image/jpeg;base64,${btoa(binary)}`,
          selection: {
            click,
            videoId: message.videoId,
            videoTime: message.time,
            locale: navigator.language,
          },
          capturedAt: Date.now(),
        },
        captureError: null,
        selecting: false,
      });
      return { ok: true };
    } finally {
      bitmap.close();
    }
  })()
    .then(reply)
    .catch(async (e) => {
      await notifyError(
        `Capture failed: ${e.message}. Reload the extension and refresh this YouTube tab.`,
      );
      reply({ error: e.message });
    })
    .finally(() =>
      chrome.tabs
        .sendMessage(tabId, { type: "RELEASE_CAPTURE" })
        .catch(() => {}),
    );
  return true;
});

import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["apps/extension/content.ts"],
  bundle: true,
  write: false,
  format: "iife",
});
function fixture() {
  class Element extends EventTarget {
    style: Record<string, unknown> = {};
    children: Element[] = [];
    removed = false;
    textContent = "";
    tabIndex = 0;
    append(...items: Element[]) {
      this.children.push(...items);
    }
    remove() {
      this.removed = true;
    }
    setAttribute() {}
    focus() {}
    setPointerCapture() {}
  }
  const root = new Element(),
    doc = new Element();
  const video = Object.assign(new Element(), {
    videoWidth: 800,
    videoHeight: 450,
    paused: false,
    currentTime: 12,
    currentSrc: "fixture",
    isConnected: true,
    pause() {
      this.paused = true;
    },
    async play() {
      this.paused = false;
    },
    getBoundingClientRect() {
      return { x: 100, y: 50, width: 800, height: 450 };
    },
  });
  const captures: Record<string, any>[] = [];
  let listener: any;
  const raf = new Map<number, FrameRequestCallback>();
  let id = 0;
  const window = new Element();
  runInNewContext(bundle.outputFiles[0].text, {
    window,
    document: Object.assign(doc, {
      documentElement: root,
      fullscreenElement: null,
      hidden: false,
      querySelector: () => video,
      createElement: () => new Element(),
    }),
    location: {
      hostname: "www.youtube.com",
      pathname: "/watch",
      href: "https://www.youtube.com/watch?v=abcdefghijk",
    },
    innerWidth: 1100,
    innerHeight: 650,
    URL,
    crypto,
    performance,
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      raf.set(++id, cb);
      return id;
    },
    cancelAnimationFrame: (n: number) => raf.delete(n),
    chrome: {
      runtime: {
        onMessage: {
          addListener: (l: any) => (listener = l),
          removeListener() {},
        },
        sendMessage: async (m: any) => {
          captures.push(m);
          return { ok: true };
        },
      },
      storage: { session: { set: async () => {} } },
    },
  });
  listener({ type: "SELECT" }, {}, (r: any) => assert.equal(r.ok, true));
  const overlay = root.children[0];
  function pointer(type: string, x: number, y: number) {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, { clientX: x, clientY: y, button: 2, pointerId: 1 });
    overlay.dispatchEvent(e);
  }
  async function flush() {
    for (let i = 0; i < 4; i++) {
      const items = [...raf.entries()];
      raf.clear();
      for (const [, cb] of items) cb(performance.now());
      await Promise.resolve();
    }
  }
  return { overlay, video, captures, pointer, flush, doc };
}
test("right-button release captures the dragged region automatically and restores playback", async () => {
  const f = fixture();
  f.pointer("pointerdown", 250, 100);
  assert.equal(f.video.paused, true);
  f.pointer("pointermove", 550, 400);
  f.pointer("pointerup", 550, 400);
  await f.flush();
  const calls = f.captures.filter((m) => m.type === "CAPTURE");
  assert.equal(calls.length, 1);
  assert.equal(
    JSON.stringify(calls[0].selection),
    JSON.stringify({ x: 250, y: 100, width: 300, height: 300 }),
  );
  assert.equal(f.video.paused, false);
  assert.equal(f.overlay.removed, true);
});
test("Escape during a drag cancels without recognition and restores playback", async () => {
  const f = fixture();
  f.pointer("pointerdown", 250, 100);
  const e = new Event("keydown", { cancelable: true });
  Object.assign(e, { key: "Escape" });
  f.overlay.dispatchEvent(e);
  await f.flush();
  assert.equal(
    f.captures.some((m) => m.type === "CAPTURE"),
    false,
  );
  assert.equal(f.video.paused, false);
  assert.equal(f.overlay.removed, true);
});
test("tiny right-clicks do not search and the context menu outside the video remains available", async () => {
  const f = fixture();
  f.pointer("pointerdown", 250, 100);
  f.pointer("pointerup", 253, 104);
  await f.flush();
  assert.equal(
    f.captures.some((m) => m.type === "CAPTURE"),
    false,
  );
  assert.equal(f.video.paused, false);
  const outside = new Event("contextmenu", { cancelable: true });
  Object.assign(outside, { clientX: 20, clientY: 20 });
  f.doc.dispatchEvent(outside);
  assert.equal(outside.defaultPrevented, false);
});

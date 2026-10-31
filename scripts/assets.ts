import { cp, mkdir, writeFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
const dir = "apps/web/public/mediapipe";
await mkdir(dir, { recursive: true });
await cp("node_modules/@mediapipe/tasks-vision/wasm", `${dir}/wasm`, {
  recursive: true,
});
const modelPath = `${dir}/pose_landmarker_lite.task`;
if (!(await stat(modelPath).catch(() => null))) {
  const url =
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`Model download HTTP ${r.status}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  await writeFile(modelPath, bytes);
  await writeFile(
    `${dir}/MODEL_SOURCE.json`,
    JSON.stringify(
      {
        url,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        note: "Model hosted by Google for MediaPipe. Downloaded at build time; camera execution is entirely local.",
      },
      null,
      2,
    ),
  );
}
console.log("Local MediaPipe WASM and pose model ready.");

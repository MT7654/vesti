import { test } from "node:test";
import assert from "node:assert/strict";
import { imageDataBlob } from "../packages/contracts/image";
test("capture data is decoded locally without fetching a URL", async () => {
  const blob = imageDataBlob("data:image/png;base64,AQID");
  assert.equal(blob.type, "image/png");
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [1, 2, 3]);
  assert.throws(
    () => imageDataBlob("https://example.com/photo.png"),
    /Invalid/,
  );
});

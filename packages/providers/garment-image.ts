import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { config } from "../../apps/api/config";
import { safeGet } from "../../workers/discovery/network.mjs";
import type { Recommendation } from "../contracts";

const pending = new Map<string, Promise<Buffer>>();
let active = 0;
export async function garmentImage(listing: Recommendation): Promise<Buffer> {
  if (!listing.imageUrl || listing.demo)
    throw new Error("No real product image available");
  const key = createHash("sha256").update(listing.imageUrl).digest("hex");
  const file = `.runtime/garments/${key}.png`;
  try {
    return await readFile(file);
  } catch {}
  const previous = pending.get(key);
  if (previous) return previous;
  if (active >= 2)
    throw new Error(
      "Two garment previews are being prepared. Please retry shortly.",
    );
  const work = (async () => {
    active++;
    try {
      if (!config.OPENAI_API_KEY)
        throw new Error("OpenAI is required to extract the product garment");
      const source = await safeGet(listing.imageUrl!, [
        new URL(listing.imageUrl!).hostname,
      ]);
      const input = await sharp(source.bytes, { limitInputPixels: 20000000 })
        .rotate()
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      const form = new FormData();
      form.set("model", "gpt-image-1.5");
      form.set(
        "image",
        new Blob([new Uint8Array(input)], { type: "image/png" }),
        "product.png",
      );
      form.set("background", "transparent");
      form.set("output_format", "png");
      form.set("size", "1024x1024");
      form.set("quality", "medium");
      form.set(
        "prompt",
        "Extract ONLY the upper-body garment in this product photo as a front-facing flat clothing cutout on a truly transparent background. Preserve its actual colour, print, logo, fabric details, collar, sleeves, buttons and design as closely as possible. Remove the person, mannequin, hanger, scenery, labels and all other clothing. Do not invent a different garment. Center the full garment with sleeves relaxed downwards, collar near 8% height, shoulder joints near x=28% and x=72%, y=18%, and hem near 91% height. No shadows or text outside the garment.",
      );
      const response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(150000),
      });
      if (!response.ok)
        throw new Error(
          `Product garment extraction failed (OpenAI HTTP ${response.status}). No illustration was substituted.`,
        );
      const result = (await response.json()) as {
        data?: { b64_json?: string }[];
      };
      if (!result.data?.[0]?.b64_json)
        throw new Error("No garment image returned");
      const bytes = await sharp(Buffer.from(result.data[0].b64_json, "base64"))
        .resize(768, 768)
        .png()
        .toBuffer();
      const meta = await sharp(bytes).metadata();
      const stats = await sharp(bytes).stats();
      if (!meta.hasAlpha || stats.channels[3].min === 255)
        throw new Error("Garment extraction did not return transparency");
      await mkdir(".runtime/garments", { recursive: true });
      await writeFile(file, bytes);
      await writeFile(
        file.replace(/\.png$/, ".json"),
        JSON.stringify(
          {
            sourceUrl: listing.imageUrl,
            model: "gpt-image-1.5",
            requestId: response.headers.get("x-request-id"),
            createdAt: new Date().toISOString(),
            method: "AI extraction; details may differ",
          },
          null,
          2,
        ),
      );
      return bytes;
    } finally {
      active--;
      pending.delete(key);
    }
  })();
  pending.set(key, work);
  return work;
}

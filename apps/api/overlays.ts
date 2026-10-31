import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Recommendation } from "../../packages/contracts";
import { garmentImage } from "../../packages/providers/garment-image";

const assetSchema = z.object({
  productKey: z.string(),
  file: z.string().regex(/^[\w.-]+\.(png|webp)$/),
  sourceUrl: z.string().url(),
  accessBasis: z.string().min(8),
  method: z.string().min(3),
  anchors: z.object({
    leftShoulder: z.tuple([z.number(), z.number()]),
    rightShoulder: z.tuple([z.number(), z.number()]),
    hem: z.tuple([z.number(), z.number()]),
  }),
});
export async function overlayFor(listing: Recommendation, illustrate = false) {
  if (listing.demo)
    return {
      status: "ready" as const,
      illustration: true,
      method: "Original SVG demo illustration",
      anchors: {
        leftShoulder: [0.28, 0.18],
        rightShoulder: [0.72, 0.18],
        hem: [0.5, 0.91],
      },
    };
  const assets = z
    .array(assetSchema)
    .parse(JSON.parse(await readFile("assets/garments/index.json", "utf8")));
  const asset = assets.find((a) => a.productKey === listing.productKey);
  if (!asset && listing.imageUrl)
    return {
      status: "ready" as const,
      illustration: false,
      aiExtracted: true,
      method: "AI garment extraction from the selected merchant photo",
      sourceUrl: listing.imageUrl,
      anchors: {
        leftShoulder: [0.28, 0.18],
        rightShoulder: [0.72, 0.18],
        hem: [0.5, 0.91],
      },
    };
  return asset
    ? { status: "ready" as const, illustration: false, ...asset }
    : { status: "unavailable" as const };
}
export async function overlayBytes(
  listing: Recommendation,
  illustrate = false,
) {
  if (listing.demo) {
    const category =
      listing.attributes.find((a) => a.kind === "category")?.value || "jacket";
    const colour = listing.attributes.find((a) => a.kind === "colour")?.value;
    return {
      type: "image/svg+xml",
      bytes: Buffer.from(
        garmentSvg(
          category,
          colour === "sand"
            ? "#c7b99c"
            : colour === "black"
              ? "#303331"
              : "#687357",
        ),
      ),
    };
  }
  const asset = await overlayFor(listing);
  if (asset.status === "ready" && "aiExtracted" in asset)
    return { type: "image/png", bytes: await garmentImage(listing) };
  if (asset.status !== "ready" || !("file" in asset))
    throw new Error("Preview unavailable");
  return {
    type: asset.file.endsWith(".png") ? "image/png" : "image/webp",
    bytes: await readFile(path.resolve("assets/garments", asset.file)),
  };
}
export function garmentSvg(category = "jacket", colour = "#687357") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="560" viewBox="0 0 480 560"><defs><linearGradient id="fabric"><stop stop-color="${colour}"/><stop offset="1" stop-color="${colour}" stop-opacity=".88"/></linearGradient></defs><path d="M174 53 Q240 92 306 53 L346 87 ${category === "tshirt" ? "421 153 370 226 341 196" : "437 427 366 453 337 225"} L340 510 Q240 533 140 510 L143 225 ${category === "tshirt" ? "110 226 59 153" : "114 453 43 427"} L134 87Z" fill="url(#fabric)" stroke="#293c2e" stroke-width="3"/>${category === "hoodie" ? '<path d="M174 53 Q163 1 240 4 Q317 1 306 53 L270 107 210 107Z" fill="' + colour + '" stroke="#293c2e" stroke-width="3"/><path d="M185 383 L295 383 316 464 164 464Z" fill="none" stroke="#293c2e" stroke-opacity=".5" stroke-width="3"/>' : category === "jacket" ? '<path d="M174 53 L240 97 210 145 165 75 M306 53 L240 97 270 145 315 75" fill="#899174" stroke="#293c2e" stroke-width="2"/><path d="M240 97V519 M159 204H216V277H159Z M265 204H322V277H265Z" fill="none" stroke="#293c2e" stroke-width="3"/><g fill="#c8cbb6"><circle cx="247" cy="181" r="3"/><circle cx="247" cy="261" r="3"/><circle cx="247" cy="341" r="3"/><circle cx="247" cy="421" r="3"/></g>' : '<path d="M174 53 Q240 140 306 53" fill="none" stroke="#293c2e" stroke-width="9"/>'}<path d="M145 495Q240 516 335 495" fill="none" stroke="#293c2e" stroke-opacity=".4" stroke-width="2"/></svg>`;
}

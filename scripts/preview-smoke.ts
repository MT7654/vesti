import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { garmentImage } from "../packages/providers/garment-image";
const fixtures = JSON.parse(
  await readFile("docs/verification/merchant-adapters.json", "utf8"),
);
const listing = fixtures.listings.find((l: { imageUrl: string }) =>
  l.imageUrl?.includes("Front"),
);
const start = Date.now();
try {
  const bytes = await garmentImage(listing);
  await writeFile(".runtime/product-preview.png", bytes);
  const metadata = await sharp(bytes).metadata();
  const report = {
    ok: true,
    durationMs: Date.now() - start,
    source: listing.imageUrl,
    width: metadata.width,
    height: metadata.height,
    hasAlpha: metadata.hasAlpha,
    bytes: bytes.length,
  };
  await writeFile(
    "docs/verification/product-preview.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}

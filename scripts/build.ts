import { build as viteBuild } from "vite";
import "dotenv/config";
import { build } from "esbuild";
import { mkdir, copyFile, writeFile, readFile } from "node:fs/promises";
import "./assets";
await viteBuild({ configFile: "apps/web/vite.config.ts" });
await viteBuild({ configFile: "apps/extension/vite.config.ts" });
await mkdir("dist/extension", { recursive: true });
await build({
  entryPoints: ["apps/extension/background.ts"],
  outfile: "dist/extension/background.js",
  bundle: true,
  format: "esm",
  target: "chrome120",
  minify: true,
});
await build({
  entryPoints: ["apps/extension/content.ts"],
  outfile: "dist/extension/content.js",
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: true,
});
await copyFile("apps/extension/manifest.json", "dist/extension/manifest.json");
// Extension assets are self-contained. No .env or server module enters this build.
const manifest = JSON.parse(
  await readFile("dist/extension/manifest.json", "utf8"),
);
if (process.env.VITE_API_BASE_URL) {
  const api = new URL(process.env.VITE_API_BASE_URL);
  if (
    api.protocol !== "https:" ||
    api.username ||
    api.password ||
    api.pathname !== "/" ||
    api.search ||
    api.hash
  )
    throw new Error("VITE_API_BASE_URL must be a bare HTTPS origin");
  manifest.host_permissions.push(`${api.origin}/*`);
  manifest.content_security_policy.extension_pages =
    manifest.content_security_policy.extension_pages.replace(
      "connect-src ",
      `connect-src ${api.origin} `,
    );
}
await writeFile(
  "dist/extension/manifest.json",
  JSON.stringify(manifest, null, 2),
);
console.log("Built web app and loadable Chrome extension in dist/.");

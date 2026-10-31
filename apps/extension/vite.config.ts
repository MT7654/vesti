import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "node:path";
export default defineConfig({
  root: path.resolve("apps/extension"),
  envDir: path.resolve("."),
  base: "./",
  plugins: [react(), tailwind()],
  build: {
    outDir: path.resolve("dist/extension"),
    emptyOutDir: true,
    rollupOptions: { input: path.resolve("apps/extension/sidepanel.html") },
  },
});

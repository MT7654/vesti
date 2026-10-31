import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "node:path";
export default defineConfig({
  root: path.resolve("apps/web"),
  envDir: path.resolve("."),
  plugins: [react(), tailwind()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/v1": "http://127.0.0.1:3001",
      "/health": "http://127.0.0.1:3001",
    },
  },
  build: { outDir: path.resolve("dist/web"), emptyOutDir: true },
});

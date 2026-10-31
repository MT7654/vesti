import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["--import", "tsx", "apps/api/index.ts"], {
    stdio: "inherit",
  }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--config", "apps/web/vite.config.ts"],
    { stdio: "inherit" },
  ),
];
for (const s of ["SIGINT", "SIGTERM"] as const)
  process.on(s, () => {
    for (const p of children) p.kill();
    process.exit();
  });
for (const p of children)
  p.on("exit", (code) => {
    if (code) {
      for (const c of children) c.kill();
      process.exit(code);
    }
  });

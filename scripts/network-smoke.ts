import "dotenv/config";
import { Daytona } from "@daytona/sdk";
const d = new Daytona({
  apiKey: process.env.DAYTONA_API_KEY,
  apiUrl: process.env.DAYTONA_API_URL,
});
const s = await d.create(
  {
    language: "javascript",
    networkBlockAll: false,
    domainAllowList: "example.com,shop.spacex.com",
    autoStopInterval: 2,
    autoDeleteInterval: 0,
    ttlMinutes: 2,
    labels: { app: "vesti", run: "network-check" },
  },
  { timeout: 30 },
);
try {
  const source = `for(const url of ['https://example.com','https://shop.spacex.com/robots.txt']){try{const r=await fetch(url,{signal:AbortSignal.timeout(8000)});console.log(JSON.stringify({url,status:r.status,proxyConfigured:!!process.env.HTTPS_PROXY}));}catch(e){console.log(JSON.stringify({url,error:e.message,cause:e.cause?.code,proxyConfigured:!!process.env.HTTPS_PROXY}));}}`;
  await s.fs.uploadFile(Buffer.from(source), "/tmp/check.mjs");
  const r = await s.process.executeCommand(
    "node /tmp/check.mjs",
    undefined,
    undefined,
    20,
  );
  console.log(r.result);
} finally {
  await d.delete(s, 15);
}

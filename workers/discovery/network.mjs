import https from "node:https";
import { resolve4 } from "node:dns/promises";
import { isIP } from "node:net";

export function publicAddress(ip) {
  if (isIP(ip) !== 4) return false;
  const [a, b] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 198 ||
    (a === 203 && b === 0)
  );
}
export function allowedUrl(value, domains) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    isIP(u.hostname) ||
    !domains.includes(u.hostname)
  )
    throw new Error("Destination outside approved HTTPS hosts");
  return u;
}
// Resolve and pin the socket to the checked public IP. Redirects are checked afresh.
export async function safeGet(value, domains, redirects = 0) {
  if (redirects > 3) throw new Error("Too many redirects");
  const u = allowedUrl(value, domains),
    addresses = await resolve4(u.hostname);
  if (!addresses.length || !addresses.every(publicAddress))
    throw new Error("Private or mixed DNS answer blocked");
  const result = await new Promise((resolve, reject) => {
    const req = https.get(
      u,
      {
        lookup: (_host, opts, cb) =>
          opts.all
            ? cb(
                null,
                addresses.map((address) => ({ address, family: 4 })),
              )
            : cb(null, addresses[0], 4),
        headers: {
          "User-Agent": "VestiHackathon/0.1 (personal shopping research)",
          Accept: "text/html,application/json,text/plain",
        },
        timeout: 6500,
      },
      (res) => {
        let size = 0;
        const chunks = [];
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) {
            res.destroy();
            reject(new Error("Response too large"));
          } else chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
            bytes: Buffer.concat(chunks),
            url: u.href,
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Merchant timed out")));
    req.on("error", reject);
  });
  if (result.status >= 300 && result.status < 400 && result.headers.location)
    return safeGet(
      new URL(result.headers.location, u).href,
      domains,
      redirects + 1,
    );
  if (result.status !== 200) throw new Error(`Merchant HTTP ${result.status}`);
  if (
    /<title[^>]*>[^<]*(captcha|access denied|just a moment)|verify you are human|cf-chl-/i.test(
      result.body.slice(0, 30000),
    )
  )
    throw new Error("Merchant blocked automated access");
  return result;
}
export function robotsAllows(text, path) {
  let active = false;
  const rules = [];
  for (const raw of text.split("\n")) {
    const line = raw.split("#")[0].trim(),
      colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).toLowerCase(),
      value = line.slice(colon + 1).trim();
    if (key === "user-agent")
      active = value === "*" || value.toLowerCase().includes("vesti");
    if (active && ["allow", "disallow"].includes(key) && value) {
      const pattern = value
        .split("*")
        .map((s) => s.replace(/[.+?^{}()|[\]\\]/g, "\\$&"))
        .join(".*")
        .replace(/\$$/, "$");
      if (new RegExp("^" + pattern).test(path))
        rules.push({ allow: key === "allow", length: value.length });
    }
  }
  return (
    rules.sort(
      (a, b) => b.length - a.length || Number(b.allow) - Number(a.allow),
    )[0]?.allow ?? true
  );
}

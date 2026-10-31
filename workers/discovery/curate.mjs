import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

// Fixed, dependency-free policy executed in Daytona. No network or generated code.
export function curate({ listings, domains, category, runId }) {
  if (!Array.isArray(listings) || listings.length > 20)
    throw new Error("Expected at most 20 candidate listings");
  const accepted = [],
    rejected = [],
    seen = new Set();
  for (const item of listings) {
    let reason;
    try {
      const url = new URL(item.canonicalUrl);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        (url.port && url.port !== "443") ||
        !domains.includes(url.hostname) ||
        url.hostname !== item.merchantDomain ||
        url.pathname === "/"
      )
        reason = "unapproved_product_url";
      else if (
        item.demo ||
        item.verification !== "verified" ||
        item.sourceRunId !== runId
      )
        reason = "wrong_provenance";
      else if (
        !item.attributes.some(
          (a) =>
            a.kind === "category" &&
            a.value === category &&
            a.source === "merchant",
        )
      )
        reason = "different_category";
      else if (
        item.priceDecimal !== null &&
        (!/^\d{1,9}(\.\d{1,3})?$/.test(item.priceDecimal) ||
          !/^[A-Z]{3}$/.test(item.currency || ""))
      )
        reason = "invalid_price";
      else {
        url.hash = "";
        // Keep offer/variant query parameters: different variants can have different prices.
        const key = url.href;
        if (seen.has(key) || seen.has(item.productKey)) reason = "duplicate";
        else {
          seen.add(key);
          seen.add(item.productKey);
          accepted.push({
            ...item,
            canonicalUrl: url.href,
            title: item.title.trim().replace(/\s+/g, " "),
          });
        }
      }
    } catch {
      reason = "invalid_product";
    }
    if (reason) rejected.push({ id: item?.id || null, reason });
  }
  return {
    listings: accepted,
    audit: {
      policy: "candidate-curation-v1",
      inputCount: listings.length,
      acceptedCount: accepted.length,
      rejected,
      inputSha256: createHash("sha256")
        .update(JSON.stringify(listings))
        .digest("hex"),
      outputSha256: createHash("sha256")
        .update(JSON.stringify(accepted))
        .digest("hex"),
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(
    JSON.stringify(curate(JSON.parse(await readFile(process.argv[2], "utf8")))),
  );

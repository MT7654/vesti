import "dotenv/config";
import { z } from "zod";

const env = z
  .object({
    HOST: z.enum(["127.0.0.1", "localhost", "::1", "0.0.0.0"]).default("127.0.0.1"),
    PORT: z.coerce.number().default(3001),
    NOSANA_BASE_URL: z.string().default(""),
    NOSANA_VISION_MODEL: z.string().default(""),
    NOSANA_AGENT_MODEL: z.string().default(""),
    NOSANA_DEPLOYMENT_ID: z.string().default(""),
    NOSANA_ENDPOINT_TOKEN: z.string().default(""),
    OPENAI_API_KEY: z.string().default(process.env.OpenAI_API_Key || ""),
    OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
    LIVE_PROVIDER: z.enum(["auto", "openai", "sponsors"]).default("auto"),
    DAYTONA_API_KEY: z.string().default(""),
    DAYTONA_API_URL: z.string().default("https://app.daytona.io/api"),
    DAYTONA_TARGET: z.string().default(""),
    DAYTONA_SNAPSHOT: z.string().default(""),
    NEO4J_URI: z.string().default(""),
    NEO4J_USERNAME: z.string().default("neo4j"),
    NEO4J_PASSWORD: z.string().default(""),
    NEO4J_DATABASE: z.string().default("neo4j"),
    ALLOWED_ORIGINS: z.string().default(""),
    MERCHANT_ALLOWED_DOMAINS: z.string().default(""),
    SEARCH_TIMEOUT_MS: z.coerce.number().min(1000).max(180000).default(90000),
    MAX_CONCURRENT_SEARCHES: z.coerce.number().min(1).max(2).default(2),
    WEB_ORIGIN: z.string().default("http://localhost:5173"),
  })
  .parse(process.env);
export const config = {
  ...env,
  useOpenAI:
    env.LIVE_PROVIDER === "openai" ||
    (env.LIVE_PROVIDER === "auto" && !!env.OPENAI_API_KEY),
  NOSANA_BASE_URL: env.NOSANA_BASE_URL.replace(/\/(api|v1)\/?$/, "").replace(
    /\/$/,
    "",
  ),
  merchants: env.MERCHANT_ALLOWED_DOMAINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  origins: new Set([
    env.WEB_ORIGIN,
    "http://127.0.0.1:5173",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    ...env.ALLOWED_ORIGINS.split(",").filter(Boolean),
  ]),
};
export function missingConfig() {
  return [
    ...(config.useOpenAI
      ? ["OPENAI_API_KEY", "DAYTONA_API_KEY"]
      : ["NOSANA_BASE_URL", "NOSANA_VISION_MODEL", "DAYTONA_API_KEY"]),
    "NEO4J_URI",
    "NEO4J_PASSWORD",
  ].filter((k) => !config[k as keyof typeof config]);
}

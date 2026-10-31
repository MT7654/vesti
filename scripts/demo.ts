// Explicit no-service runtime, even when the developer has a populated .env.
export {};
for (const key of ["OPENAI_API_KEY", "OpenAI_API_Key", "NOSANA_API_KEY", "NOSANA_BASE_URL", "NOSANA_ENDPOINT_TOKEN", "DAYTONA_API_KEY", "NEO4J_URI", "NEO4J_PASSWORD", "VITE_API_BASE_URL"])
  process.env[key] = "";
process.env.HOST = "127.0.0.1";
process.env.WEB_ORIGIN = "http://localhost:5173";
process.env.PORT = "3001";
await import("./dev");

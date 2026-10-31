import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { config, missingConfig } from "./config";
import * as jobs from "./jobs";
import * as graph from "../../packages/providers/graph";
import {
  filtersSchema,
  selectionSchema,
  type Recommendation,
} from "../../packages/contracts";
import { overlayFor, overlayBytes, garmentSvg } from "./overlays";

type Session = { id: string; origin: string; expires: number };
type Fit = {
  sessionId: string;
  searchId: string;
  listing: Recommendation;
  expires: number;
  illustration?: boolean;
};
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
export async function createApp(onPairCode: (code: string) => void = () => {}) {
  const app = Fastify({ bodyLimit: 2 * 1024 * 1024, logger: false });
  const sessions = new Map<string, Session>(),
    fits = new Map<string, Fit>(),
    handoffs = new Map<string, Fit>();
  const idempotency = new Map<string, { id: string; expires: number }>(),
    starts = new Map<string, number[]>(),
    pairAttempts = new Map<string, number[]>();
  const creating = new Map<string, ReturnType<typeof jobs.createJob>>();
  let code = String(randomInt(100000, 1000000)),
    codeExpires = Date.now() + 10 * 60_000;
  onPairCode(code);
  const pairingOrigins = new Set(config.origins);
  const pairingOrigin = (o: string) =>
    pairingOrigins.has(o) || /^chrome-extension:\/\/[a-p]{32}$/.test(o);
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || pairingOrigin(origin)),
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
    maxAge: 600,
  });
  await app.register(multipart, {
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 2, parts: 3 },
  });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("Referrer-Policy", "no-referrer")
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "no-store");
    if (req.headers.origin && !pairingOrigin(req.headers.origin)) {
      reply.code(403).send({ message: "Origin not allowed" });
    }
  });
  async function auth(req: FastifyRequest): Promise<Session> {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token)
      throw Object.assign(new Error("Pair Vesti with the local API first."), {
        statusCode: 401,
      });
    const key = hash(token);
    let s = sessions.get(key);
    if (!s) {
      try {
        s = await graph.restoreAuth(key);
        if (s) sessions.set(key, s);
      } catch {}
    }
    if (
      !s ||
      s.expires < Date.now() ||
      (req.headers.origin && req.headers.origin !== s.origin)
    )
      throw Object.assign(
        new Error("Session expired or belongs to another origin. Pair again."),
        { statusCode: 401 },
      );
    return s;
  }
  function fitAuth(req: FastifyRequest) {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1],
      fit = token ? fits.get(hash(token)) : null;
    if (!fit || fit.expires < Date.now())
      throw Object.assign(
        new Error("Fitting session expired. Open Try on again."),
        { statusCode: 401 },
      );
    return fit;
  }
  async function own(req: FastifyRequest) {
    const session = await auth(req),
      id = z
        .string()
        .uuid()
        .parse((req.params as { id: string }).id),
      search = await jobs.getJob(session.id, id);
    if (!search)
      throw Object.assign(new Error("Search not found"), { statusCode: 404 });
    return { session, search };
  }
  app.setErrorHandler((error, req, reply) => {
    const err = error as Error & { statusCode?: number };
    const status = error instanceof z.ZodError ? 400 : err.statusCode || 500;
    reply.code(status).send({
      code:
        status === 401
          ? "UNAUTHORIZED"
          : status === 400
            ? "INVALID_INPUT"
            : "REQUEST_FAILED",
      stage: "request",
      retryable: status >= 500,
      message:
        error instanceof z.ZodError
          ? error.issues
              .map((i) => i.message)
              .join("; ")
              .slice(0, 200)
          : status >= 500
            ? "The operation could not finish. Check service readiness and try again."
            : err.message,
      requestId: req.id,
    });
  });
  app.get("/health/live", async () => ({ ok: true, version: "0.1.0" }));
  app.get("/health/ready", async () => ({
    configured: missingConfig().length === 0,
    missing: missingConfig(),
    merchantSources: config.merchants.length,
    demoAvailable: true,
    liveValidation:
      "Run npm run smoke; configuration alone does not prove readiness.",
  }));
  async function issueSession(origin: string) {
    const token = opaque();
    const session = {
      id: crypto.randomUUID(),
      origin,
      expires: Date.now() + 86400000,
    };
    sessions.set(hash(token), session);
    await graph
      .saveAuth(session.id, hash(token), origin, session.expires)
      .catch(() => {});
    return {
      token,
      expiresAt: new Date(session.expires).toISOString(),
      webOrigin: config.WEB_ORIGIN,
    };
  }
  const sessionAttempts = new Map<string, number[]>();
  app.post("/v1/session", async (req, reply) => {
    const origin = req.headers.origin;
    if (!origin || !pairingOrigin(origin))
      return reply.code(403).send({ message: "Origin not allowed" });
    const recent = (sessionAttempts.get(req.ip) || []).filter(
      (t) => t > Date.now() - 600000,
    );
    if (recent.length >= 30)
      return reply
        .code(429)
        .send({ message: "Too many connections. Please wait ten minutes." });
    recent.push(Date.now());
    sessionAttempts.set(req.ip, recent);
    return issueSession(origin);
  });
  app.post("/v1/pair", async (req, reply) => {
    const body = z.object({ code: z.string().length(6) }).parse(req.body),
      origin = req.headers.origin || config.WEB_ORIGIN;
    if (!pairingOrigin(origin))
      return reply.code(403).send({ message: "Origin not allowed" });
    const attempts = (pairAttempts.get(req.ip) || []).filter(
      (t) => t > Date.now() - 600000,
    );
    if (attempts.length >= 10)
      return reply
        .code(429)
        .send({ message: "Too many pairing attempts. Wait ten minutes." });
    attempts.push(Date.now());
    pairAttempts.set(req.ip, attempts);
    if (codeExpires < Date.now() || body.code !== code)
      return reply.code(401).send({
        message:
          "Pairing code is incorrect or expired. Use the current API terminal code.",
      });
    const issued = await issueSession(origin);
    code = String(randomInt(100000, 1000000));
    codeExpires = Date.now() + 600000;
    onPairCode(code);
    return issued;
  });
  app.post("/v1/searches", async (req, reply) => {
    const session = await auth(req),
      key = z.string().min(8).max(100).parse(req.headers["idempotency-key"]);
    const old = idempotency.get(`${session.id}:${key}`);
    if (old && old.expires > Date.now())
      return reply.code(202).send({ id: old.id });
    const recent = (starts.get(session.id) || []).filter(
      (t) => t > Date.now() - 600000,
    );
    if (recent.length >= 10)
      return reply
        .code(429)
        .send({ message: "Ten searches per ten minutes. Please wait." });
    let image: Buffer | undefined,
      selection = selectionSchema.parse({ click: { x: 0.5, y: 0.5 } }),
      demo = false,
      demoCategory: "jacket" | "hoodie" | "tshirt" = "jacket",
      demoColour = "olive";
    if (req.isMultipart()) {
      let gotSelection = false;
      for await (const part of req.parts()) {
        if (part.type === "file") {
          if (
            !["image/jpeg", "image/webp", "image/png"].includes(part.mimetype)
          )
            throw Object.assign(new Error("Use a JPEG, WebP or PNG crop"), {
              statusCode: 400,
            });
          image = await part.toBuffer();
        } else if (part.fieldname === "selection") {
          selection = selectionSchema.parse(JSON.parse(String(part.value)));
          gotSelection = true;
        }
      }
      if (!image || !gotSelection)
        throw Object.assign(
          new Error("Image crop and selection metadata are required"),
          { statusCode: 400 },
        );
      const metadata = await sharp(image, {
        limitInputPixels: 1280 * 1280,
      }).metadata();
      if (
        !metadata.width ||
        !metadata.height ||
        Math.max(metadata.width, metadata.height) > 1280
      )
        throw Object.assign(
          new Error("Crop must be at most 1280 pixels on its longest side"),
          { statusCode: 400 },
        );
      image = await sharp(image).jpeg({ quality: 85 }).toBuffer();
    } else if (
      z.object({ sample: z.literal(true) }).safeParse(req.body).success
    ) {
      image = await sharp(Buffer.from(garmentSvg("hoodie", "#303331")))
        .flatten({ background: "#f4f1e9" })
        .jpeg({ quality: 85 })
        .toBuffer();
    } else {
      const b = z
        .object({
          demo: z.literal(true),
          category: z.enum(["jacket", "hoodie", "tshirt"]).default("jacket"),
          colour: z.string().min(1).max(40).default("olive"),
        })
        .parse(req.body);
      demo = true;
      demoCategory = b.category;
      demoColour = b.colour;
    }
    recent.push(Date.now());
    starts.set(session.id, recent);
    const creationKey = `${session.id}:${key}`;
    const pending = creating.get(creationKey);
    if (pending) return reply.code(202).send({ id: (await pending).id });
    const creation = jobs.createJob(
      session.id,
      selection,
      image,
      demo,
      demoCategory,
      demoColour,
    );
    creating.set(creationKey, creation);
    let search;
    try {
      search = await creation;
    } finally {
      creating.delete(creationKey);
    }
    idempotency.set(`${session.id}:${key}`, {
      id: search.id,
      expires: Date.now() + 86400000,
    });
    return reply.code(202).send({ id: search.id });
  });
  app.get("/v1/searches/:id", async (req) => {
    const { search } = await own(req);
    for (const item of search.recommendations) {
      item.overlayStatus = (await overlayFor(item)).status;
    }
    return search;
  });
  app.post("/v1/searches/:id/confirm", async (req) => {
    const { session, search } = await own(req);
    const b = z
      .object({
        category: z.enum(["jacket", "hoodie", "tshirt"]),
        colour: z.string().min(1).max(40).optional(),
      })
      .parse(req.body);
    return jobs.confirmJob(session.id, search.id, b.category, b.colour);
  });
  app.post("/v1/searches/:id/rank", async (req) => {
    const { session, search } = await own(req);
    return jobs.rankJob(session.id, search.id, filtersSchema.parse(req.body));
  });
  app.delete("/v1/searches/:id", async (req) => {
    const { session, search } = await own(req);
    await jobs.cancelJob(session.id, search.id);
    return { ok: true };
  });
  app.get("/v1/admin/runs/:id", async (req) => {
    const { session, search } = await own(req);
    return {
      searchId: search.id,
      evidence: search.evidence,
      graph: search.demo ? [] : await graph.graphView(session.id, search.id),
      mode: search.demo ? "demo" : "live",
    };
  });
  app.post("/v1/searches/:id/handoff", async (req) => {
    const { session, search } = await own(req);
    const body = z
      .object({
        listingId: z.string().max(100),
        illustration: z.boolean().default(false),
      })
      .parse(req.body);
    const listing = search.recommendations.find((l) => l.id === body.listingId);
    if (!listing)
      throw Object.assign(new Error("Listing does not belong to this search"), {
        statusCode: 404,
      });
    const handoff = opaque();
    handoffs.set(hash(handoff), {
      sessionId: session.id,
      searchId: search.id,
      listing,
      illustration: body.illustration,
      expires: Date.now() + 60000,
    });
    return { url: `${config.WEB_ORIGIN}/#handoff=${handoff}` };
  });
  app.post("/v1/handoffs/exchange", async (req, reply) => {
    if (req.headers.origin && !config.origins.has(req.headers.origin))
      return reply.code(403).send({
        message: "Open the fitting room on the configured web origin",
      });
    const body = z.object({ code: z.string().max(100) }).parse(req.body),
      key = hash(body.code),
      fit = handoffs.get(key);
    handoffs.delete(key);
    if (!fit || fit.expires < Date.now())
      return reply.code(410).send({
        message:
          "This fitting link has expired or was already used. Open Try on again.",
      });
    const token = opaque();
    fits.set(hash(token), { ...fit, expires: Date.now() + 3600000 });
    return { token };
  });
  app.get("/v1/fitting", async (req) => {
    const fit = fitAuth(req),
      search = await jobs.getJob(fit.sessionId, fit.searchId);
    if (!search)
      throw Object.assign(new Error("Search expired"), { statusCode: 410 });
    return {
      listing: fit.listing,
      search,
      overlay: await overlayFor(fit.listing, fit.illustration),
      returnUrl: search.selection.videoId
        ? `https://www.youtube.com/watch?v=${search.selection.videoId}&t=${Math.floor(search.selection.videoTime)}s`
        : null,
      graph: search.demo
        ? []
        : await graph.graphView(fit.sessionId, fit.searchId),
    };
  });
  app.get("/v1/fitting/overlay", async (req, reply) => {
    const fit = fitAuth(req),
      asset = await overlayBytes(fit.listing, fit.illustration);
    return reply.type(asset.type).send(asset.bytes);
  });
  app.get("/v1/listings/:id/overlay", async (req) => {
    const fit = fitAuth(req);
    if ((req.params as { id: string }).id !== fit.listing.id)
      throw Object.assign(new Error("Listing not in fitting session"), {
        statusCode: 403,
      });
    return overlayFor(fit.listing, fit.illustration);
  });
  const dist = path.resolve("dist/web");
  if (existsSync(dist)) await app.register(staticFiles, { root: dist });
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const map of [handoffs, fits, sessions, idempotency])
      for (const [key, value] of map) if (value.expires < now) map.delete(key);
    jobs.cleanupJobs();
    void graph.cleanupGraph().catch(() => {});
    if (codeExpires < now) {
      code = String(randomInt(100000, 1000000));
      codeExpires = now + 600000;
      onPairCode(code);
    }
  }, 60000);
  cleanup.unref();
  app.addHook("onClose", async () => {
    clearInterval(cleanup);
    jobs.shutdownJobs();
  });
  return app;
}

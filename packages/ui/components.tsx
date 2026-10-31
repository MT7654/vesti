import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Shirt,
  SlidersHorizontal,
  X,
  CircleHelp,
} from "lucide-react";
import {
  money,
  type Filters,
  type Recommendation,
  type Search,
} from "../contracts";
import { request } from "./api";
export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Vesti home">
      <span className="brand-icon">v</span>vesti
      <span className="brand-dot">.</span>
    </a>
  );
}
export function ProductVisual({ item }: { item: Recommendation }) {
  const [failed, setFailed] = useState(false);
  if (item.imageUrl && !failed)
    return (
      <img
        src={item.imageUrl}
        alt={item.title}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  if (item.demo)
    return (
      <GarmentArt
        colour={item.attributes.find((a) => a.kind === "colour")?.value}
        category={item.attributes.find((a) => a.kind === "category")?.value}
      />
    );
  return (
    <div className="image-unavailable">
      <Shirt size={28} />
      <span>Product image unavailable</span>
    </div>
  );
}
export function GarmentArt({
  colour = "olive",
  category = "jacket",
}: {
  colour?: string;
  category?: string;
}) {
  const fill =
    colour === "sand" ? "#c3b698" : colour === "black" ? "#363b37" : "#737e61";
  return (
    <svg
      viewBox="0 0 480 560"
      role="img"
      aria-label={`Illustration of ${colour} ${category}`}
      className="garment-art"
    >
      <defs>
        <linearGradient id={`cloth-${colour}`} x2="1" y2="1">
          <stop stopColor={fill} />
          <stop offset="1" stopColor={fill} stopOpacity=".8" />
        </linearGradient>
      </defs>
      <path
        d="M174 53 Q240 92 306 53 L346 87 437 427 366 453 337 225 340 510 Q240 533 140 510 L143 225 114 453 43 427 134 87Z"
        fill={`url(#cloth-${colour})`}
        stroke="#45523d"
        strokeWidth="2"
      />
      <path
        d="M174 53 L240 97 210 145 165 75 M306 53 L240 97 270 145 315 75"
        fill="#939a7d"
        stroke="#45523d"
        strokeWidth="2"
      />
      <path
        d="M240 97V519 M159 204H216V277H159Z M265 204H322V277H265Z"
        fill="none"
        stroke="#45523d"
        strokeWidth="2"
      />
      <path
        d="M145 495Q240 516 335 495"
        fill="none"
        stroke="#45523d"
        strokeOpacity=".5"
        strokeWidth="2"
      />
      {[181, 261, 341, 421].map((y) => (
        <circle key={y} cx="247" cy={y} r="3" fill="#d4d4c0" />
      ))}
    </svg>
  );
}
export function Pairing({ onPaired }: { onPaired: (token: string) => void }) {
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    void request<{ token: string }>("/v1/session", null, { method: "POST" })
      .then((r) => {
        if (active) onPaired(r.token);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  return (
    <section className="pairing" aria-live="polite">
      {error ? (
        <>
          <h2>Couldn’t connect to Vesti.</h2>
          <p role="alert">{error}</p>
          <button onClick={() => setRetry((n) => n + 1)}>
            Retry connection
          </button>
        </>
      ) : (
        <p role="status">Opening Vesti…</p>
      )}
    </section>
  );
}
export function ProductCard({
  item,
  onTry,
}: {
  item: Recommendation;
  onTry: (item: Recommendation) => void;
}) {
  return (
    <article className="product-card">
      <div className="product-image">
        <ProductVisual item={item} />
        <span className={`image-tag ${item.demo ? "demo-tag" : ""}`}>
          {item.demo ? "DEMO ITEM" : "SIMILAR FIND"}
        </span>
      </div>
      <div className="product-info">
        <span className="merchant">{item.merchantDomain}</span>
        <h3>{item.title}</h3>
        <strong className="price">{money(item)}</strong>
        <div className="reasons">
          {item.reasons.slice(0, 3).map((r) => (
            <span title={r.evidence} key={r.attributeKey}>
              <Check size={12} />
              {r.attributeKey.split(":").slice(1).join(":")}
            </span>
          ))}
        </div>
        <p className="fine">
          {item.demo
            ? "Illustrative item · not for sale"
            : `${item.availability === "unknown" ? "Stock unknown" : item.availability.replaceAll("_", " ")} · Checked ${new Date(item.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
        </p>
        <div className="card-actions">
          <button className="secondary" onClick={() => onTry(item)}>
            <Shirt size={15} />
            Try-On
          </button>
          {item.canonicalUrl ? (
            <a
              className="retailer-link"
              href={item.canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View at retailer <ArrowUpRight size={15} />
            </a>
          ) : (
            <span className="fine">Sample collection</span>
          )}
        </div>
        {!item.demo && item.overlayStatus === "unavailable" && (
          <p className="fine">
            No usable product image was found for this preview.
          </p>
        )}
      </div>
    </article>
  );
}
export function Progress({
  search,
  onCancel,
}: {
  search: Search;
  onCancel: () => void;
}) {
  const current =
    search.stage === "identifying" ? 0 : search.stage === "discovering" ? 1 : 2;
  return (
    <section className="progress-box" aria-live="polite">
      <div className="section-heading">
        <strong>
          {search.queued
            ? "Waiting for a search slot"
            : search.stage === "awaiting_confirmation"
              ? "Check your selection"
              : "Finding your look"}
        </strong>
        <button className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {["Identifying clothing", "Searching stores", "Ranking matches"].map(
        (s, i) => (
          <div
            className={`progress-step ${i === current ? "active" : ""} ${i < current ? "done" : ""}`}
            key={s}
          >
            <span>{i < current ? <Check size={13} /> : i + 1}</span>
            {s}
            {i === current && <span className="pulse" />}
          </div>
        ),
      )}
    </section>
  );
}
export function FilterBar({
  items,
  onApply,
}: {
  items: Recommendation[];
  onApply: (filters: Filters) => void;
}) {
  const [open, setOpen] = useState(false),
    [f, setF] = useState<Filters>({});
  return (
    <div className="filter-bar">
      <button
        className="text-button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <SlidersHorizontal size={15} /> Filters <ChevronDown size={13} />
      </button>
      {open && (
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            onApply(f);
          }}
        >
          <label>
            Category
            <select
              value={f.category || ""}
              onChange={(e) =>
                setF({
                  ...f,
                  category: (e.target.value ||
                    undefined) as Filters["category"],
                })
              }
            >
              <option value="">All categories</option>
              <option value="jacket">Jackets</option>
              <option value="hoodie">Hoodies</option>
              <option value="tshirt">T-shirts</option>
            </select>
          </label>
          <label>
            Colour
            <input
              placeholder="Any colour"
              value={f.colour || ""}
              onChange={(e) =>
                setF({ ...f, colour: e.target.value || undefined })
              }
            />
          </label>
          <label>
            Merchant
            <select
              value={f.merchant || ""}
              onChange={(e) =>
                setF({ ...f, merchant: e.target.value || undefined })
              }
            >
              <option value="">All merchants</option>
              {[...new Set(items.map((i) => i.merchantDomain))].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            Currency
            <select
              value={f.currency || ""}
              onChange={(e) =>
                setF({
                  ...f,
                  currency: e.target.value || undefined,
                  maxPrice: undefined,
                })
              }
            >
              <option value="">Any currency</option>
              {[...new Set(items.map((i) => i.currency).filter(Boolean))].map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Maximum price
            <input
              type="number"
              min="0"
              step="0.01"
              disabled={!f.currency}
              value={f.maxPrice || ""}
              onChange={(e) =>
                setF({ ...f, maxPrice: e.target.value || undefined })
              }
            />
          </label>
          <p className="fine">
            Price filters exclude items with unknown prices.
          </p>
          <div className="input-row">
            <button type="submit">Apply filters</button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setF({});
                onApply({});
              }}
            >
              Reset
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
export function Evidence({
  search,
  graph = [],
}: {
  search: Search;
  graph?: {
    source: string;
    relationship: string;
    target: string;
    label: string;
  }[];
}) {
  return (
    <details className="evidence">
      <summary>
        <CircleHelp size={15} />{" "}
        {search.demo ? "About this demo" : "How this match was found"}
      </summary>
      <p className="fine">
        {search.demo
          ? "Demo data. No sponsor calls were made."
          : "Fresh service receipts for this search. Cost unknown."}
      </p>
      <div className="sponsor-grid">
        {(["openai", "nosana", "daytona", "neo4j"] as const)
          .filter((k) => !!search.evidence[k])
          .map((k) => (
            <div key={k}>
              <strong>
                {k === "neo4j"
                  ? "Neo4j"
                  : k === "openai"
                    ? "OpenAI"
                    : k[0].toUpperCase() + k.slice(1)}
              </strong>
              <span className={`status ${search.evidence[k]!.state}`}>
                {search.evidence[k]!.state.replaceAll("_", " ")}
              </span>
              {search.evidence[k]!.durationMs !== undefined && (
                <small>
                  {(search.evidence[k]!.durationMs! / 1000).toFixed(1)}s
                </small>
              )}
            </div>
          ))}
      </div>
      {search.evidence.daytona.details?.role ===
        "Candidate validation and deduplication" && (
        <p className="fine">
          Daytona runs the candidate checks in an isolated sandbox: approved
          product URLs, category and source checks, and duplicate removal. Only
          accepted products proceed to Neo4j ranking.
        </p>
      )}
      {graph.length > 0 && (
        <div className="graph-view" aria-label="Actual graph relationships">
          {graph.map((edge, i) => (
            <div key={i}>
              <span>Search</span>
              <small>{edge.relationship.toLowerCase()}</small>
              <span>
                {edge.label.replace("Vesti", "")} {edge.target.slice(0, 8)}
              </span>
            </div>
          ))}
        </div>
      )}
      <details>
        <summary>Inspect evidence</summary>
        <pre>
          {JSON.stringify({ searchId: search.id, ...search.evidence }, null, 2)}
        </pre>
      </details>
    </details>
  );
}
export function ErrorNotice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="notice error" role="alert">
      <span>{message}</span>
      {onDismiss && (
        <button
          className="icon-button"
          aria-label="Dismiss error"
          onClick={onDismiss}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

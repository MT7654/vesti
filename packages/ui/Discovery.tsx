import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Crosshair,
  Leaf,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  terminal,
  type Search,
  type Selection,
  type Recommendation,
  type Filters,
} from "../contracts";
import { request } from "./api";
import { imageDataBlob } from "../contracts/image";
import {
  ErrorNotice,
  Evidence,
  FilterBar,
  Pairing,
  ProductCard,
  Progress,
} from "./components";
export type Crop = {
  dataUrl: string;
  selection: Selection;
  capturedAt: number;
};
type Props = {
  token: string | null;
  onPaired: (token: string) => void;
  crop?: Crop | null;
  onSelect?: () => void;
  selecting?: boolean;
  onHandoff?: (url: string) => void;
  initialSearchId?: string;
  onSearchId?: (id: string) => void;
};
export function Discovery({
  token,
  onPaired,
  crop,
  onSelect,
  selecting,
  onHandoff,
  initialSearchId,
  onSearchId,
}: Props) {
  const [search, setSearch] = useState<Search | null>(null),
    [id, setId] = useState(initialSearchId || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [category, setCategory] = useState<"jacket" | "hoodie" | "tshirt">(
      "jacket",
    ),
    [colour, setColour] = useState(""),
    [catalog, setCatalog] = useState<Recommendation[]>([]);
  const sent = useRef<number>(0),
    current = useRef(id);
  current.current = id;
  async function start(demo: boolean, image?: Crop, sample = false) {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      if (search && !terminal(search.stage))
        await request(`/v1/searches/${search.id}`, token, { method: "DELETE" });
      let body: BodyInit;
      if (sample) body = JSON.stringify({ sample: true });
      else if (demo)
        body = JSON.stringify({
          demo: true,
          category:
            search?.garment?.category === "unknown"
              ? "jacket"
              : search?.garment?.category || "jacket",
          colour:
            search?.garment?.attributes.find((a) => a.kind === "colour")
              ?.value || "olive",
        });
      else {
        if (!image) throw new Error("Select a garment first.");
        const form = new FormData();
        form.append("selection", JSON.stringify(image.selection));
        form.append("crop", imageDataBlob(image.dataUrl), "crop.jpg");
        body = form;
      }
      const r = await request<{ id: string }>("/v1/searches", token, {
        method: "POST",
        headers: {
          "Idempotency-Key": image
            ? `capture-${image.capturedAt}`
            : crypto.randomUUID(),
        },
        body,
      });
      setSearch(null);
      setId(r.id);
      onSearchId?.(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      crop &&
      token &&
      crop.capturedAt !== sent.current &&
      Date.now() - crop.capturedAt < 300000
    ) {
      sent.current = crop.capturedAt;
      void start(false, crop);
    }
  }, [crop?.capturedAt, token]);
  useEffect(() => {
    if (!id || !token) return;
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    async function poll() {
      try {
        const s = await request<Search>(`/v1/searches/${id}`, token);
        if (closed) return;
        setSearch(s);
        if (s.recommendations.length) setCatalog(s.recommendations);
        if (s.garment && s.stage === "awaiting_confirmation") {
          setCategory(
            s.garment.category === "unknown" ? "jacket" : s.garment.category,
          );
          setColour(
            s.garment.attributes.find((a) => a.kind === "colour")?.value || "",
          );
        }
        if (!terminal(s.stage))
          timer = setTimeout(poll, polls++ < 10 ? 1000 : 3000);
      } catch (e) {
        if (!closed) {
          setError((e as Error).message);
          timer = setTimeout(poll, 5000);
        }
      }
    }
    void poll();
    return () => {
      closed = true;
      clearTimeout(timer);
    };
  }, [id, token]);
  async function cancel() {
    if (!search) return;
    await request(`/v1/searches/${search.id}`, token, {
      method: "DELETE",
    }).catch((e) => setError(e.message));
    setSearch({ ...search, stage: "cancelled" });
  }
  async function tryOn(item: Recommendation) {
    setBusy(true);
    setError("");
    try {
      const r = await request<{ url: string }>(
        `/v1/searches/${search!.id}/handoff`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            listingId: item.id,
            illustration: !item.demo && item.overlayStatus === "unavailable",
          }),
        },
      );
      if (onHandoff) onHandoff(r.url);
      else window.location.assign(r.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function applyFilters(f: Filters) {
    try {
      setSearch(
        await request<Search>(`/v1/searches/${id}/rank`, token, {
          method: "POST",
          body: JSON.stringify(f),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!token) return <Pairing onPaired={onPaired} />;
  return (
    <div className="discovery">
      <div className="section-heading">
        <span className="eyebrow">Your style, spotted.</span>
        <span className="local-badge">
          <i /> Local session
        </span>
      </div>
      <h2>
        Your next find.
        <br />
        <em>Starts right here.</em>
      </h2>
      <p className="intro-copy">
        Find similar pieces to the clothes that catch your eye.
      </p>
      {onSelect && (
        <button
          className="full"
          disabled={busy || selecting}
          onClick={onSelect}
        >
          <Crosshair size={17} />
          {selecting ? "Click a garment in the video" : "Select a garment"}
        </button>
      )}
      {!search && (
        <>
          {!onSelect && (
            <>
              <button
                className="full"
                disabled={busy}
                onClick={() => void start(false, undefined, true)}
              >
                <Crosshair size={16} />
                Try a live search
                <ArrowUpRight size={15} />
              </button>
              <p className="fine">
                An illustrated hoodie, real AI recognition and real store
                results.
              </p>
            </>
          )}
          <button
            className="secondary full demo-button"
            disabled={busy}
            onClick={() => void start(true)}
          >
            <Sparkles size={16} />
            {busy ? "Opening…" : "Explore the demo collection"}
            <ArrowUpRight size={15} />
          </button>
          <p className="fine">
            Demo items are illustrations with sample prices.
          </p>
        </>
      )}
      {error && <ErrorNotice message={error} onDismiss={() => setError("")} />}
      {crop && Date.now() - crop.capturedAt < 300000 && (
        <div className="capture-preview">
          <img src={crop.dataUrl} alt="Selected video crop" />
          <span
            className="click-dot"
            style={{
              left: `${crop.selection.click.x * 100}%`,
              top: `${crop.selection.click.y * 100}%`,
            }}
          />
          <span className="capture-label">YOUR SELECTION</span>
        </div>
      )}
      {search && !terminal(search.stage) && (
        <Progress search={search} onCancel={() => void cancel()} />
      )}
      {search?.stage === "awaiting_confirmation" && (
        <form
          className="confirm-box"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              setSearch(
                await request<Search>(`/v1/searches/${id}/confirm`, token, {
                  method: "POST",
                  body: JSON.stringify({
                    category,
                    colour: colour || undefined,
                  }),
                }),
              );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <h3>Is this the piece?</h3>
          <p>
            The selection needs a second look. Confirm before we search stores.
          </p>
          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
            >
              <option value="jacket">Jacket</option>
              <option value="hoodie">Hoodie</option>
              <option value="tshirt">T-shirt</option>
            </select>
          </label>
          <label>
            Colour
            <input
              value={colour}
              onChange={(e) => setColour(e.target.value)}
              maxLength={40}
            />
          </label>
          <button className="full">Confirm and find similar</button>
        </form>
      )}
      {search?.garment && search.stage !== "awaiting_confirmation" && (
        <div className="attribute-pills">
          {search.garment.attributes.slice(0, 4).map((a) => (
            <span
              key={a.key}
              title={`${a.source}: ${a.evidence || "Visible estimate"}`}
            >
              {a.value}
            </span>
          ))}
        </div>
      )}
      {search &&
        (search.stage === "completed" || search.stage === "partial") && (
          <>
            <div className="results-heading">
              <div>
                <span className="eyebrow">
                  {search.demo ? "Demo collection" : "Selected for your look"}
                </span>
                <h3>
                  {search.recommendations.length} similar{" "}
                  {search.recommendations.length === 1 ? "find" : "finds"}
                </h3>
              </div>
              <FilterBar
                items={catalog}
                onApply={(f) => void applyFilters(f)}
              />
            </div>
            {search.recommendations.length ? (
              search.recommendations.map((r) => (
                <ProductCard key={r.id} item={r} onTry={(r) => void tryOn(r)} />
              ))
            ) : (
              <div className="empty-state">
                <Leaf size={30} />
                <h3>No matches this time.</h3>
                <p>Try fewer filters or select a different garment.</p>
                <button className="secondary" onClick={() => void start(true)}>
                  Create a labelled demo mock-up
                </button>
              </div>
            )}
          </>
        )}
      {search?.stage === "failed" && (
        <div className="empty-state">
          <h3>This search couldn’t finish.</h3>
          <p>{search.error?.message}</p>
          <button className="secondary" onClick={() => void start(true)}>
            Explore the labelled demo
          </button>
        </div>
      )}
      {search?.stage === "cancelled" && (
        <p className="notice">
          Search cancelled. Select another garment when you’re ready.
        </p>
      )}
      {search?.warnings.map((w, i) => (
        <p className="fine warning" key={i}>
          {w}
        </p>
      ))}
      {search && terminal(search.stage) && (
        <>
          <button
            className="text-button restart"
            disabled={busy}
            onClick={() => {
              if (onSelect) onSelect();
              else {
                setSearch(null);
                setId("");
                onSearchId?.("");
              }
            }}
          >
            <RotateCcw size={14} />
            Start a new search
          </button>
          <Evidence search={search} />
        </>
      )}
    </div>
  );
}

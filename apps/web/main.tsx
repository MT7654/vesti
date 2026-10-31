import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Crosshair,
  LockKeyhole,
  RotateCcw,
  Shirt,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  Brand,
  ErrorNotice,
  Evidence,
  GarmentArt,
  ProductVisual,
} from "../../packages/ui/components";
import { Discovery, type Crop } from "../../packages/ui/Discovery";
import { API, request } from "../../packages/ui/api";
import {
  money,
  type Recommendation,
  type Search,
} from "../../packages/contracts";
import { Camera } from "./Camera";
import "../../packages/ui/styles.css";
type Fitting = {
  listing: Recommendation;
  search: Search;
  overlay: {
    status: "ready" | "unavailable";
    illustration?: boolean;
    anchors?: {
      leftShoulder: number[];
      rightShoulder: number[];
      hem: number[];
    };
  };
  returnUrl: string | null;
  graph: {
    source: string;
    relationship: string;
    target: string;
    label: string;
  }[];
};
function App() {
  const [token, setToken] = useState(sessionStorage.getItem("vesti-session")),
    [fitToken, setFitToken] = useState(sessionStorage.getItem("vesti-fitting")),
    [fitting, setFitting] = useState<Fitting | null>(null),
    [asset, setAsset] = useState<string | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [scale, setScale] = useState(1),
    [offset, setOffset] = useState(0),
    [crop, setCrop] = useState<Crop | null>(null),
    [upload, setUpload] = useState<string | null>(null),
    [showHelp, setShowHelp] = useState(false),
    [metrics, setMetrics] = useState({ fps: 0, poseFps: 0 });
  async function exchange(code: string) {
    setLoading(true);
    setError("");
    try {
      const r = await request<{ token: string }>(
        "/v1/handoffs/exchange",
        null,
        { method: "POST", body: JSON.stringify({ code }) },
      );
      sessionStorage.setItem("vesti-fitting", r.token);
      setFitToken(r.token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const code = new URLSearchParams(location.hash.slice(1)).get("handoff");
    if (code) {
      history.replaceState(null, "", location.pathname);
      void exchange(code);
    }
  }, []);
  useEffect(() => {
    if (!fitToken) return;
    let closed = false,
      objectUrl: string | null = null;
    setLoading(true);
    void (async () => {
      try {
        const fit = await request<Fitting>("/v1/fitting", fitToken);
        if (closed) return;
        setFitting(fit);
        if (fit.overlay.status === "ready") {
          const r = await fetch(API + "/v1/fitting/overlay", {
            headers: { Authorization: `Bearer ${fitToken}` },
          });
          if (!r.ok)
            throw new Error("The garment preview asset could not load.");
          objectUrl = URL.createObjectURL(await r.blob());
          if (!closed) setAsset(objectUrl);
        }
      } catch (e) {
        if (!closed) {
          setError((e as Error).message);
          sessionStorage.removeItem("vesti-fitting");
        }
      } finally {
        if (!closed) setLoading(false);
      }
    })();
    return () => {
      closed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setAsset(null);
    };
  }, [fitToken]);
  function back() {
    setFitting(null);
    setFitToken(null);
    sessionStorage.removeItem("vesti-fitting");
    setError("");
    setScale(1);
    setOffset(0);
  }
  async function fileSelected(file: File) {
    if (file.size > 10 * 1024 * 1024)
      throw new Error("Choose an image smaller than 10 MB.");
    const img = await createImageBitmap(file);
    const ratio = Math.min(1, 1280 / Math.max(img.width, img.height)),
      c = document.createElement("canvas");
    c.width = Math.round(img.width * ratio);
    c.height = Math.round(img.height * ratio);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    img.close();
    setUpload(c.toDataURL("image/jpeg", 0.85));
  }
  useEffect(() => {
    if (!crop) return;
    const timer = setTimeout(
      () => setCrop(null),
      Math.max(0, 300000 - (Date.now() - crop.capturedAt)),
    );
    return () => clearTimeout(timer);
  }, [crop]);
  useEffect(() => {
    if (!upload) return;
    const timer = setTimeout(() => setUpload(null), 300000);
    return () => clearTimeout(timer);
  }, [upload]);
  return (
    <div className="web-shell">
      <header className="web-header">
        <Brand />
        <nav aria-label="Main navigation">
          <button className={!fitting ? "nav-active" : ""} onClick={back}>
            Discover
          </button>
          <button
            className={fitting ? "nav-active" : ""}
            disabled={!fitting}
            onClick={() => {}}
          >
            Fitting room
          </button>
          <button onClick={() => setShowHelp(!showHelp)}>How it works</button>
        </nav>
        <span className="header-note">
          <span className="tiny-leaf">✳</span> A new perspective on your style
        </span>
      </header>
      {showHelp && (
        <section className="help-strip">
          <strong>From watching to wearing</strong>
          <p>
            1. Load the unpacked extension from <code>dist/extension</code>. 2.
            On a YouTube watch page, click Vesti and select a garment. 3. Review
            similar finds, then open Try on here.
          </p>
          <p>
            Use the demo collection to explore without live services. Demo items
            and overlays are illustrations. The camera stays local; this is not
            a size or fit prediction.
          </p>
        </section>
      )}
      <main className="web-main">
        {error && (
          <ErrorNotice message={error} onDismiss={() => setError("")} />
        )}{" "}
        {loading && (
          <p className="notice" role="status">
            Opening your fitting room…
          </p>
        )}
        {fitting ? (
          <>
            <div className="page-heading">
              <div>
                <button className="text-button back-link" onClick={back}>
                  <ArrowLeft size={14} /> Back to discovery
                </button>
                <h1>
                  A little style.
                  <br />
                  <em>A little you.</em>
                </h1>
              </div>
              <div className="heading-aside">
                <span className="eyebrow">THE FITTING ROOM</span>
                <p>Try the look. Keep your perspective.</p>
                {fitting.returnUrl && (
                  <a
                    className="text-link"
                    href={fitting.returnUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Return to video <ArrowUpRight size={14} />
                  </a>
                )}
              </div>
            </div>
            <div className="fitting-layout">
              <div>
                <Camera
                  assetUrl={asset}
                  anchors={fitting.overlay.anchors}
                  scale={scale}
                  offset={offset}
                  illustration={!!fitting.overlay.illustration}
                  onMetrics={setMetrics}
                />
                <div className="below-preview">
                  <LockKeyhole size={15} />
                  <span>
                    Processed in your browser. Your camera never leaves this
                    tab.
                  </span>
                  <span>2D appearance preview</span>
                </div>
              </div>
              <aside className="fitting-sidebar">
                <span className="eyebrow">IN YOUR FITTING ROOM</span>
                <div className="selected-product-image">
                  <ProductVisual item={fitting.listing} />
                  <span
                    className={`image-tag ${fitting.listing.demo ? "demo-tag" : ""}`}
                  >
                    {fitting.listing.demo
                      ? "ILLUSTRATION · DEMO"
                      : "SIMILAR FIND"}
                  </span>
                </div>
                <span className="merchant">
                  {fitting.listing.merchantDomain}
                </span>
                <h2 className="product-title">{fitting.listing.title}</h2>
                <p className="price">{money(fitting.listing)}</p>
                <div className="reasons">
                  {fitting.listing.reasons.map((r) => (
                    <span key={r.attributeKey} title={r.evidence}>
                      <Check size={12} />
                      {r.attributeKey.split(":").slice(1).join(":")}
                    </span>
                  ))}
                </div>
                {fitting.listing.canonicalUrl ? (
                  <a
                    className="button full"
                    href={fitting.listing.canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View at retailer <ArrowUpRight size={16} />
                  </a>
                ) : (
                  <p className="demo-disclosure">
                    A sample piece for exploring Vesti.
                    <br />
                    This item is not available for purchase.
                  </p>
                )}
                {fitting.overlay.status === "unavailable" && (
                  <p className="notice">
                    Preview unavailable. This product does not have an approved
                    transparent garment asset.
                  </p>
                )}
                {fitting.overlay.illustration && !fitting.listing.demo && (
                  <p className="demo-disclosure">
                    The camera overlay is a category illustration, not this
                    retailer’s actual garment. Use the product photo and
                    retailer page for the real design.
                  </p>
                )}
                <div className="adjustments">
                  <div className="section-heading">
                    <h3>Make a little adjustment</h3>
                    <button
                      className="icon-button"
                      aria-label="Reset adjustments"
                      onClick={() => {
                        setScale(1);
                        setOffset(0);
                      }}
                    >
                      <RotateCcw size={15} />
                    </button>
                  </div>
                  <label htmlFor="scale">
                    Garment scale <span>{Math.round(scale * 100)}%</span>
                  </label>
                  <input
                    id="scale"
                    type="range"
                    min=".65"
                    max="1.5"
                    step=".01"
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    disabled={!asset}
                  />
                  <label htmlFor="offset">
                    Vertical position{" "}
                    <span>
                      {offset > 0 ? "+" : ""}
                      {Math.round(offset * 100)}
                    </span>
                  </label>
                  <input
                    id="offset"
                    type="range"
                    min="-.25"
                    max=".25"
                    step=".01"
                    value={offset}
                    onChange={(e) => setOffset(Number(e.target.value))}
                    disabled={!asset}
                  />
                  <p className="fine">
                    Face forward and keep your shoulders and hips in the frame.
                    Adjust the illustration to explore the look.
                  </p>
                </div>
                <div className="fit-note">
                  <Shirt size={18} />
                  <p>
                    Approximate appearance preview;
                    <br />
                    not a size or fit prediction.
                  </p>
                </div>
              </aside>
            </div>
            <Evidence search={fitting.search} graph={fitting.graph} />
            {metrics.fps > 0 && (
              <p className="fine metrics">
                Measured in this session: {metrics.fps} render FPS ·{" "}
                {metrics.poseFps} pose updates/s
              </p>
            )}
          </>
        ) : (
          <>
            <div className="page-heading discovery-heading">
              <div>
                <span className="eyebrow">THE DISCOVERY STUDIO</span>
                <h1>
                  Spot it. Select it.
                  <br />
                  <em>Find your version.</em>
                </h1>
              </div>
              <div className="heading-aside">
                <p>
                  An outfit on screen. A starting point.
                  <br />
                  Point to a garment. Explore real alternatives.
                </p>
                <span className="text-link">
                  Watch. Discover. Try it on. <ArrowRight size={15} />
                </span>
              </div>
            </div>
            <div className="discovery-layout">
              <section className="editorial-stage">
                <div className="editorial-grid" />
                <span className="studio-label">
                  <span /> THE VESTI EDIT · 001
                </span>
                <div className="editorial-caption">
                  <span className="eyebrow">SPOTTED ON SCREEN</span>
                  <h2>
                    One good find.
                    <br />
                    <em>Your own direction.</em>
                  </h2>
                </div>
                <div className="editorial-garment">
                  <GarmentArt />
                </div>
                <span className="garment-note">
                  Olive tones
                  <br />
                  <span>Always in good company.</span>
                </span>
                <div className="editorial-bottom">
                  <span>
                    <Sparkles size={14} /> An illustrative look, ready to
                    explore.
                  </span>
                  <span>01 / 03</span>
                </div>
              </section>
              <aside className="discovery-sidebar">
                <Discovery
                  token={token}
                  onPaired={(t) => {
                    setToken(t);
                    sessionStorage.setItem("vesti-session", t);
                  }}
                  crop={crop}
                  initialSearchId={
                    sessionStorage.getItem("vesti-search") || undefined
                  }
                  onSearchId={(id) =>
                    sessionStorage.setItem("vesti-search", id)
                  }
                  onHandoff={(url) =>
                    void exchange(
                      new URLSearchParams(new URL(url).hash.slice(1)).get(
                        "handoff",
                      )!,
                    )
                  }
                />
                {token && (
                  <div className="upload-section">
                    <div className="section-heading">
                      <span className="eyebrow">HAVE A FRAME ALREADY?</span>
                      <Upload size={15} />
                    </div>
                    <label className="upload-label">
                      Choose a garment photo
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          if (e.target.files?.[0])
                            void fileSelected(e.target.files[0]).catch(() =>
                              setError("That image could not be opened."),
                            );
                        }}
                      />
                    </label>
                    <p className="fine">
                      For live recognition, upload a frame and click the
                      garment. The crop is sent to your configured AI provider
                      (OpenAI or Nosana) for recognition.
                    </p>
                    {upload && (
                      <button
                        className="upload-crop"
                        aria-label="Click the garment in the uploaded image"
                        onClick={(e) => {
                          const b = e.currentTarget.getBoundingClientRect();
                          setCrop({
                            dataUrl: upload,
                            selection: {
                              click: {
                                x: (e.clientX - b.left) / b.width,
                                y: (e.clientY - b.top) / b.height,
                              },
                              videoTime: 0,
                              locale: navigator.language,
                            },
                            capturedAt: Date.now(),
                          });
                          setUpload(null);
                        }}
                      >
                        <img src={upload} alt="Click the garment to identify" />
                        <Crosshair size={24} />
                      </button>
                    )}
                  </div>
                )}
              </aside>
            </div>
            <div className="journey-strip">
              <div>
                <span>01</span>
                <h3>Something catches your eye.</h3>
                <p>Select a piece in the video you’re watching.</p>
              </div>
              <div>
                <span>02</span>
                <h3>Find your kind of similar.</h3>
                <p>See the details behind each recommendation.</p>
              </div>
              <div>
                <span>03</span>
                <h3>See it on your own terms.</h3>
                <p>Explore the look in your private fitting room.</p>
              </div>
            </div>
          </>
        )}
      </main>
      <footer className="web-footer">
        <Brand />
        <span>Find your look. Keep your point of view.</span>
        <span>Made for the moments that inspire you.</span>
      </footer>
    </div>
  );
}
const root = createRoot(document.getElementById("root")!);
root.render(<App />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());

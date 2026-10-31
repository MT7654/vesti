import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LockKeyhole, Settings2 } from "lucide-react";
import { Brand, ErrorNotice } from "../../packages/ui/components";
import { Discovery, type Crop } from "../../packages/ui/Discovery";
import { API } from "../../packages/ui/api";
import "../../packages/ui/styles.css";
function Panel() {
  const [token, setToken] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false),
    [consent, setConsent] = useState(false),
    [crop, setCrop] = useState<Crop | null>(null),
    [error, setError] = useState(""),
    [selecting, setSelecting] = useState(false),
    [id, setId] = useState<string | undefined>(),
    [settings, setSettings] = useState(false);
  useEffect(() => {
    void Promise.all([
      chrome.storage.local.get(["token", "consent"]),
      chrome.storage.session.get([
        "crop",
        "captureError",
        "selecting",
        "searchId",
      ]),
    ]).then(([local, session]) => {
      setToken(local.token || null);
      setConsent(!!local.consent);
      setCrop(
        session.crop && Date.now() - session.crop.capturedAt < 300000
          ? session.crop
          : null,
      );
      setError(session.captureError || "");
      setSelecting(!!session.selecting);
      setId(session.searchId);
      setLoaded(true);
    });
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "session") {
        if (changes.crop) setCrop(changes.crop.newValue || null);
        if (changes.captureError) setError(changes.captureError.newValue || "");
        if (changes.selecting) setSelecting(!!changes.selecting.newValue);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    const timer = setInterval(() => {
      setCrop((c) => {
        if (c && Date.now() - c.capturedAt >= 300000) {
          void chrome.storage.session.remove("crop");
          return null;
        }
        return c;
      });
    }, 15000);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
      clearInterval(timer);
    };
  }, []);
  async function select() {
    const r = await chrome.runtime.sendMessage({ type: "SELECT_AGAIN" });
    if (r?.error) setError(r.error);
  }
  return (
    <div className="extension-shell">
      <header className="panel-header">
        <Brand />
        <button
          className="icon-button"
          aria-label="Connection settings"
          onClick={() => setSettings(!settings)}
        >
          <Settings2 size={18} />
        </button>
      </header>
      {settings && (
        <div className="notice">
          <p>API: {API}</p>
          <button
            className="text-button"
            onClick={() => {
              void chrome.storage.local.remove("token");
              setToken(null);
              setSettings(false);
            }}
          >
            Pair a new session
          </button>
        </div>
      )}
      <main>
        {!loaded ? (
          <p>Opening Vesti…</p>
        ) : !consent ? (
          <section className="consent">
            <span className="eyebrow">A little context</span>
            <h2>
              Good style starts
              <br />
              with a closer look.
            </h2>
            <p>
              Choose clothing in a YouTube video. Only the cropped video frame
              and click location are sent to Vesti’s recognition service.
            </p>
            <div className="privacy-note">
              <LockKeyhole size={20} />
              <p>
                Your webcam stays local. Camera access happens only in the
                fitting room, when you enable it.
              </p>
            </div>
            <button
              className="full"
              onClick={() => {
                setConsent(true);
                void chrome.storage.local.set({ consent: true });
                if (token) void select();
              }}
            >
              Got it. Let’s find a look.
            </button>
          </section>
        ) : (
          <>
            {error && (
              <ErrorNotice message={error} onDismiss={() => setError("")} />
            )}
            <Discovery
              token={token}
              onPaired={(t) => {
                setToken(t);
                void chrome.storage.local.set({ token: t });
                void select();
              }}
              crop={crop}
              onSelect={() => void select()}
              selecting={selecting}
              initialSearchId={id}
              onSearchId={(id) =>
                void chrome.storage.session.set({ searchId: id })
              }
              onHandoff={(url) => void chrome.tabs.create({ url })}
            />
          </>
        )}
      </main>
      <footer className="panel-footer">
        <LockKeyhole size={12} /> Your camera. Your browser. Your style.
      </footer>
    </div>
  );
}
const root = createRoot(document.getElementById("root")!);
root.render(<Panel />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());

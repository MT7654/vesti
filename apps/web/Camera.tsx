import { useEffect, useRef, useState } from "react";
import {
  drawGarment,
  drawForegroundHands,
  sleeveTips,
  cutoutAnchors,
} from "./garment-renderer";
import { Download, Pause, Play, Eye, SlidersHorizontal } from "lucide-react";
import { torsoFrame } from "../../packages/contracts/pose";
import {
  Camera as CameraIcon,
  CameraOff,
  FlipHorizontal2,
  LockKeyhole,
  ScanLine,
} from "lucide-react";
import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
type Anchors = {
  leftShoulder: number[];
  rightShoulder: number[];
  hem: number[];
};
type Props = {
  assetUrl: string | null;
  anchors?: Anchors;
  scale: number;
  offset: number;
  illustration: boolean;
  aiExtracted?: boolean;
  productTitle: string;
  merchant: string;
  category?: string;
  onMetrics?: (metrics: { fps: number; poseFps: number }) => void;
};
export function Camera({
  assetUrl,
  anchors,
  scale,
  offset,
  illustration,
  aiExtracted,
  productTitle,
  merchant,
  category,
  onMetrics,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    video = useRef<HTMLVideoElement | null>(null),
    stream = useRef<MediaStream | null>(null),
    model = useRef<PoseLandmarker | null>(null),
    frame = useRef(0),
    generation = useRef(0),
    asset = useRef<HTMLImageElement | null>(null),
    tips = useRef<{ x: number; y: number }[]>([]),
    calibratedAnchors = useRef<Anchors | undefined>(undefined),
    frozenRef = useRef(false),
    settings = useRef({
      scale,
      offset,
      mirror: true,
      anchors,
      followArms: true,
      showGarment: true,
      category,
    });
  const [enabled, setEnabled] = useState(false),
    [loading, setLoading] = useState(false),
    [mirror, setMirror] = useState(true),
    [status, setStatus] = useState("Your camera is off"),
    [error, setError] = useState(""),
    [frozen, setFrozen] = useState(false),
    [followArms, setFollowArms] = useState(true),
    [showGarment, setShowGarment] = useState(true),
    [aspect, setAspect] = useState(4 / 3);
  settings.current = {
    scale,
    offset,
    mirror,
    anchors,
    followArms,
    showGarment,
    category,
  };
  function stop() {
    generation.current++;
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) {
      video.current.pause();
      video.current.srcObject = null;
      video.current = null;
    }
    model.current?.close();
    model.current = null;
    frozenRef.current = false;
    setFrozen(false);
    setEnabled(false);
    setLoading(false);
    setStatus("Your camera is off");
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
  }
  useEffect(() => {
    if (!assetUrl) {
      asset.current = null;
      return;
    }
    const img = new Image();
    let alive = true;
    img.onload = () => {
      if (alive) {
        asset.current = img;
        tips.current = sleeveTips(img);
        calibratedAnchors.current = aiExtracted
          ? cutoutAnchors(img)
          : undefined;
      }
    };
    img.src = assetUrl;
    return () => {
      alive = false;
      asset.current = null;
    };
  }, [assetUrl, aiExtracted]);
  useEffect(() => {
    const close = () => stop();
    const hide = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("pagehide", close);
    document.addEventListener("visibilitychange", hide);
    return () => {
      stop();
      window.removeEventListener("pagehide", close);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  async function enable() {
    if (loading || enabled) return;
    setLoading(true);
    setError("");
    const gen = ++generation.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1440 },
          aspectRatio: { ideal: 4 / 3 },
          facingMode: "user",
        },
      });
      if (gen !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.srcObject = media;
      video.current = v;
      await v.play();
      setStatus("Loading local body tracking…");
      const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      const detector = await PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: "/mediapipe/pose_landmarker_lite.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.6,
        minPosePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      if (gen !== generation.current) {
        detector.close();
        return;
      }
      model.current = detector;
      setEnabled(true);
      setLoading(false);
      const c = canvas.current!,
        ctx = c.getContext("2d")!;
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      setAspect(c.width / c.height);
      let lastInference = 0,
        lastVideo = -1,
        lastReliable = 0,
        lastSmooth = 0,
        lastStatus = 0,
        metricStart = performance.now(),
        renders = 0,
        poses = 0;
      let smoothed: NormalizedLandmark[] | null = null,
        hint = "Estimating upper-body placement…";
      let trackedPose: NormalizedLandmark[] | undefined;
      function draw(now: number) {
        if (gen !== generation.current || !model.current) return;
        if (frozenRef.current) {
          frame.current = requestAnimationFrame(draw);
          return;
        }
        if (now - lastInference >= 66 && v.currentTime !== lastVideo) {
          lastInference = now;
          lastVideo = v.currentTime;
          try {
            const result = detector.detectForVideo(v, now);
            poses++;
            const raw = result.landmarks[0];
            trackedPose = raw?.map((p, i) => ({
              ...p,
              x: trackedPose ? trackedPose[i].x * 0.4 + p.x * 0.6 : p.x,
              y: trackedPose ? trackedPose[i].y * 0.4 + p.y * 0.6 : p.y,
            }));
            const fit = torsoFrame(raw, c.width / c.height);
            const shouldersVisible =
              !!raw && raw[11].visibility > 0.45 && raw[12].visibility > 0.45;
            if (shouldersVisible) lastReliable = now;
            const alpha = 1 - Math.exp(-(now - lastSmooth) / 90);
            if (shouldersVisible || !smoothed || now - lastReliable > 900)
              smoothed = smoothed
                ? fit.points.map((p, i) => ({
                    ...p,
                    x: smoothed![i].x + (p.x - smoothed![i].x) * alpha,
                    y: smoothed![i].y + (p.y - smoothed![i].y) * alpha,
                  }))
                : fit.points;
            lastSmooth = now;
            hint = fit.estimated
              ? "Upper-body preview · fine-tune the fit if needed"
              : "Tracking your upper body";
          } catch {
            hint = "Tracking paused. Stop and enable the camera to retry.";
          }
        }
        ctx.save();
        ctx.clearRect(0, 0, c.width, c.height);
        if (settings.current.mirror) {
          ctx.translate(c.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(v, 0, 0, c.width, c.height);
        if (smoothed && asset.current && settings.current.showGarment) {
          drawGarment(ctx, asset.current, smoothed, trackedPose, {
            ...settings.current,
            anchors: calibratedAnchors.current || settings.current.anchors,
            width: c.width,
            height: c.height,
            tips: tips.current,
            shortSleeves: settings.current.category === "tshirt",
          });
          drawForegroundHands(ctx, v, trackedPose, c.width, c.height);
        }
        ctx.restore();
        renders++;
        if (now - lastStatus > 350) {
          setStatus(hint);
          lastStatus = now;
        }
        if (now - metricStart > 1000) {
          const seconds = (now - metricStart) / 1000;
          onMetrics?.({
            fps: Math.round(renders / seconds),
            poseFps: Math.round(poses / seconds),
          });
          renders = 0;
          poses = 0;
          metricStart = now;
        }
        frame.current = requestAnimationFrame(draw);
      }
      frame.current = requestAnimationFrame(draw);
    } catch (e) {
      if (gen !== generation.current) return;
      stop();
      const name = (e as DOMException).name;
      setError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser’s site settings, then try again."
          : name === "NotFoundError"
            ? "No camera was found. Connect a webcam and try again."
            : name === "NotReadableError"
              ? "Your camera is busy. Close other apps using it and try again."
              : "The local camera or pose model could not start. Check that model assets were installed and try again.",
      );
    }
  }
  function toggleFreeze() {
    frozenRef.current = !frozenRef.current;
    setFrozen(frozenRef.current);
  }
  function downloadSnapshot() {
    const source = canvas.current;
    if (!source || !enabled || !asset.current) return;
    frozenRef.current = true;
    setFrozen(true);
    const out = document.createElement("canvas");
    out.width = source.width;
    out.height = source.height;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(source, 0, 0);
    const unit = out.width / 1200;
    const gradient = ctx.createLinearGradient(
      0,
      out.height * 0.65,
      0,
      out.height,
    );
    gradient.addColorStop(0, "#17122200");
    gradient.addColorStop(1, "#171222e8");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.fillStyle = "#e1ff75";
    ctx.font = "600 " + 22 * unit + "px system-ui";
    ctx.fillText("VESTI / THE FITTING ROOM", 36 * unit, 52 * unit);
    const title =
      productTitle.length > 58 ? productTitle.slice(0, 55) + "…" : productTitle;
    ctx.fillStyle = "white";
    ctx.font = "600 " + 30 * unit + "px system-ui";
    ctx.fillText(
      title,
      36 * unit,
      out.height - 85 * unit,
      out.width - 72 * unit,
    );
    ctx.fillStyle = "#eee8f5";
    ctx.font = 18 * unit + "px system-ui";
    ctx.fillText(merchant, 36 * unit, out.height - 53 * unit);
    ctx.font = 14 * unit + "px system-ui";
    ctx.fillText(
      illustration
        ? "Demo illustration · 2D appearance preview"
        : "2D appearance preview · not a fit prediction",
      36 * unit,
      out.height - 25 * unit,
    );
    out.toBlob((blob) => {
      if (!blob) {
        setError("The snapshot could not be saved. Please try again.");
        return;
      }
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "vesti-my-look.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }
  return (
    <section className="camera-section">
      <div
        className={`camera-stage ${enabled ? "is-live" : ""}`}
        style={{ aspectRatio: aspect }}
      >
        <canvas
          ref={canvas}
          aria-label="Live local camera with approximate garment overlay"
        />
        {!enabled && (
          <div className="camera-placeholder">
            <div className="frame-corner tl" />
            <div className="frame-corner tr" />
            <div className="frame-corner bl" />
            <div className="frame-corner br" />
            <div className="body-guide">
              <svg viewBox="0 0 200 240" aria-hidden="true">
                <circle cx="100" cy="42" r="29" />
                <path d="M54 98Q100 72 146 98L163 204 M54 98L37 204 M61 101L66 235 M139 101L134 235 M65 185H135" />
              </svg>
            </div>
            <span className="camera-icon">
              <CameraIcon size={25} />
            </span>
            <h2>
              Your own little
              <br />
              <em>fitting room.</em>
            </h2>
            <p>
              Step into the frame.
              <br />
              See how the look comes together.
            </p>
            <button onClick={() => void enable()} disabled={loading}>
              <CameraIcon size={16} />
              {loading ? "Starting local camera…" : "Enable camera"}
            </button>
            <span className="camera-privacy">
              <LockKeyhole size={12} /> Only you can see your camera.
            </span>
          </div>
        )}
        <span className="preview-label">
          {illustration ? "STYLE ILLUSTRATION" : "APPEARANCE PREVIEW"}
        </span>
        {enabled && (
          <span className="camera-live">
            <i /> {frozen ? "FRAME FROZEN" : "LIVE PREVIEW"}
          </span>
        )}
        {enabled && (
          <div className="look-caption">
            {assetUrl && <img src={assetUrl} alt="Selected garment" />}
            <div>
              <span>YOUR SELECTED LOOK</span>
              <strong>{productTitle}</strong>
              <small>{merchant}</small>
            </div>
          </div>
        )}
      </div>
      {enabled && (
        <div className="snapshot-actions">
          <button
            disabled={!assetUrl || !showGarment}
            onClick={downloadSnapshot}
          >
            <Download size={17} /> Save your look
          </button>
          <button className="secondary" onClick={toggleFreeze}>
            {frozen ? <Play size={16} /> : <Pause size={16} />}
            {frozen ? "Resume live" : "Freeze frame"}
          </button>
          <button
            className="secondary"
            disabled={frozen}
            aria-pressed={!showGarment}
            onClick={() => setShowGarment(!showGarment)}
          >
            <Eye size={16} />
            {showGarment ? "View original" : "Show garment"}
          </button>
        </div>
      )}
      <div className="camera-toolbar">
        <div className="camera-status" role="status">
          <ScanLine size={17} />
          <span>
            {frozen
              ? "Frame frozen. Save your look or resume the camera."
              : status}
          </span>
        </div>
        <div className="camera-actions">
          <button
            className="secondary"
            onClick={() => (enabled || loading ? stop() : void enable())}
          >
            {enabled || loading ? (
              <CameraOff size={16} />
            ) : (
              <CameraIcon size={16} />
            )}{" "}
            {enabled || loading ? "Stop camera" : "Enable camera"}
          </button>
          <button
            className={`secondary ${mirror ? "selected" : ""}`}
            disabled={frozen}
            aria-pressed={mirror}
            onClick={() => setMirror(!mirror)}
          >
            <FlipHorizontal2 size={16} /> Mirror
          </button>
        </div>
      </div>
      {enabled && (
        <label className="arm-control">
          <input
            type="checkbox"
            checked={followArms}
            disabled={frozen}
            onChange={(e) => setFollowArms(e.target.checked)}
          />
          <SlidersHorizontal size={14} /> Follow arm movement{" "}
          <span>Face forward for the cleanest preview.</span>
        </label>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

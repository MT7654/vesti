import { useEffect, useRef, useState } from "react";
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
  onMetrics?: (metrics: { fps: number; poseFps: number }) => void;
};
export function Camera({
  assetUrl,
  anchors,
  scale,
  offset,
  illustration,
  onMetrics,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    video = useRef<HTMLVideoElement | null>(null),
    stream = useRef<MediaStream | null>(null),
    model = useRef<PoseLandmarker | null>(null),
    frame = useRef(0),
    generation = useRef(0),
    asset = useRef<HTMLImageElement | null>(null),
    settings = useRef({ scale, offset, mirror: true, anchors });
  const [enabled, setEnabled] = useState(false),
    [loading, setLoading] = useState(false),
    [mirror, setMirror] = useState(true),
    [status, setStatus] = useState("Your camera is off"),
    [error, setError] = useState(""),
    [fps, setFps] = useState(0);
  settings.current = { scale, offset, mirror, anchors };
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
      if (alive) asset.current = img;
    };
    img.src = assetUrl;
    return () => {
      alive = false;
      asset.current = null;
    };
  }, [assetUrl]);
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
          width: { ideal: 640 },
          height: { ideal: 480 },
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
      function draw(now: number) {
        if (gen !== generation.current || !model.current) return;
        if (now - lastInference >= 66 && v.currentTime !== lastVideo) {
          lastInference = now;
          lastVideo = v.currentTime;
          try {
            const result = detector.detectForVideo(v, now);
            poses++;
            const fit = torsoFrame(result.landmarks[0], c.width / c.height);
            const alpha = 1 - Math.exp(-(now - lastSmooth) / 90);
            smoothed = smoothed
              ? fit.points.map((p, i) => ({
                  ...p,
                  x: smoothed![i].x + (p.x - smoothed![i].x) * alpha,
                  y: smoothed![i].y + (p.y - smoothed![i].y) * alpha,
                }))
              : fit.points;
            lastSmooth = now;
            lastReliable = now;
            hint = fit.estimated
              ? "Estimated upper-body placement · adjust scale and position"
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
        if (smoothed && asset.current) {
          // Source shoulders and hem define the affine torso frame. Hip midpoint supplies lean.
          const p = smoothed.map((p) => ({
            x: p.x * c.width,
            y: p.y * c.height,
          }));
          const left = p[1],
            right = p[0],
            hip = { x: (p[2].x + p[3].x) / 2, y: (p[2].y + p[3].y) / 2 },
            center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
          const a = settings.current.anchors || {
              leftShoulder: [0.28, 0.18],
              rightShoulder: [0.72, 0.18],
              hem: [0.5, 0.91],
            },
            img = asset.current;
          const sourceWidth =
              (a.rightShoulder[0] - a.leftShoulder[0]) * img.width,
            sourceHeight =
              (a.hem[1] - (a.leftShoulder[1] + a.rightShoulder[1]) / 2) *
              img.height;
          const s = settings.current.scale,
            xx = ((right.x - left.x) / sourceWidth) * s,
            xy = ((right.y - left.y) / sourceWidth) * s,
            yx = ((hip.x - center.x) / sourceHeight) * s,
            yy = ((hip.y - center.y) / sourceHeight) * s;
          const sourceX =
              ((a.leftShoulder[0] + a.rightShoulder[0]) / 2) * img.width,
            sourceY =
              ((a.leftShoulder[1] + a.rightShoulder[1]) / 2) * img.height;
          ctx.globalAlpha = 0.96;
          ctx.transform(
            xx,
            xy,
            yx,
            yy,
            center.x - xx * sourceX - yx * sourceY,
            center.y -
              xy * sourceX -
              yy * sourceY +
              settings.current.offset * c.height,
          );
          ctx.drawImage(img, 0, 0);
        }
        ctx.restore();
        renders++;
        if (now - lastStatus > 350) {
          setStatus(hint);
          lastStatus = now;
        }
        if (now - metricStart > 1000) {
          const seconds = (now - metricStart) / 1000;
          setFps(Math.round(renders / seconds));
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
  return (
    <section className="camera-section">
      <div className={`camera-stage ${enabled ? "is-live" : ""}`}>
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
            <i /> CAMERA ON · {fps} FPS
          </span>
        )}
      </div>
      <div className="camera-toolbar">
        <div className="camera-status" role="status">
          <ScanLine size={17} />
          <span>{status}</span>
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
            aria-pressed={mirror}
            onClick={() => setMirror(!mirror)}
          >
            <FlipHorizontal2 size={16} /> Mirror
          </button>
        </div>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

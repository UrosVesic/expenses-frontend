import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AttachPhoto from "./AttachPhoto.jsx";
import { importReceiptFromQr, isSufUrl } from "./api.js";
import ReceiptEditor from "./ReceiptEditor.jsx";
import ReceiptPreview from "./ReceiptPreview.jsx";

// Scans a fiscal receipt QR code with the camera and sends its verification URL to montra-api
// (POST /receipts), which fetches the SUF data server-side (the SUF host blocks browser CORS).
// Camera access needs a secure context (https or localhost).
export default function QrScannerButton({
  variant = "button",
  idToken,
  onToast,
  onImported,
}) {
  const [open, setOpen] = useState(false);
  if (variant === "fab") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Scan QR code"
          className="h-12 w-12 grid place-items-center rounded-full shadow-lg shadow-zinc-900/10 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 active:scale-95 transition-transform"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />
          </svg>
        </button>
        {open && (
          <ScannerDialog
            idToken={idToken}
            onToast={onToast}
            onImported={onImported}
            onClose={() => setOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-9 px-3 inline-flex items-center gap-2 text-sm font-medium rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />
        </svg>
        Scan QR
      </button>
      {open && (
        <ScannerDialog
          idToken={idToken}
          onToast={onToast}
          onImported={onImported}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// Dense fiscal QR codes need resolution: ask for 1080p (browsers fall back to what they have).
const SIZE = { width: { ideal: 1920 }, height: { ideal: 1080 } };
const SCAN_INTERVAL_MS = 150;
const DECODE_OPTIONS = { formats: ["QRCode"], tryHarder: true, tryInvert: true, maxNumberOfSymbols: 1 };

// ZXing (C++ -> wasm), loaded on demand; the .wasm is served by Vite, not a CDN.
let zxingPromise;
function loadZxing() {
  zxingPromise ??= Promise.all([
    import("zxing-wasm/reader"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]).then(([zxing, { default: wasmUrl }]) => {
    zxing.prepareZXingModule({
      overrides: { locateFile: (path) => (path.endsWith(".wasm") ? wasmUrl : path) },
    });
    return zxing;
  });
  return zxingPromise;
}

// Chrome on Android ships a native (ML Kit) QR detector that copes far better with blur and
// small codes than ZXing; Safari has none, so iPhones keep using ZXing.
async function createNativeDetector() {
  try {
    if (!("BarcodeDetector" in window)) return null;
    const formats = await window.BarcodeDetector.getSupportedFormats();
    return formats.includes("qr_code") ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
  } catch {
    return null;
  }
}

// Decode a frame/bitmap: native detector first, ZXing as fallback. Returns the text or null.
async function decode(source, detector, zxing, ctx) {
  if (detector) {
    try {
      const [hit] = await detector.detect(source);
      if (hit?.rawValue) return hit.rawValue;
    } catch {
      // fall through to ZXing
    }
  }
  const w = source.videoWidth ?? source.width;
  const h = source.videoHeight ?? source.height;
  ctx.canvas.width = w;
  ctx.canvas.height = h;
  ctx.drawImage(source, 0, 0, w, h); // raw (unmirrored) frame
  const [hit] = await zxing.readBarcodes(ctx.getImageData(0, 0, w, h), DECODE_OPTIONS);
  return hit?.isValid ? hit.text : null;
}

// Rear cameras, main lens first. Android exposes every lens ("camera2 0, facing back",
// "camera2 2, facing back" ...); facingMode alone often picks the ultra-wide, which has no
// autofocus and can't read a QR up close. Labels are only filled in after permission is granted.
async function rearCameras() {
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  const rear = devices.filter((d) => /back|rear|environment/i.test(d.label));
  const rank = (d) => (/ultra|wide|tele|macro|depth/i.test(d.label) ? 1 : 0);
  return (rear.length ? rear : devices).sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, undefined, { numeric: true }));
}

// Continuous autofocus and a little zoom (lets the phone stay far enough away to focus).
// Both are ignored as getUserMedia constraints; they must be applied to the track.
async function tuneTrack(track) {
  const caps = track.getCapabilities?.() ?? {};
  const advanced = {};
  if (caps.focusMode?.includes("continuous")) advanced.focusMode = "continuous";
  if (caps.zoom) advanced.zoom = Math.min(caps.zoom.max, Math.max(caps.zoom.min, 1.5));
  if (Object.keys(advanced).length) {
    try {
      await track.applyConstraints({ advanced: [advanced] });
    } catch {
      // best effort
    }
  }
}

const SECONDARY_BTN =
  "h-10 px-3 text-sm font-medium rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800";
const PRIMARY_BTN =
  "h-10 px-3 text-sm font-medium rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90";

const TONES = {
  success: { box: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200", icon: "bg-emerald-500 text-white", glyph: "✓" },
  error: { box: "bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200", icon: "bg-red-500 text-white", glyph: "!" },
  pending: { box: "bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200", icon: "border-2 border-zinc-300 border-t-zinc-700 dark:border-zinc-600 dark:border-t-zinc-200 animate-spin", glyph: "" },
};

function StatusCard({ tone, title, text, children }) {
  const t = TONES[tone];
  return (
    <div className={`flex gap-3 rounded-2xl p-4 ${t.box}`}>
      <span className={`h-7 w-7 shrink-0 grid place-items-center rounded-full text-sm font-bold ${t.icon}`}>{t.glyph}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {text && <p className="text-sm opacity-80 break-words">{text}</p>}
        {children}
      </div>
    </div>
  );
}

function ScannerDialog({ idToken, onToast, onImported, onClose }) {
  const videoRef = useRef(null);
  const photoRef = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [mirrored, setMirrored] = useState(false);
  const [resolution, setResolution] = useState(null);
  const [scanKey, setScanKey] = useState(0); // bump to scan again
  const [importState, setImportState] = useState(null); // { status: "saving" | "done" | "error", ... }
  const [cameras, setCameras] = useState([]); // rear cameras, for the "Switch camera" button
  const [cameraIndex, setCameraIndex] = useState(0);
  const [photoError, setPhotoError] = useState(null);

  useEffect(() => {
    if (result) return; // decoded (live or from a photo): camera off
    let cancelled = false;
    let stream = null;
    let timer = null;
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });

    const stop = () => {
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };

    (async () => {
      try {
        const [zxing, detector] = await Promise.all([loadZxing(), createNativeDetector()]);

        // first open: generic rear camera (also triggers the permission prompt), then switch to
        // the main lens once device labels are readable
        let list = cameras;
        if (!list.length) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, ...SIZE }, audio: false });
          if (cancelled) return stop();
          list = await rearCameras();
          if (!cancelled) setCameras(list);
        }
        const wanted = list[cameraIndex % (list.length || 1)];
        if (wanted && stream?.getVideoTracks()[0].getSettings().deviceId !== wanted.deviceId) {
          stop();
          stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: wanted.deviceId }, ...SIZE }, audio: false });
        }
        if (cancelled) return stop();

        const track = stream.getVideoTracks()[0];
        await tuneTrack(track);
        const settings = track.getSettings();
        setMirrored(settings.facingMode === "user"); // selfie/webcam preview feels natural mirrored
        setResolution(`${settings.width}×${settings.height}${detector ? " · native" : ""}`);

        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();

        const tick = async () => {
          if (cancelled) return;
          if (video.videoWidth && video.videoHeight) {
            try {
              const text = await decode(video, detector, zxing, ctx);
              if (text && !cancelled) {
                setResult(text);
                return stop();
              }
            } catch (e) {
              console.warn("QR decode error", e);
            }
          }
          timer = setTimeout(tick, SCAN_INTERVAL_MS);
        };
        tick();
      } catch (e) {
        if (!cancelled)
          setError(`Camera unavailable: ${e?.message ?? e}. Allow camera access (needs https or localhost), or take a photo instead.`);
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
    // cameras is filled by this effect itself; only a rescan or a camera switch restarts it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanKey, cameraIndex, result]);

  // Fallback: a still photo from the native camera app (proper autofocus, full resolution).
  const decodePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(null);
    try {
      const [zxing, detector, bitmap] = await Promise.all([loadZxing(), createNativeDetector(), createImageBitmap(file)]);
      const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      const text = await decode(bitmap, detector, zxing, ctx);
      bitmap.close();
      if (text) setResult(text);
      else setPhotoError("No QR code found in the photo. Get closer so the code fills most of the picture.");
    } catch (err) {
      setPhotoError(`Could not read the photo: ${err?.message ?? err}`);
    }
  };

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isReceipt = result != null && isSufUrl(result);
  const saving = isReceipt && !importState; // importState is cleared on "Scan again"

  useEffect(() => {
    if (!isReceipt) return;
    let cancelled = false;
    importReceiptFromQr(idToken, result)
      .then(({ receipt, created }) => {
        if (cancelled) return;
        const receiptId = receipt.id;
        setImportState({ status: "done", receiptId, created, receipt, editing: false });
        onToast?.({
          message: created
            ? "Receipt saved."
            : "This receipt was already saved.",
          type: "success",
        });
        if (created) onImported?.(receiptId);
      })
      .catch(
        (e) =>
          !cancelled &&
          setImportState({ status: "error", message: e?.message ?? String(e) }),
      );
    return () => {
      cancelled = true;
    };
    // onToast/onImported are callbacks from the parent; only a new scan should re-import
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, isReceipt, idToken]);

  // portal to <body>: the mobile FAB wrapper is its own stacking context (z-40), below the tab bar
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-base font-semibold">Scan receipt</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Fiscal QR code</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-9 w-9 grid place-items-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-100"
          >
            ✕
          </button>
        </div>

        <div className={`relative mx-5 overflow-hidden rounded-2xl bg-black aspect-square ${result || error ? "hidden" : ""}`}>
          <video
            ref={videoRef}
            className={`w-full h-full object-cover ${mirrored ? "-scale-x-100" : ""}`}
            muted
            playsInline
          />
          {/* viewfinder */}
          <div className="pointer-events-none absolute inset-[12%]">
            {["top-0 left-0 border-t-4 border-l-4 rounded-tl-xl", "top-0 right-0 border-t-4 border-r-4 rounded-tr-xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl"].map((c) => (
              <span key={c} className={`absolute h-10 w-10 border-white/90 ${c}`} />
            ))}
          </div>
          {resolution && (
            <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white/80">{resolution}</span>
          )}
        </div>

        <div className="px-5 pt-4 pb-5 space-y-4">
          {!result && !error && (
            <p className="text-sm text-center text-zinc-500 dark:text-zinc-400">
              Fill the frame with the QR code and hold steady.
            </p>
          )}
          {!result && (
            <div className="grid grid-flow-col auto-cols-fr gap-2">
              {!error && cameras.length > 1 && (
                <button type="button" onClick={() => setCameraIndex((i) => (i + 1) % cameras.length)} className={SECONDARY_BTN}>
                  Switch camera {(cameraIndex % cameras.length) + 1}/{cameras.length}
                </button>
              )}
              <button type="button" onClick={() => photoRef.current?.click()} className={SECONDARY_BTN}>
                Take a photo instead
              </button>
              <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={decodePhoto} />
            </div>
          )}
          {photoError && !result && <StatusCard tone="error" title="No QR code found" text={photoError} />}
          {error && <StatusCard tone="error" title="Camera unavailable" text={error} />}

          {result && !isReceipt && (
            <StatusCard tone="error" title="Not a fiscal receipt" text={`Expected a link to suf.purs.gov.rs. Scanned: ${result}`}>
              <button type="button" onClick={() => navigator.clipboard?.writeText(result)} className="mt-2 text-xs font-medium underline">
                Copy scanned text
              </button>
            </StatusCard>
          )}
          {saving && <StatusCard tone="pending" title="Saving receipt…" text="Fetching the receipt from the tax authority." />}
          {importState?.status === "done" && (
            <>
              <StatusCard
                tone="success"
                title={importState.created ? "Receipt saved" : "Already saved"}
                text={importState.created ? "It now shows up in your expenses." : "You scanned this receipt before."}
              />
              {importState.editing ? (
                <ReceiptEditor
                  receipt={importState.receipt}
                  onCancel={() => setImportState((s) => ({ ...s, editing: false }))}
                  onSaved={(updated) => {
                    setImportState((s) => ({ ...s, receipt: updated, editing: false }));
                    onToast?.({ message: "Receipt updated.", type: "success" });
                    onImported?.(updated.id);
                  }}
                />
              ) : (
                <ReceiptPreview
                  receipt={importState.receipt}
                  onEdit={() => setImportState((s) => ({ ...s, editing: true }))}
                />
              )}
              <AttachPhoto idToken={idToken} receiptId={importState.receiptId} onToast={onToast} />
            </>
          )}
          {importState?.status === "error" && <StatusCard tone="error" title="Could not save the receipt" text={importState.message} />}

          {(result || error) && !saving && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setImportState(null);
                  setPhotoError(null);
                  setError(null);
                  setScanKey((k) => k + 1);
                }}
                className={SECONDARY_BTN}
              >
                Scan another
              </button>
              <button type="button" onClick={onClose} className={PRIMARY_BTN}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

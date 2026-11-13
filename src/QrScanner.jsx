import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AttachPhoto from "./AttachPhoto.jsx";
import { importReceiptFromQr, isSufUrl } from "./api.js";

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
const VIDEO_CONSTRAINTS = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  focusMode: { ideal: "continuous" },
};
const SCAN_INTERVAL_MS = 150;

function ScannerDialog({ idToken, onToast, onImported, onClose }) {
  const videoRef = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [mirrored, setMirrored] = useState(false);
  const [resolution, setResolution] = useState(null);
  const [scanKey, setScanKey] = useState(0); // bump to scan again
  const [importState, setImportState] = useState(null); // { status: "saving" | "done" | "error", ... }

  useEffect(() => {
    let cancelled = false;
    let stream = null;
    let timer = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const stop = () => {
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };

    (async () => {
      try {
        // ZXing (C++ -> wasm), loaded on demand; the .wasm is served by Vite, not a CDN
        const [{ readBarcodes, prepareZXingModule }, { default: wasmUrl }] =
          await Promise.all([
            import("zxing-wasm/reader"),
            import("zxing-wasm/reader/zxing_reader.wasm?url"),
          ]);
        prepareZXingModule({
          overrides: {
            locateFile: (path) => (path.endsWith(".wasm") ? wasmUrl : path),
          },
        });

        stream = await navigator.mediaDevices.getUserMedia({
          video: VIDEO_CONSTRAINTS,
          audio: false,
        });
        if (cancelled) return stop();
        const settings = stream.getVideoTracks()[0].getSettings();
        setMirrored(settings.facingMode !== "environment"); // selfie/webcam preview feels natural mirrored
        setResolution(`${settings.width}×${settings.height}`);

        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();

        const tick = async () => {
          if (cancelled) return;
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (w && h) {
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h); // raw (unmirrored) frame
            try {
              const [hit] = await readBarcodes(ctx.getImageData(0, 0, w, h), {
                formats: ["QRCode"],
                tryHarder: true,
                maxNumberOfSymbols: 1,
              });
              if (hit?.isValid && !cancelled) {
                setResult(hit.text);
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
          setError(
            `Camera unavailable: ${e?.message ?? e}. Allow camera access (needs https or localhost).`,
          );
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [scanKey]);

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
      .then(({ receiptId, created }) => {
        if (cancelled) return;
        setImportState({ status: "done", receiptId, created });
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
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">Scan QR code</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-7 w-7 grid place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        <div
          className={`bg-black aspect-square ${result || error ? "hidden" : ""}`}
        >
          <video
            ref={videoRef}
            className={`w-full h-full object-cover ${mirrored ? "-scale-x-100" : ""}`}
            muted
            playsInline
          />
        </div>

        <div className="p-4 space-y-3">
          {!result && !error && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Point the camera at the receipt's QR code. Fill most of the frame
              and keep it sharp.
              {resolution && (
                <span className="block text-xs mt-1">Camera: {resolution}</span>
              )}
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          {result && (
            <>
              {!isReceipt && (
                <>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    This is not a fiscal receipt QR code (expected a link to{" "}
                    {"suf.purs.gov.rs"}).
                  </p>
                  <p className="text-sm break-all rounded-md bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-2 font-mono">
                    {result}
                  </p>
                </>
              )}
              {saving && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Saving receipt…
                </p>
              )}
              {importState?.status === "done" && (
                <p className="text-sm text-green-700 dark:text-green-400">
                  {importState.created
                    ? "Receipt saved."
                    : "This receipt was already saved."}
                </p>
              )}
              {importState?.status === "done" && (
                <AttachPhoto idToken={idToken} receiptId={importState.receiptId} onToast={onToast} />
              )}
              {importState?.status === "error" && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  Could not save the receipt: {importState.message}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(result)}
                  className="h-8 px-3 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Copy
                </button>
              </div>
            </>
          )}
          {(result || error) && !saving && (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setImportState(null);
                setError(null);
                setScanKey((k) => k + 1);
              }}
              className="text-sm text-zinc-600 dark:text-zinc-300 hover:underline"
            >
              Scan again
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

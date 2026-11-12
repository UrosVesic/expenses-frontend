import { useEffect, useRef, useState } from "react";

// Scans a QR code with the camera, then calls the scanned URL directly from the browser with
// `Accept: application/json` and shows the response. Nothing is sent to montra-api yet.
// Camera access needs a secure context (https or localhost).
export default function QrScannerButton({ variant = "button" }) {
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
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />
          </svg>
        </button>
        {open && <ScannerDialog onClose={() => setOpen(false)} />}
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />
        </svg>
        Scan QR
      </button>
      {open && <ScannerDialog onClose={() => setOpen(false)} />}
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

// GET the scanned URL asking for JSON. A browser blocks the response (fetch throws a bare
// TypeError, no status) unless the server sends Access-Control-Allow-Origin for our origin.
async function fetchReceiptJson(url, signal) {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
    const text = await res.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON: keep the raw text so it can be inspected
    }
    return { ok: res.ok, status: res.status, contentType: res.headers.get("content-type"), body };
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    return { ok: false, status: null, error: "Request blocked or failed. Most likely CORS: the server does not allow this origin." };
  }
}

function ScannerDialog({ onClose }) {
  const videoRef = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [mirrored, setMirrored] = useState(false);
  const [resolution, setResolution] = useState(null);
  const [scanKey, setScanKey] = useState(0); // bump to scan again
  const [response, setResponse] = useState(null); // outcome of calling the scanned URL

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
        const [{ readBarcodes, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
          import("zxing-wasm/reader"),
          import("zxing-wasm/reader/zxing_reader.wasm?url"),
        ]);
        prepareZXingModule({ overrides: { locateFile: (path) => (path.endsWith(".wasm") ? wasmUrl : path) } });

        stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS, audio: false });
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
        if (!cancelled) setError(`Camera unavailable: ${e?.message ?? e}. Allow camera access (needs https or localhost).`);
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

  const isUrl = result && /^https?:\/\//i.test(result);
  const fetching = isUrl && !response; // response is cleared on "Scan again"

  useEffect(() => {
    if (!isUrl) return;
    const controller = new AbortController();
    fetchReceiptJson(result, controller.signal)
      .then(setResponse)
      .catch(() => {}); // aborted
    return () => controller.abort();
  }, [result, isUrl]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 sm:p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">
            Scan QR code <span className="ml-1 text-xs font-normal text-zinc-500">(test)</span>
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="h-7 w-7 grid place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            ✕
          </button>
        </div>

        <div className={`bg-black aspect-square ${result || error ? "hidden" : ""}`}>
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
              Point the camera at the receipt's QR code. Fill most of the frame and keep it sharp.
              {resolution && <span className="block text-xs mt-1">Camera: {resolution}</span>}
            </p>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {result && (
            <>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Decoded</p>
              <p className="text-sm break-all rounded-md bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-2 font-mono">{result}</p>
              {isUrl && fetching && <p className="text-sm text-zinc-500 dark:text-zinc-400">Fetching receipt data…</p>}
              {response && (
                <>
                  <p className={`text-xs font-medium ${response.ok ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    Response{response.status ? ` ${response.status}` : ""}
                    {response.contentType ? ` · ${response.contentType}` : ""}
                  </p>
                  <pre className="text-xs max-h-60 overflow-auto rounded-md bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-2 font-mono whitespace-pre-wrap break-all">
                    {response.error ?? (typeof response.body === "string" ? response.body : JSON.stringify(response.body, null, 2))}
                  </pre>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {isUrl && (
                  <a href={result} target="_blank" rel="noopener noreferrer" className="h-8 px-3 inline-flex items-center text-sm rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
                    Open link
                  </a>
                )}
                <button type="button" onClick={() => navigator.clipboard?.writeText(result)} className="h-8 px-3 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                  Copy
                </button>
              </div>
            </>
          )}
          {(result || error) && (
            <button type="button" onClick={() => {
                setResult(null);
                setResponse(null);
                setError(null);
                setScanKey((k) => k + 1);
              }} className="text-sm text-zinc-600 dark:text-zinc-300 hover:underline">
              Scan again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

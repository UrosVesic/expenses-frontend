import { useEffect, useRef, useState } from "react";
import PhotoLightbox from "./PhotoLightbox.jsx";
import { ATTACHMENT_TYPES, requestAttachmentUpload, uploadToS3 } from "./api.js";

const BTN =
  "h-20 flex flex-col items-center justify-center gap-1.5 text-sm font-medium rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50";
const ICON = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

// After a QR receipt is saved: optionally attach a photo (camera) or an existing file.
// POST /receipts/{id}/attachment -> presigned PUT -> upload. The photo shows up once S3 reports it.
export default function AttachPhoto({ idToken, receiptId, onToast }) {
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  const [status, setStatus] = useState("ask"); // ask | uploading | done | skipped | error
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null); // { url (local object URL), isPdf, name }
  const [fullView, setFullView] = useState(false);

  // the preview uses the local file, so no extra request; free it when replaced/unmounted
  useEffect(() => () => preview && URL.revokeObjectURL(preview.url), [preview]);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ATTACHMENT_TYPES.includes(file.type)) {
      setStatus("error");
      setError(`Unsupported file type ${file.type || "(unknown)"}. Use JPEG, PNG or PDF.`);
      return;
    }
    setStatus("uploading");
    setError(null);
    try {
      const { uploadUrl } = await requestAttachmentUpload(idToken, receiptId, file.type);
      await uploadToS3(uploadUrl, file, file.type);
      setPreview({ url: URL.createObjectURL(file), isPdf: file.type === "application/pdf", name: file.name });
      setStatus("done");
      onToast?.({ message: "Photo attached.", type: "success" });
    } catch (err) {
      setStatus("error");
      setError(err.message);
    }
  };

  if (status === "skipped") return null;
  if (status === "done" && preview) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-3">
        {preview.isPdf ? (
          <a
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
            className="h-20 w-16 shrink-0 grid place-items-center rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-300"
          >
            PDF
          </a>
        ) : (
          <button type="button" onClick={() => setFullView(true)} aria-label="View photo" className="shrink-0">
            <img src={preview.url} alt="Attached receipt" className="h-20 w-16 object-cover rounded-lg border border-zinc-200 dark:border-zinc-700" />
          </button>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Photo attached</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{preview.name}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{preview.isPdf ? "Tap to open" : "Tap to view full size"}</p>
        </div>
        {fullView && <PhotoLightbox url={preview.url} onClose={() => setFullView(false)} />}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4">
      <div>
        <p className="text-sm font-semibold">Add a photo of the receipt?</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Optional. Handy for returns and warranties.</p>
      </div>
      {status === "uploading" && <p className="text-sm text-zinc-500 dark:text-zinc-400">Uploading…</p>}
      {status === "error" && <p className="text-sm text-red-600 dark:text-red-400">Upload failed: {error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={BTN} disabled={status === "uploading"} onClick={() => cameraRef.current?.click()}>
          <svg {...ICON}>
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          Take photo
        </button>
        <button type="button" className={BTN} disabled={status === "uploading"} onClick={() => fileRef.current?.click()}>
          <svg {...ICON}>
            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <path d="M14 3v6h6M12 18v-6M9 15l3-3 3 3" />
          </svg>
          Choose file
        </button>
      </div>
      <button
        type="button"
        disabled={status === "uploading"}
        onClick={() => setStatus("skipped")}
        className="w-full text-center text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        Skip
      </button>
      {/* explicit JPEG/PNG makes iOS convert HEIC to JPEG */}
      <input ref={cameraRef} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden" onChange={upload} />
      <input ref={fileRef} type="file" accept={ATTACHMENT_TYPES.join(",")} className="hidden" onChange={upload} />
    </div>
  );
}

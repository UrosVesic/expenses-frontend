import { useRef, useState } from "react";
import { ATTACHMENT_TYPES, requestAttachmentUpload, uploadToS3 } from "./api.js";

const BTN =
  "h-9 px-3 inline-flex items-center justify-center text-sm font-medium rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50";

// After a QR receipt is saved: optionally attach a photo (camera) or an existing file.
// POST /receipts/{id}/attachment -> presigned PUT -> upload. The photo shows up once S3 reports it.
export default function AttachPhoto({ idToken, receiptId, onToast }) {
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  const [status, setStatus] = useState("ask"); // ask | uploading | done | skipped | error
  const [error, setError] = useState(null);

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
      setStatus("done");
      onToast?.({ message: "Photo attached.", type: "success" });
    } catch (err) {
      setStatus("error");
      setError(err.message);
    }
  };

  if (status === "skipped") return null;
  if (status === "done") return <p className="text-sm text-green-700 dark:text-green-400">Photo attached.</p>;

  return (
    <div className="space-y-2 rounded-md border border-zinc-200 dark:border-zinc-700 p-3">
      <p className="text-sm font-medium">Attach a photo of this receipt?</p>
      {status === "uploading" && <p className="text-sm text-zinc-500 dark:text-zinc-400">Uploading…</p>}
      {status === "error" && <p className="text-sm text-red-600 dark:text-red-400">Upload failed: {error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BTN} disabled={status === "uploading"} onClick={() => cameraRef.current?.click()}>
          Take photo
        </button>
        <button type="button" className={BTN} disabled={status === "uploading"} onClick={() => fileRef.current?.click()}>
          Choose file
        </button>
        <button type="button" className={`${BTN} border-transparent`} disabled={status === "uploading"} onClick={() => setStatus("skipped")}>
          No thanks
        </button>
      </div>
      {/* explicit JPEG/PNG makes iOS convert HEIC to JPEG */}
      <input ref={cameraRef} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden" onChange={upload} />
      <input ref={fileRef} type="file" accept={ATTACHMENT_TYPES.join(",")} className="hidden" onChange={upload} />
    </div>
  );
}

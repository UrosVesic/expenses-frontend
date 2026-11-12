import { useRef, useState } from "react";
import { useAuth } from "react-oidc-context";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  requestUploadUrl,
  uploadToS3,
  requestDownloadUrl,
} from "./api.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Renders the first page of a PDF to a PNG blob (OCR works on images only).
async function pdfToImageBlob(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: canvas.getContext("2d"),
    viewport,
  }).promise;

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PDF conversion failed"))),
      "image/png",
    ),
  );
}

export default function ReceiptUpload({ variant = "button", onToast }) {
  const auth = useAuth();
  const inputRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  // files uploaded in this session: { fileId: "<uuid>.<ext>", name: "original name" }
  const [uploads, setUploads] = useState([]);

  const idToken = auth.user?.id_token;

  const handleFileChange = async (e) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;

    setStatus("uploading");
    setError(null);

    try {
      const isPdf = picked.type === "application/pdf";
      const body = isPdf ? await pdfToImageBlob(picked) : picked;
      const contentType = isPdf ? "image/png" : picked.type;

      const { url, fileId, headers } = await requestUploadUrl(idToken, contentType);
      await uploadToS3(url, body, contentType, headers);

      setUploads((prev) => [{ fileId, name: picked.name }, ...prev]);
      setStatus("success");
      onToast?.({ message: "Receipt uploaded. It will appear shortly.", type: "success" });
    } catch (err) {
      setStatus("error");
      setError(err.message);
      onToast?.({ message: "Upload failed. Please try again.", type: "error" });
    }
  };

  const handleDownload = async (fileId) => {
    setError(null);
    try {
      const { url } = await requestDownloadUrl(idToken, fileId);
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    } catch (err) {
      setStatus("error");
      setError(err.message);
    }
  };

  if (variant === "fab") {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={status === "uploading"}
          aria-label="Upload receipt"
          className={`h-14 w-14 grid place-items-center rounded-full shadow-lg shadow-zinc-900/20 bg-zinc-900 text-white active:scale-95 transition-transform dark:bg-zinc-100 dark:text-zinc-900 ${
            status === "uploading" ? "animate-pulse" : ""
          }`}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
          </svg>
        </button>
      </>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status === "uploading"}
        className="h-9 px-4 inline-flex items-center gap-2 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
        </svg>
        {status === "uploading" ? "Uploading…" : "Upload receipt"}
      </button>
      {status === "success" && uploads[0] && (
        <button
          type="button"
          onClick={() => handleDownload(uploads[0].fileId)}
          title={`Open ${uploads[0].name}`}
          className="text-sm text-emerald-700 dark:text-emerald-400 hover:underline"
        >
          Uploaded
        </button>
      )}
      {status === "error" && (
        <span className="text-sm text-red-600 dark:text-red-400" title={error}>Upload failed</span>
      )}
    </div>
  );
}

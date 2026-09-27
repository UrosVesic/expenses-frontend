import { useRef, useState } from "react";
import { useAuth } from "react-oidc-context";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const UPLOAD_URL =
  "https://w7mca3haxa.execute-api.eu-central-1.amazonaws.com/prod";

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function pdfToImageDataUrl(file) {
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

  return canvas.toDataURL("image/png");
}

export default function ReceiptUpload() {
  const auth = useAuth();
  const inputRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setStatus("uploading");
    setError(null);

    try {
      const image =
        file.type === "application/pdf"
          ? await pdfToImageDataUrl(file)
          : await fileToDataUrl(file);

      const res = await fetch(UPLOAD_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.user?.id_token}`,
        },
        body: JSON.stringify({ image }),
      });

      if (!res.ok) {
        throw new Error(`Upload failed with status ${res.status}`);
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err.message);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={status === "uploading"}
      >
        {status === "uploading" ? "Uploading…" : "Upload receipt"}
      </button>
      {status === "success" && (
        <span style={{ color: "#2fb344", fontSize: 14 }}>Uploaded ✓</span>
      )}
      {status === "error" && (
        <span style={{ color: "#ff3b3b", fontSize: 14 }}>{error}</span>
      )}
    </div>
  );
}

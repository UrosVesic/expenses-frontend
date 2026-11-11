import { useEffect } from "react";

// Full-screen viewer for a receipt photo. Closes on the backdrop, the button or Escape.
export default function PhotoLightbox({ url, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full bg-white/10 px-3 py-1 text-white hover:bg-white/20"
        aria-label="Close"
      >
        ✕
      </button>
      <img
        src={url}
        alt="Receipt"
        className="max-h-full max-w-full rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

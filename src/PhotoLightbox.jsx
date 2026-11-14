import { useEffect } from "react";
import { createPortal } from "react-dom";

// Full-screen viewer for a receipt photo. Closes on the backdrop, the button or Escape.
export default function PhotoLightbox({ url, onClose }) {
  useEffect(() => {
    // capture phase + stopImmediatePropagation: Escape closes only the lightbox, not a dialog under it
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // portal: may be opened from inside another dialog
  return createPortal(
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/80 p-4"
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
    </div>,
    document.body,
  );
}

import { useEffect } from "react";

const TYPE_CLASSES = {
  info: "border-zinc-200 dark:border-zinc-700",
  success: "border-l-4 border-l-emerald-500 border-zinc-200 dark:border-zinc-700",
  error: "border-l-4 border-l-red-500 border-zinc-200 dark:border-zinc-700",
  warning: "border-l-4 border-l-amber-500 border-zinc-200 dark:border-zinc-700",
};

export default function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      className={`fixed z-[60] left-4 right-4 bottom-[calc(9rem+env(safe-area-inset-bottom))] lg:left-auto lg:right-4 lg:bottom-4 px-4 py-3 text-sm rounded-xl border shadow-lg bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 ${
        TYPE_CLASSES[toast.type] || TYPE_CLASSES.info
      }`}
    >
      {toast.message}
    </div>
  );
}

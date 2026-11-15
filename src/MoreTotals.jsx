import { formatTotalsList } from "./currency.js";

const ALIGN = { left: "left-0", center: "left-1/2 -translate-x-1/2", right: "right-0" };

// "+N more" badge for totals that have more than `max` currencies. Hover, focus or tap opens a
// popover with every currency. Renders nothing when everything already fits.
export default function MoreTotals({ byCurrency, currency, max, align = "left", className = "" }) {
  const all = formatTotalsList(byCurrency, currency);
  if (all.length <= max) return null;
  return (
    <span className="group relative inline-block pointer-events-auto">
      <span
        tabIndex={0}
        className={`cursor-default rounded-md px-1.5 py-0.5 text-xs font-medium bg-zinc-500/15 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${className}`}
      >
        +{all.length - max} more
      </span>
      <span
        role="tooltip"
        className={`invisible group-hover:visible group-focus-within:visible absolute z-30 top-full mt-1 ${ALIGN[align]} whitespace-nowrap rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-lg px-3 py-2 text-sm font-medium flex flex-col gap-0.5`}
      >
        {all.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </span>
    </span>
  );
}

import { useState } from "react";
import { formatDin } from "./api.js";

// Ranked list of every group (not just the chart's big slices), with search.
export default function GroupList({ data, selected, onPick, maxHeightClass = "max-h-72" }) {
  const [query, setQuery] = useState("");
  const total = data.reduce((sum, g) => sum + g.totalAmount, 0);
  const q = query.trim().toLowerCase();
  const rows = [...data]
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .filter((g) => !q || (g.label ?? g.group).toLowerCase().includes(q));

  return (
    <div>
      {data.length > 6 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${data.length} entries…`}
          className="w-full mb-3 px-3 py-2 text-base sm:text-sm border border-zinc-300 dark:border-zinc-600 rounded-xl bg-white dark:bg-zinc-700 focus:ring-2 focus:ring-zinc-400 focus:border-transparent"
        />
      )}
      <ul className={`${maxHeightClass} overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-700`}>
        {rows.map((g) => (
          <li key={g.group}>
            <button
              type="button"
              onClick={() => onPick(g.group)}
              className={`w-full flex items-center justify-between gap-3 px-2 py-3 lg:py-2 text-left text-sm rounded-lg transition-colors duration-150 hover:bg-zinc-50 dark:hover:bg-zinc-700 ${
                selected === g.group ? "bg-zinc-100 dark:bg-zinc-800" : ""
              }`}
            >
              <span className="truncate text-zinc-800 dark:text-zinc-200">{g.label ?? g.group}</span>
              <span className="shrink-0 text-right">
                <span className="font-medium text-zinc-900 dark:text-white">{formatDin(g.totalAmount)}</span>
                <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {total > 0 ? ((g.totalAmount / total) * 100).toFixed(1) : 0}%
                  {g.receiptCount != null && ` · ${g.receiptCount}`}
                </span>
              </span>
            </button>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">No matches</li>
        )}
      </ul>
    </div>
  );
}

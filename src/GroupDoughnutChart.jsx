import { useRef, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import MoreTotals from "./MoreTotals.jsx";
import { formatTotalsList, mergeByCurrency, useDisplayCurrency } from "./currency.js";
import { groupSmallSlices } from "./groups.js";
import GroupList from "./GroupList.jsx";

const COLORS = [
  "#2563eb",
  "#0d9488",
  "#d97706",
  "#db2777",
  "#7c3aed",
  "#65a30d",
  "#0891b2",
  "#dc2626",
  "#a1a1aa",
  "#4f46e5",
];

export default function GroupDoughnutChart({
  title,
  data,
  loading,
  selected,
  onSliceClick,
  className = "",
}) {
  const currency = useDisplayCurrency();
  // hovered slice is shown in the donut centre instead of a floating tooltip
  // (mouse only: on touch screens a tap fires a sticky mouseenter that iOS treats as a
  // hover step, swallowing the next tap)
  const [hovered, setHovered] = useState(null);
  const canHover = typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches;
  // touch: long-press a slice to preview it in the centre (released = back to total, no click)
  const pressTimer = useRef(null);
  const longPressed = useRef(false);
  const startPress = (entry) => {
    longPressed.current = false;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setHovered(entry.group);
    }, 400);
  };
  const endPress = () => {
    clearTimeout(pressTimer.current);
    setHovered(null);
  };
  const grouped = data.length > 0 ? groupSmallSlices(data) : [];
  const totals = mergeByCurrency(data.map((g) => g.byCurrency));
  const hoveredSlice = grouped.find((g) => g.group === hovered);
  const centerTotals = hoveredSlice ? hoveredSlice.byCurrency : totals;
  // list rows reuse the slice colour (groups merged into "Other" get Other's colour)
  const colors = new Map();
  grouped.forEach((slice, i) => {
    const color = COLORS[i % COLORS.length];
    colors.set(slice.group, color);
    slice.members?.forEach((m) => colors.set(m.group, color));
  });

  return (
    <section className={`rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm ${className}`}>
      <h2 className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 rounded-t-2xl text-sm font-semibold">{title}</h2>
      <div className="p-4 sm:p-5">
        {/* no iOS callout / text selection / context menu while long-pressing */}
        <div
          className="relative h-60 sm:h-64 select-none [-webkit-touch-callout:none]"
          onContextMenu={(e) => e.preventDefault()}
        >
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="animate-pulse w-56 h-56 rounded-full border-[36px] border-zinc-100 dark:border-zinc-800" />
            </div>
          )}

          {!loading && grouped.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 dark:text-zinc-400">
              <p className="text-sm font-medium">No expenses this month</p>
              <p className="text-sm">Upload a receipt to get started</p>
            </div>
          )}

          {!loading && grouped.length > 0 && (
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={grouped}
                  dataKey="totalAmount"
                  nameKey="group"
                  innerRadius="68%"
                  outerRadius="100%"
                  paddingAngle={1}
                  stroke="var(--bg)"
                  onClick={(entry) => {
                    if (longPressed.current) {
                      longPressed.current = false; // the click that ends a long-press
                      return;
                    }
                    onSliceClick(entry.group, entry.members);
                  }}
                  onTouchStart={(entry) => startPress(entry)}
                  onTouchEnd={endPress}
                  onTouchMove={() => !longPressed.current && clearTimeout(pressTimer.current)}
                  onTouchCancel={endPress}
                  cursor="pointer"
                  onMouseEnter={canHover ? (entry) => setHovered(entry.group) : undefined}
                  onMouseLeave={canHover ? () => setHovered(null) : undefined}
                  // both charts stay mounted and the hidden one is display:none, so the
                  // sweep animation would replay on every tab switch (janky on phones)
                  isAnimationActive={false}
                >
                  {grouped.map((entry, index) => (
                    <Cell key={entry.group} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}

          {!loading && grouped.length > 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 text-center px-12 truncate max-w-full">
                {hoveredSlice ? hoveredSlice.label ?? hoveredSlice.group : "Total"}
              </span>
              <span className="text-lg font-semibold text-center px-10 leading-tight">{formatTotalsList(centerTotals, currency)[0]}</span>
              <MoreTotals byCurrency={centerTotals} currency={currency} max={1} align="center" className="mt-1 text-zinc-500 dark:text-zinc-400" />
            </div>
          )}
        </div>

        {!loading && data.length > 0 && (
          <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
              All ({data.length})
            </h3>
            <GroupList
              data={data}
              selected={selected}
              colors={colors}
              onPick={(group) => onSliceClick(group)}
            />
          </div>
        )}
      </div>
    </section>
  );
}

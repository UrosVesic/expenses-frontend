import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatDin } from "./api.js";
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
  const grouped = data.length > 0 ? groupSmallSlices(data) : [];
  // labels come from the API; the raw group is the key used for clicks
  const labelOf = (group) => grouped.find((g) => g.group === group)?.label ?? group;

  return (
    <section className={`rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm ${className}`}>
      <h2 className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 rounded-t-2xl text-sm font-semibold">{title}</h2>
      <div className="p-4 sm:p-5">
        <div className="relative h-72 sm:h-80">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
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
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={1}
                  stroke="var(--bg)"
                  onClick={(entry) => onSliceClick(entry.group, entry.members)}
                  cursor="pointer"
                >
                  {grouped.map((entry, index) => (
                    <Cell key={entry.group} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [formatDin(value), labelOf(name)]}
                  contentStyle={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Legend
                  onClick={(entry) => {
                    const slice = grouped.find((g) => g.group === entry.value);
                    onSliceClick(entry.value, slice?.members);
                  }}
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span className="text-xs text-zinc-600 dark:text-zinc-300">{labelOf(value)}</span>
                  )}
                  wrapperStyle={{ cursor: "pointer", lineHeight: "1.75" }}
                />
              </PieChart>
            </ResponsiveContainer>
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
              onPick={(group) => onSliceClick(group)}
            />
          </div>
        )}
      </div>
    </section>
  );
}

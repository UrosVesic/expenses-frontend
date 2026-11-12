import { useEffect, useRef, useState } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const YEARS_SHOWN = 5;

const toApi = (y, m) => `${y}-${String(m).padStart(2, "0")}`;

function shiftMonth(apiMonth, delta) {
  const [y, m] = apiMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return toApi(d.getFullYear(), d.getMonth() + 1);
}

const arrow =
  "h-11 w-11 sm:h-9 sm:w-9 grid place-items-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800";

const cell = (active, disabled) =>
  `h-8 rounded-md text-sm transition-colors ${
    active
      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium"
      : disabled
        ? "text-zinc-300 dark:text-zinc-600 cursor-not-allowed"
        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
  }`;

// ‹ [Nov 2026] ›  - the middle opens a popover: pick a year, then a month (closes on month).
export default function MonthPicker({ value, onChange }) {
  const [valueYear, valueMonth] = value.split("-").map(Number);
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;

  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(valueYear); // year being browsed in the popover
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // last few years up to the current one (plus the selected year if it is older)
  const firstYear = Math.min(thisYear - YEARS_SHOWN + 1, valueYear);
  const years = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => firstYear + i);
  const isFuture = (y, m) => y > thisYear || (y === thisYear && m > thisMonth);
  const atLatest = isFuture(...shiftMonth(value, 1).split("-").map(Number));

  return (
    <div ref={rootRef} className="relative">
      <div className="flex sm:inline-flex items-center rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
        <button type="button" className={arrow} onClick={() => onChange(shiftMonth(value, -1))} aria-label="Previous month">
          <Chevron d="M15 18l-6-6 6-6" />
        </button>
        <button
          type="button"
          onClick={() => {
            setYear(valueYear);
            setOpen((o) => !o);
          }}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="h-11 sm:h-9 flex-1 sm:flex-none sm:w-28 text-sm font-semibold border-x border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          {MONTHS[valueMonth - 1]} {valueYear}
        </button>
        <button
          type="button"
          className={`${arrow} disabled:opacity-40 disabled:hover:bg-transparent`}
          onClick={() => onChange(shiftMonth(value, 1))}
          disabled={atLatest}
          aria-label="Next month"
        >
          <Chevron d="M9 18l6-6-6-6" />
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="Choose month"
          className="absolute z-50 mt-2 left-1/2 -translate-x-1/2 w-64 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-3"
        >
          <div className="flex flex-wrap gap-1 pb-3 mb-3 border-b border-zinc-100 dark:border-zinc-800">
            {years.map((y) => (
              <button key={y} type="button" onClick={() => setYear(y)} className={`${cell(y === year)} px-2.5`}>
                {y}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((name, i) => {
              const m = i + 1;
              const future = isFuture(year, m);
              return (
                <button
                  key={name}
                  type="button"
                  disabled={future}
                  onClick={() => {
                    onChange(toApi(year, m));
                    setOpen(false);
                  }}
                  className={cell(year === valueYear && m === valueMonth, future)}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Chevron({ d }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

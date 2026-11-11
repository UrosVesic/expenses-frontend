import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { signOutRedirect } from "./cognito.js";
import ReceiptUpload from "./ReceiptUpload.jsx";
import GroupDoughnutChart from "./GroupDoughnutChart.jsx";
import ReceiptGroupDetails from "./ReceiptGroupDetails.jsx";
import Toast from "./Toast.jsx";
import MonthPicker from "./MonthPicker.jsx";
import QrScannerButton from "./QrScanner.jsx";
import { EXPENSES_BASE_URL, fetchJson, formatDin, monthQuery } from "./api.js";
import { OTHER_KEY } from "./groups.js";

// v2 key: months are now "YYYY-MM" (same as the API and <input type="month">)
const MONTH_STORAGE_KEY = "expenses-dashboard-month-v2";
const THEME_STORAGE_KEY = "theme";

function currentApiMonth(offset = 0) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

function initialTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved) return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

// Selection + receipts of one chart (kind = "category" | "merchant").
// `others` holds the groups hidden behind the chart's "Other" slice. They are shown as a
// breakdown (selected === OTHER_KEY) and never requested from the API.
function useGroupPanel(kind, idToken, month, setToast) {
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [others, setOthers] = useState(null);
  const latest = useRef(0);

  const reset = () => {
    latest.current++;
    setSelected(null);
    setDetails(null);
    setLoading(false);
    setOthers(null);
  };

  // `members` is set when the "Other" slice was clicked
  const select = (group, members) => {
    const id = ++latest.current;
    setSelected(group);
    setDetails(null);
    if (group === OTHER_KEY) {
      setOthers(members ?? []);
      setLoading(false);
      return;
    }
    // picking from the breakdown keeps it for "back"; any other pick clears it
    if (members === undefined) setOthers(null);
    setLoading(true);
    fetchJson(
      `${EXPENSES_BASE_URL}/${kind}/receipts?name=${encodeURIComponent(group)}&${monthQuery(month)}`,
      idToken,
    )
      .then((d) => latest.current === id && setDetails(d))
      .catch(() => latest.current === id && setToast({ message: `Failed to fetch ${group} details.`, type: "error" }))
      .finally(() => latest.current === id && setLoading(false));
  };

  const backToOther = () => {
    latest.current++;
    setSelected(OTHER_KEY);
    setDetails(null);
    setLoading(false);
  };

  return { selected, details, loading, others, select, reset, backToOther };
}

export default function Dashboard() {
  const auth = useAuth();
  const navigate = useNavigate();
  const idToken = auth.user?.id_token;

  const [month, setMonth] = useState(
    () => localStorage.getItem(MONTH_STORAGE_KEY) || currentApiMonth(0),
  );
  const [theme, setTheme] = useState(initialTheme);
  const [categoryData, setCategoryData] = useState([]);
  const [issuerData, setIssuerData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [receiptStats, setReceiptStats] = useState({
    totalReceipts: null,
    avgPerReceipt: 0,
  });

  const category = useGroupPanel("category", idToken, month, setToast);
  const issuer = useGroupPanel("merchant", idToken, month, setToast);

  const requestId = useRef(0);
  // display name sent by the API; the raw group stays the key for requests
  const labelOf = (groups, group) => groups.find((g) => g.group === group)?.label ?? group;
  // bumped after a receipt is edited so the charts and stats reload
  const [reloadKey, setReloadKey] = useState(0);
  const onReceiptUpdated = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [auth.isLoading, auth.isAuthenticated, navigate]);

  const changeMonth = (apiMonth) => {
    setMonth(apiMonth);
    localStorage.setItem(MONTH_STORAGE_KEY, apiMonth);
    category.reset();
    issuer.reset();
  };

  useEffect(() => {
    if (!auth.isAuthenticated || !idToken) return;

    const currentRequest = ++requestId.current;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setReceiptStats({ totalReceipts: null, avgPerReceipt: 0 });
    });

    Promise.all([
      fetchJson(`${EXPENSES_BASE_URL}/category?${monthQuery(month)}`, idToken),
      fetchJson(`${EXPENSES_BASE_URL}/merchant?${monthQuery(month)}`, idToken),
    ])
      .then(([categories, merchants]) => {
        if (requestId.current !== currentRequest) return;
        setCategoryData(categories);
        setIssuerData(merchants);

        // each group carries its receipt count, so no per-group requests are needed
        const totalReceipts = categories.reduce((sum, c) => sum + (c.receiptCount || 0), 0);
        const totalAmount = categories.reduce((sum, c) => sum + (c.totalAmount || 0), 0);
        setReceiptStats({
          totalReceipts,
          avgPerReceipt: totalReceipts > 0 ? totalAmount / totalReceipts : 0,
        });
      })
      .catch((err) => {
        if (requestId.current !== currentRequest) return;
        setError(err.message);
        setToast({ message: "Failed to fetch data. Please try again.", type: "error" });
      })
      .finally(() => {
        if (requestId.current !== currentRequest) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [month, auth.isAuthenticated, idToken, reloadKey]);

  if (auth.isLoading || !auth.isAuthenticated) {
    return <div className="p-8">Loading...</div>;
  }

  const totalExpenses = categoryData.reduce((sum, item) => sum + item.totalAmount, 0);
  const topCategory = categoryData.length
    ? categoryData.reduce((max, item) => (item.totalAmount > max.totalAmount ? item : max))
    : null;

  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const isThisMonth = month === currentApiMonth(0);
  const isLastMonth = month === currentApiMonth(-1);
  const segment = (active) =>
    `h-9 px-3 text-sm font-medium transition-colors ${
      active
        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    }`;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <span className="text-base font-semibold tracking-tight">Montra</span>

          <div className="flex items-center gap-1 sm:gap-3">
            <span className="hidden sm:block text-sm text-zinc-500 dark:text-zinc-400 mr-1">
              {auth.user?.profile.email}
            </span>
            <button
              type="button"
              onClick={() => {
                const next = theme === "dark" ? "light" : "dark";
                setTheme(next);
                localStorage.setItem(THEME_STORAGE_KEY, next);
              }}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              className="h-8 w-8 grid place-items-center rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {theme === "dark" ? <MoonIcon /> : <SunIcon />}
            </button>
            <button
              type="button"
              onClick={() => auth.removeUser().then(signOutRedirect)}
              className="h-8 px-3 text-sm rounded-md text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{monthLabel}</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Spending overview</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <MonthPicker value={month} onChange={changeMonth} />
            <div className="inline-flex rounded-md border border-zinc-300 dark:border-zinc-700 overflow-hidden divide-x divide-zinc-300 dark:divide-zinc-700 bg-white dark:bg-zinc-900">
              <button type="button" onClick={() => changeMonth(currentApiMonth(0))} className={segment(isThisMonth)}>
                This month
              </button>
              <button type="button" onClick={() => changeMonth(currentApiMonth(-1))} className={segment(isLastMonth)}>
                Last month
              </button>
            </div>
            <QrScannerButton />
            <ReceiptUpload />
          </div>
        </div>

        {error && (
          <p className="mb-6 text-sm text-red-600 dark:text-red-400">Error: {error}</p>
        )}

        {categoryData.length > 0 && (
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-px mb-8 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-200 dark:bg-zinc-800">
            <Stat label="Total spent" value={formatDin(totalExpenses)} />
            <Stat
              label="Top category"
              value={topCategory ? (topCategory.label ?? topCategory.group) : "-"}
              small
            />
            <Stat label="Receipts" value={receiptStats.totalReceipts ?? "…"} />
            <Stat label="Average receipt" value={formatDin(receiptStats.avgPerReceipt)} />
          </dl>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <GroupDoughnutChart
            title="By category"
            data={categoryData}
            loading={loading}
            selected={category.selected}
            onSliceClick={category.select}
          />
          <GroupDoughnutChart
            title="By merchant"
            data={issuerData}
            loading={loading}
            selected={issuer.selected}
            onSliceClick={issuer.select}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Category receipts">
            <ReceiptGroupDetails
              groupName={category.selected && (category.details?.label ?? labelOf(categoryData, category.selected))}
              details={category.details}
              loading={category.loading}
              panel={category}
              onReceiptUpdated={onReceiptUpdated}
            />
          </Panel>
          <Panel title="Merchant receipts">
            <ReceiptGroupDetails
              groupName={issuer.selected && (issuer.details?.label ?? labelOf(issuerData, issuer.selected))}
              details={issuer.details}
              loading={issuer.loading}
              panel={issuer}
              onReceiptUpdated={onReceiptUpdated}
            />
          </Panel>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, small }) {
  return (
    <div className="bg-white dark:bg-zinc-900 px-5 py-4 min-w-0">
      <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className={`mt-1 font-semibold tracking-tight truncate ${small ? "text-lg leading-8" : "text-2xl"}`} title={String(value)}>
        {value}
      </dd>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
      <h2 className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/30 rounded-t-lg text-sm font-semibold">{title}</h2>
      <div className="p-5">{children}</div>
    </section>
  );
}

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

function SunIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

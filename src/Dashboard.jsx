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
  const [tab, setTab] = useState("category"); // mobile only: which breakdown is shown
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
  // below lg the receipts panel sits under the chart: scroll to it after a pick
  const categoryPanelRef = useRef(null);
  const issuerPanelRef = useRef(null);
  const pickAndScroll = (panel, ref) => (...args) => {
    panel.select(...args);
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
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
  // below lg only the active tab's chart + receipts are shown; lg shows both side by side
  const show = (key) => (tab === key ? "" : "hidden lg:block");

  return (
    <div className="min-h-dvh bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <header className="sticky top-0 z-40 bg-zinc-100/85 dark:bg-zinc-950/85 lg:bg-white/80 lg:dark:bg-zinc-900/80 backdrop-blur border-b border-zinc-200/70 dark:border-zinc-800 pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="h-7 w-7 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 grid place-items-center text-sm font-bold">M</span>
            Montra
          </span>

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
              className="h-10 w-10 lg:h-8 lg:w-8 grid place-items-center rounded-full lg:rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {theme === "dark" ? <MoonIcon /> : <SunIcon />}
            </button>
            <button
              type="button"
              onClick={() => auth.removeUser().then(signOutRedirect)}
              aria-label="Sign out"
              className="h-10 lg:h-8 min-w-10 px-0 sm:px-3 inline-flex items-center justify-center gap-2 text-sm rounded-full lg:rounded-md text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <SignOutIcon />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 lg:pt-8 pb-[calc(10rem+env(safe-area-inset-bottom))] lg:pb-10">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5 lg:mb-8">
          <div className="hidden lg:block">
            <h1 className="text-2xl font-semibold tracking-tight">{monthLabel}</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Spending overview</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-auto">
              <MonthPicker value={month} onChange={changeMonth} />
            </div>
            <div className="hidden sm:inline-flex rounded-md border border-zinc-300 dark:border-zinc-700 overflow-hidden divide-x divide-zinc-300 dark:divide-zinc-700 bg-white dark:bg-zinc-900">
              <button type="button" onClick={() => changeMonth(currentApiMonth(0))} className={segment(isThisMonth)}>
                This month
              </button>
              <button type="button" onClick={() => changeMonth(currentApiMonth(-1))} className={segment(isLastMonth)}>
                Last month
              </button>
            </div>
            <div className="hidden lg:flex items-center gap-2">
              <QrScannerButton idToken={idToken} onToast={setToast} onImported={() => setReloadKey((k) => k + 1)} />
              <ReceiptUpload onToast={setToast} />
            </div>
          </div>
        </div>

        {error && (
          <p className="mb-6 text-sm text-red-600 dark:text-red-400">Error: {error}</p>
        )}

        {categoryData.length > 0 && (
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5 lg:mb-8">
            <div className="col-span-2 rounded-2xl p-5 text-white bg-gradient-to-br from-zinc-800 to-zinc-950 dark:from-zinc-700 dark:to-zinc-900 shadow-sm min-w-0">
              <dt className="text-xs font-medium text-zinc-300">Total spent</dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight truncate">{formatDin(totalExpenses)}</dd>
              <p className="mt-2 text-xs text-zinc-300 truncate">
                Top category: <span className="font-medium text-white">{topCategory ? (topCategory.label ?? topCategory.group) : "-"}</span>
              </p>
            </div>
            <Stat label="Receipts" value={receiptStats.totalReceipts ?? "…"} />
            <Stat label="Average receipt" value={formatDin(receiptStats.avgPerReceipt)} />
          </dl>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-4 lg:mb-6">
          <GroupDoughnutChart
            className={show("category")}
            title="By category"
            data={categoryData}
            loading={loading}
            selected={category.selected}
            onSliceClick={pickAndScroll(category, categoryPanelRef)}
          />
          <GroupDoughnutChart
            className={show("merchant")}
            title="By merchant"
            data={issuerData}
            loading={loading}
            selected={issuer.selected}
            onSliceClick={pickAndScroll(issuer, issuerPanelRef)}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <Panel ref={categoryPanelRef} title="Category receipts" className={show("category")}>
            <ReceiptGroupDetails
              groupName={category.selected && (category.details?.label ?? labelOf(categoryData, category.selected))}
              details={category.details}
              loading={category.loading}
              panel={category}
              onReceiptUpdated={onReceiptUpdated}
            />
          </Panel>
          <Panel ref={issuerPanelRef} title="Merchant receipts" className={show("merchant")}>
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

      {/* mobile: floating actions + bottom tab bar (hidden on lg, where the header/toolbar has them) */}
      <div className="lg:hidden fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-3">
        <QrScannerButton variant="fab" idToken={idToken} onToast={setToast} onImported={() => setReloadKey((k) => k + 1)} />
        <ReceiptUpload variant="fab" onToast={setToast} />
      </div>
      <nav
        aria-label="Breakdown"
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 grid grid-cols-2 border-t border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      >
        <TabButton active={tab === "category"} onClick={() => setTab("category")} label="Categories">
          <path d="M12 3v9h9A9 9 0 0 0 12 3zM10 5.1A9 9 0 1 0 18.9 14H10z" />
        </TabButton>
        <TabButton active={tab === "merchant"} onClick={() => setTab("merchant")} label="Merchants">
          <path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6" />
        </TabButton>
      </nav>
    </div>
  );
}

function TabButton({ active, onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
        active ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"
      }`}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.25 : 1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
      {label}
    </button>
  );
}

function Stat({ label, value, small }) {
  return (
    <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-4 py-3 sm:px-5 sm:py-4 min-w-0">
      <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className={`mt-1 font-semibold tracking-tight truncate ${small ? "text-lg leading-8" : "text-xl sm:text-2xl"}`} title={String(value)}>
        {value}
      </dd>
    </div>
  );
}

function Panel({ ref, title, className = "", children }) {
  return (
    // scroll-mt keeps the title clear of the sticky header when scrolled into view
    <section ref={ref} className={`scroll-mt-[calc(4rem+env(safe-area-inset-top))] rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm ${className}`}>
      <h2 className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 rounded-t-2xl text-sm font-semibold">{title}</h2>
      <div className="p-4 sm:p-5">{children}</div>
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

function SignOutIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
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

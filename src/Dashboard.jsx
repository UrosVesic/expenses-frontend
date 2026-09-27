import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { signOutRedirect } from "./cognito.js";
import ReceiptUpload from "./ReceiptUpload.jsx";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const API_URL =
  "https://bejgfn2vla.execute-api.eu-central-1.amazonaws.com/prod/expenses/category";

const DEFAULT_MONTH = "09-2025";
const MONTH_STORAGE_KEY = "expenses-dashboard-month";

const COLORS = [
  "#aa3bff",
  "#3b8eff",
  "#ff9f3b",
  "#3bffb0",
  "#ff3b7f",
  "#c0ff3b",
  "#3bd6ff",
  "#ff3b3b",
];

// API expects "MM-YYYY", <input type="month"> uses "YYYY-MM".
function toInputMonth(apiMonth) {
  const [mm, yyyy] = apiMonth.split("-");
  return `${yyyy}-${mm}`;
}

function toApiMonth(inputMonth) {
  const [yyyy, mm] = inputMonth.split("-");
  return `${mm}-${yyyy}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "RSD",
  }).format(value);
}

export default function Dashboard() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [month, setMonth] = useState(
    () => localStorage.getItem(MONTH_STORAGE_KEY) || DEFAULT_MONTH,
  );
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [auth.isLoading, auth.isAuthenticated, navigate]);

  useEffect(() => {
    if (!auth.isAuthenticated) return;

    const controller = new AbortController();
    const currentRequest = ++requestId.current;

    queueMicrotask(() => {
      if (requestId.current !== currentRequest) return;
      setLoading(true);
      setError(null);
    });

    fetch(`${API_URL}?month=${encodeURIComponent(month)}`, {
      headers: {
        Authorization: `Bearer ${auth.user?.id_token}`,
      },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        return res.json();
      })
      .then((json) => {
        if (requestId.current !== currentRequest) return;
        setData(json);
      })
      .catch((err) => {
        if (requestId.current !== currentRequest) return;
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (requestId.current !== currentRequest) return;
        setLoading(false);
      });

    return () => controller.abort();
  }, [month, auth.isAuthenticated, auth.user?.id_token]);

  if (auth.isLoading || !auth.isAuthenticated) {
    return <div>Loading...</div>;
  }

  const total = data.reduce((sum, item) => sum + item.totalAmount, 0);

  return (
    <div style={{ padding: "32px 20px", textAlign: "left" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 15 }}>
          Signed in as {auth.user?.profile.email}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ReceiptUpload />
          <button onClick={() => auth.removeUser().then(signOutRedirect)}>
            Sign out
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <h2 style={{ margin: 0 }}>Expenses by category</h2>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 15,
          }}
        >
          Month:
          <input
            type="month"
            value={toInputMonth(month)}
            onChange={(e) => {
              const apiMonth = toApiMonth(e.target.value);
              setMonth(apiMonth);
              localStorage.setItem(MONTH_STORAGE_KEY, apiMonth);
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text-h)",
            }}
          />
        </label>
      </div>

      {loading && <p>Loading expenses…</p>}
      {error && <p style={{ color: "#ff3b3b" }}>Error: {error}</p>}

      {!loading && !error && data.length === 0 && (
        <p>No expenses found for {month}.</p>
      )}

      {!loading && !error && data.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 32,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ width: 320, height: 320 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="totalAmount"
                  nameKey="group"
                  innerRadius={70}
                  outerRadius={120}
                  paddingAngle={2}
                >
                  {data.map((_, index) => (
                    <Cell
                      key={index}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatCurrency(value)}
                  contentStyle={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <table
            style={{
              borderCollapse: "collapse",
              minWidth: 280,
              fontSize: 16,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>
                  Category
                </th>
                <th style={{ textAlign: "right", padding: "8px 12px" }}>
                  Amount
                </th>
                <th style={{ textAlign: "right", padding: "8px 12px" }}>
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, index) => (
                <tr key={item.group}>
                  <td style={{ padding: "8px 12px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: COLORS[index % COLORS.length],
                        marginRight: 8,
                      }}
                    />
                    {item.group}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>
                    {formatCurrency(item.totalAmount)}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>
                    {item.percentage.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "8px 12px", fontWeight: 600 }}>
                  Total
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    textAlign: "right",
                    fontWeight: 600,
                  }}
                >
                  {formatCurrency(total)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

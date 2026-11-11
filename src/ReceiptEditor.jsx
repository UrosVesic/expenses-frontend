import { useState } from "react";
import { useAuth } from "react-oidc-context";
import { formatDin, updateReceipt } from "./api.js";

const toNumber = (value) => (value === "" || value === "-" ? NaN : Number(value));
const lineTotal = (row) => Math.round(toNumber(row.quantity) * toNumber(row.unitPrice) * 100) / 100;

// Form rows keep values as strings so "-", "1." etc. can be typed.
const toRow = (item) => ({
  key: item.id ?? crypto.randomUUID(),
  id: item.id ?? null,
  name: item.name ?? "",
  quantity: String(item.quantity ?? 1),
  unitPrice: String(item.unitPrice ?? ""),
  taxLabel: item.taxLabel ?? null,
  taxRate: item.taxRate ?? null,
});

const inputClass =
  "w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400";

export default function ReceiptEditor({ receipt, onSaved, onCancel }) {
  const auth = useAuth();
  const [total, setTotal] = useState(String(receipt.totalAmount ?? ""));
  const [rows, setRows] = useState(() => (receipt.items || []).map(toRow));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const setField = (key, field, value) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  const addRow = (defaults = {}) =>
    setRows((current) => [...current, toRow({ quantity: 1, ...defaults })]);
  const removeRow = (key) => setRows((current) => current.filter((r) => r.key !== key));

  const itemsSum = rows.reduce((sum, r) => sum + (lineTotal(r) || 0), 0);
  const totalNumber = toNumber(total);
  const difference = Math.round((totalNumber - itemsSum) * 100) / 100;
  const addsUp = Number.isFinite(difference) && Math.abs(difference) <= 0.05;

  const validationError = (() => {
    if (!Number.isFinite(totalNumber) || totalNumber < 0) return "Total must be 0 or more.";
    for (const r of rows) {
      if (!r.name.trim()) return "Every item needs a name.";
      if (!(toNumber(r.quantity) > 0)) return `Quantity of "${r.name}" must be greater than 0.`;
      if (!Number.isFinite(toNumber(r.unitPrice))) return `Price of "${r.name}" is not a number.`;
    }
    return null;
  })();

  const save = async () => {
    if (validationError) return setError(validationError);
    setSaving(true);
    setError(null);
    try {
      const updated = await updateReceipt(auth.user?.id_token, receipt.id, {
        totalAmount: totalNumber,
        items: rows.map((r) => ({
          id: r.id,
          name: r.name.trim(),
          quantity: toNumber(r.quantity),
          unitPrice: toNumber(r.unitPrice),
          taxLabel: r.taxLabel,
          taxRate: r.taxRate,
        })),
      });
      onSaved(updated);
    } catch {
      setError("Couldn't save the receipt. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 bg-zinc-50 dark:bg-zinc-700 rounded-lg p-3 space-y-3">
      {rows.map((r) => {
        const value = lineTotal(r);
        return (
          <div
            key={r.key}
            className="rounded-md border border-zinc-200 dark:border-zinc-600 bg-white/60 dark:bg-zinc-800/40 p-2 space-y-2"
          >
            <div className="flex items-center gap-2">
              <input
                className={`${inputClass} flex-1 min-w-0`}
                value={r.name}
                placeholder="Item name"
                aria-label="Item name"
                onChange={(e) => setField(r.key, "name", e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeRow(r.key)}
                className="shrink-0 w-7 h-7 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                aria-label={`Remove ${r.name || "item"}`}
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2 items-end">
              <label className="text-xs text-zinc-500 dark:text-zinc-400">
                Qty
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={r.quantity}
                  onChange={(e) => setField(r.key, "quantity", e.target.value)}
                />
              </label>
              <label className="text-xs text-zinc-500 dark:text-zinc-400">
                Unit price
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={r.unitPrice}
                  placeholder="e.g. -300"
                  onChange={(e) => setField(r.key, "unitPrice", e.target.value)}
                />
              </label>
              <span
                className={`pb-1.5 text-sm font-medium text-right min-w-[5rem] ${
                  value < 0 ? "text-green-600 dark:text-green-400" : "text-zinc-900 dark:text-white"
                }`}
              >
                {Number.isFinite(value) ? formatDin(value) : "—"}
              </span>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => addRow({ unitPrice: "" })}
          className="px-3 py-1.5 text-sm rounded-lg bg-zinc-200 dark:bg-zinc-600 hover:bg-zinc-300 dark:hover:bg-zinc-500"
        >
          + Add item
        </button>
        <button
          type="button"
          onClick={() => addRow({ name: "Sale", unitPrice: "-" })}
          className="px-3 py-1.5 text-sm rounded-lg bg-zinc-200 dark:bg-zinc-600 hover:bg-zinc-300 dark:hover:bg-zinc-500"
        >
          + Add discount
        </button>
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-600 pt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          Total
          <input
            className={`${inputClass} w-32`}
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </label>
        <span className={`text-sm ${addsUp ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400"}`}>
          Items: {formatDin(itemsSum)}{" "}
          {addsUp ? "✓ adds up" : Number.isFinite(difference) ? `(off by ${difference.toLocaleString()} din)` : ""}
        </span>
        <button
          type="button"
          onClick={() => setTotal(String(Math.round(itemsSum * 100) / 100))}
          className="text-sm underline text-zinc-900 dark:text-zinc-100 underline"
        >
          Use items sum as total
        </button>
      </div>

      {!addsUp && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          You can save anyway; the receipt stays marked “needs review” until the items add up to the total.
        </p>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1.5 text-sm rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-600"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

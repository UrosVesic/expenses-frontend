import { formatDin } from "./api.js";
import ReceiptDetails from "./ReceiptDetails.jsx";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

// Read-only summary of a just-imported receipt so the user can check what was saved.
export default function ReceiptPreview({ receipt, onEdit }) {
  const items = receipt.items || [];
  const itemsSum = items.reduce((sum, i) => sum + (i.quantity || 0) * (i.unitPrice || 0), 0);
  const addsUp = Math.abs(itemsSum - Number(receipt.totalAmount)) <= 0.05;
  const payments = receipt.payments || [];
  const paidSum = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const paymentsMatch = payments.length === 0 || Math.abs(paidSum - Number(receipt.totalAmount)) <= 0.05;

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">{receipt.merchant || "Unknown merchant"}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {receipt.purchasedAt ? dateFormat.format(new Date(receipt.purchasedAt)) : ""}
            {receipt.city ? ` · ${receipt.city}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700 px-2.5 py-0.5 text-xs">
          {receipt.categoryLabel || receipt.category || "Uncategorized"}
        </span>
      </div>

      <ReceiptDetails receipt={receipt} />

      <ul className="max-h-48 overflow-y-auto space-y-1.5 border-t border-zinc-200 dark:border-zinc-700 pt-3">
        {items.map((item, i) => {
          const line = (item.quantity || 0) * (item.unitPrice || 0);
          return (
            <li key={item.id ?? i} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                {item.quantity !== 1 && <span className="text-zinc-500 dark:text-zinc-400">{item.quantity} × </span>}
                {item.name}
              </span>
              <span className={`shrink-0 ${line < 0 ? "text-green-600 dark:text-green-400" : ""}`}>{formatDin(line)}</span>
            </li>
          );
        })}
        {items.length === 0 && <li className="text-sm text-zinc-500 dark:text-zinc-400">No items.</li>}
      </ul>

      <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-700 pt-3">
        <span className="text-sm font-medium">Total</span>
        <span className="text-base font-semibold">{formatDin(receipt.totalAmount)}</span>
      </div>
      {!addsUp && (
        <p className="text-xs text-yellow-600 dark:text-yellow-400">Items don't add up to the total ({formatDin(itemsSum)}).</p>
      )}
      {!paymentsMatch && (
        <p className="text-xs text-yellow-600 dark:text-yellow-400">Payments don't add up to the total ({formatDin(paidSum)}).</p>
      )}

      <button
        type="button"
        onClick={onEdit}
        className="w-full py-2.5 text-sm font-medium rounded-xl bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600"
      >
        Something wrong? Edit
      </button>
    </div>
  );
}

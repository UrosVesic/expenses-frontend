import { formatDin } from "./api.js";
import { paymentLabel } from "./receiptOptions.js";

// Read-only header fields of a full receipt: category, type, where, payments.
export default function ReceiptDetails({ receipt }) {
  const place = [receipt.location, receipt.address, receipt.city].filter(Boolean).join(", ");
  const payments = receipt.payments || [];
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      <dt className="text-zinc-500 dark:text-zinc-400">Category</dt>
      <dd>{receipt.categoryLabel || "Uncategorized"}</dd>
      {receipt.transactionType === "REFUND" && (
        <>
          <dt className="text-zinc-500 dark:text-zinc-400">Type</dt>
          <dd className="text-emerald-700 dark:text-emerald-400">Refund</dd>
        </>
      )}
      {place && (
        <>
          <dt className="text-zinc-500 dark:text-zinc-400">Where</dt>
          <dd className="break-words">{place}</dd>
        </>
      )}
      {payments.length > 0 && (
        <>
          <dt className="text-zinc-500 dark:text-zinc-400">Paid</dt>
          <dd>{payments.map((p) => `${paymentLabel(p.type)} ${formatDin(p.amount)}`).join(" · ")}</dd>
        </>
      )}
    </dl>
  );
}

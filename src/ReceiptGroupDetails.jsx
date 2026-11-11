import { useState } from "react";
import { useAuth } from "react-oidc-context";
import { formatDin, requestReceiptPhoto } from "./api.js";
import PhotoLightbox from "./PhotoLightbox.jsx";
import ReceiptEditor from "./ReceiptEditor.jsx";
import GroupList from "./GroupList.jsx";
import { OTHER_KEY } from "./groups.js";

// purchasedAt is ISO-8601 with offset, e.g. 2026-11-09T21:07:00+01:00
function formatDate(dateString) {
  const date = new Date(dateString);
  if (!dateString || isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function ReceiptCard({ receipt: initial, onReceiptUpdated }) {
  const auth = useAuth();
  const [receipt, setReceipt] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState(null);

  const viewPhoto = async () => {
    setPhotoLoading(true);
    setPhotoError(null);
    try {
      const photo = await requestReceiptPhoto(auth.user?.id_token, receipt.id);
      if (photo.contentType === "application/pdf") {
        window.open(photo.url, "_blank", "noopener");
      } else {
        setPhotoUrl(photo.url);
      }
    } catch {
      setPhotoError("Couldn't load the photo.");
    } finally {
      setPhotoLoading(false);
    }
  };

  const needsReview = receipt.status === "NEEDS_REVIEW";
  const name = prettyMerchant(receipt.merchant);
  const items = receipt.items || [];

  return (
    <div
      className={`rounded-lg border transition-colors ${
        expanded || editing
          ? "border-zinc-300 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-800/40"
          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center gap-3 w-full text-left px-4 pt-3 pb-2 cursor-pointer"
      >
        <Monogram name={name} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate" title={receipt.merchant}>
            {name}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
            {formatDate(receipt.purchasedAt)}
            <span aria-hidden="true">·</span>
            {plural(items.length, "item")}
            {needsReview && (
              <span className="rounded-full px-2 py-px text-[11px] font-medium bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800">
                Needs review
              </span>
            )}
          </p>
        </div>
        <p className="shrink-0 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {formatDin(receipt.totalAmount)}
        </p>
        <svg
          className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!editing && (
        <div className="flex flex-wrap items-center gap-2 pl-[3.75rem] pr-4 pb-3">
          <Chip onClick={() => setEditing(true)} tone={needsReview ? "amber" : "zinc"}>
            <PencilIcon />
            {needsReview ? "Review" : "Edit"}
          </Chip>
          {receipt.hasPhoto && (
            <Chip onClick={viewPhoto} disabled={photoLoading}>
              <ImageIcon />
              {photoLoading ? "Loading…" : "Photo"}
            </Chip>
          )}
          {photoError && <span className="text-xs text-red-600 dark:text-red-400">{photoError}</span>}
        </div>
      )}
      {photoUrl && <PhotoLightbox url={photoUrl} onClose={() => setPhotoUrl(null)} />}

      {editing && (
        <div className="px-4 pb-4">
          <ReceiptEditor
            receipt={receipt}
            onCancel={() => setEditing(false)}
            onSaved={(updated) => {
              setReceipt(updated);
              setEditing(false);
              setExpanded(true);
              onReceiptUpdated?.(updated);
            }}
          />
        </div>
      )}

      {!editing && expanded && (
        <div className="mx-4 mb-4 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3">
          <ul className="space-y-2">
            {items.map((item, i) => {
              const line = (item.quantity || 0) * (item.unitPrice || 0);
              return (
                <li key={item.id ?? i} className="flex items-baseline justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <p className="text-zinc-800 dark:text-zinc-200 truncate">{item.name}</p>
                    {item.quantity !== 1 && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {item.quantity} × {formatDin(item.unitPrice)}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 ${
                      line < 0 ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-900 dark:text-zinc-100"
                    }`}
                  >
                    {formatDin(line)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 pt-2 border-t border-dashed border-zinc-300 dark:border-zinc-700 flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span>{formatDin(receipt.totalAmount)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// "VOJIN CUCIC PR KORČAGIN KAFANE" -> "Vojin Cucic PR Korčagin Kafane" (keeps short legal forms upper)
const LEGAL_FORMS = new Set(["PR", "DOO", "D.O.O.", "AD", "A.D.", "SZR", "STR", "SR", "OD", "TR"]);
function prettyMerchant(raw) {
  if (!raw) return "Unknown merchant";
  if (raw !== raw.toUpperCase()) return raw;
  return raw
    .split(/(\s+)/)
    .map((w) => (LEGAL_FORMS.has(w) ? w : w.charAt(0) + w.slice(1).toLocaleLowerCase("sr")))
    .join("");
}

// Soft tints, picked by name so a merchant always gets the same one
const TINTS = [
  "bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-900",
  "bg-teal-50 text-teal-700 ring-teal-100 dark:bg-teal-900/30 dark:text-teal-300 dark:ring-teal-900",
  "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-900/30 dark:text-violet-300 dark:ring-violet-900",
  "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-900",
  "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-900",
  "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
];

function Monogram({ name }) {
  const words = name.split(/\s+/).filter((w) => /\p{L}/u.test(w) && !LEGAL_FORMS.has(w));
  const initials = (words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "");
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
  return (
    <span
      className={`shrink-0 w-9 h-9 rounded-lg grid place-items-center text-xs font-semibold uppercase ring-1 ring-inset ${
        TINTS[hash % TINTS.length]
      }`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

function Chip({ children, onClick, disabled, tone = "zinc" }) {
  const tones = {
    zinc: "border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800",
    amber: "border-amber-200 text-amber-800 bg-amber-50 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-300 dark:bg-amber-900/20",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-md border text-xs font-medium transition-colors disabled:opacity-60 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

const icon = {
  width: 13,
  height: 13,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};
const PencilIcon = () => (
  <svg {...icon}>
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
const ImageIcon = () => (
  <svg {...icon}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);

export default function ReceiptGroupDetails({ groupName, details, loading, panel, onReceiptUpdated }) {
  // "Other" slice: list the small groups it contains; picking one loads its receipts
  if (panel?.selected === OTHER_KEY) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Other</h3>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {plural(panel.others.length, "entry").replace("entrys", "entries")}
          </span>
        </div>
        <GroupList
          data={panel.others}
          onPick={(group) => panel.select(group, panel.others)}
          maxHeightClass="max-h-96"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center text-zinc-500 dark:text-zinc-400 py-8">
        Loading details…
      </div>
    );
  }

  if (!groupName) {
    return (
      <div className="text-center text-zinc-500 dark:text-zinc-400 py-8">
        Select a slice or an entry from the list above
      </div>
    );
  }

  const receipts = details?.receipts || [];

  if (receipts.length === 0) {
    return (
      <div className="text-center text-zinc-500 dark:text-zinc-400 py-8">
        <p className="font-medium">No receipts found</p>
        <p className="text-sm">Try a different category or time period</p>
      </div>
    );
  }

  // the API already returns them newest first
  const sorted = receipts;

  return (
    <div className="space-y-2">
      {panel?.others && (
        <button
          type="button"
          onClick={panel.backToOther}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Back to Other
        </button>
      )}
      <div className="flex items-end justify-between gap-4 mb-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">{groupName}</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{plural(receipts.length, "receipt")}</p>
        </div>
        <p className="shrink-0 text-lg font-semibold tracking-tight">{formatDin(details.totalAmount)}</p>
      </div>
      {sorted.map((receipt, index) => (
        <ReceiptCard key={receipt.id || index} receipt={receipt} onReceiptUpdated={onReceiptUpdated} />
      ))}
    </div>
  );
}

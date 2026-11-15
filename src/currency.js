import { createContext, useContext } from "react";
import { formatMoney } from "./api.js";

// The user's profile currency: GET /expenses converts every amount into it.
// null = "original currencies": amounts are shown as printed and totals are summed per currency.
export const DisplayCurrencyContext = createContext(null);

export function useDisplayCurrency() {
  return useContext(DisplayCurrencyContext);
}

// Adds what to show for an expense row: the converted amount (in the row's `currency`, which is the
// original one when no rate was available), or the original amount when no display currency is set.
// `amount` stays as the API sent it (a single unit) for chart proportions and sorting.
export function withShownAmount(expense, displayCurrency) {
  return displayCurrency
    ? { ...expense, shownAmount: expense.amount, shownCurrency: expense.currency ?? displayCurrency }
    : { ...expense, shownAmount: expense.originalAmount, shownCurrency: expense.originalCurrency };
}

// { RSD: 5000, EUR: 20 } of the rows' shown amounts.
export function sumByCurrency(expenses) {
  const sums = {};
  for (const e of expenses) sums[e.shownCurrency] = (sums[e.shownCurrency] ?? 0) + e.shownAmount;
  return sums;
}

export function mergeByCurrency(maps) {
  const sums = {};
  for (const m of maps) for (const [c, v] of Object.entries(m)) sums[c] = (sums[c] ?? 0) + v;
  return sums;
}

// ["5,000 din", "€20.00"]; the display currency (else RSD) first, then the others alphabetically.
export function formatTotalsList(byCurrency, displayCurrency) {
  const first = displayCurrency ?? "RSD";
  const codes = Object.keys(byCurrency).sort((a, b) => (a === first ? -1 : b === first ? 1 : a.localeCompare(b)));
  if (codes.length === 0) return [formatMoney(0, first)];
  return codes.map((c) => formatMoney(byCurrency[c], c));
}

// "5,000 din + €20.00", for single-line places.
export function formatTotals(byCurrency, displayCurrency) {
  return formatTotalsList(byCurrency, displayCurrency).join(" + ");
}

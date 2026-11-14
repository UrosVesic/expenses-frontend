// Mirrors the montra-api enums. TODO: load categories from GET /categories once it exists.
export const CATEGORIES = [
  { value: "GROCERIES", label: "Groceries" },
  { value: "RESTAURANTS_FOOD_DELIVERY", label: "Restaurants & delivery" },
  { value: "FUEL_TRANSPORT", label: "Fuel & transport" },
  { value: "HOUSEHOLD", label: "Household" },
  { value: "HEALTH_PHARMACY", label: "Health & pharmacy" },
  { value: "PERSONAL_CARE", label: "Personal care" },
  { value: "CLOTHING", label: "Clothing" },
  { value: "ELECTRONICS", label: "Electronics" },
  { value: "UTILITIES_BILLS", label: "Utilities & bills" },
  { value: "ENTERTAINMENT", label: "Entertainment" },
  { value: "ALCOHOL_TOBACCO", label: "Alcohol & tobacco" },
  { value: "OTHER", label: "Other" },
];

export const PAYMENT_TYPES = [
  { value: "CARD", label: "Card" },
  { value: "CASH", label: "Cash" },
  { value: "MOBILE_MONEY", label: "Mobile" },
  { value: "WIRE_TRANSFER", label: "Wire transfer" },
  { value: "VOUCHER", label: "Voucher" },
  { value: "CHECK", label: "Check" },
  { value: "OTHER", label: "Other" },
];

export const paymentLabel = (type) => PAYMENT_TYPES.find((p) => p.value === type)?.label ?? type;

// ISO-8601 with offset <-> <input type="datetime-local"> value (viewer's local time)
const pad = (n) => String(n).padStart(2, "0");
export function toLocalInput(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (value) => new Date(value).toISOString();

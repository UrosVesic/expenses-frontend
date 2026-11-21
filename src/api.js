// Shared montra-api HTTP API (presigner + montra-api Lambda), Cognito ID token required.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ??
  import.meta.env.VITE_PRESIGN_API_URL ??
  "https://3y4zkzu136.execute-api.eu-central-1.amazonaws.com";

export const PRESIGN_BASE_URL = API_BASE_URL;
export const EXPENSES_BASE_URL = `${API_BASE_URL}/expenses`;

// The user's IANA time zone (e.g. "Europe/Berlin"). It decides where a month starts and ends
// and how receipt times without an offset are read.
export const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

// The month's receipts in slim form (newest first); the dashboard groups them itself.
// -> { currency, expenses: [{ id, purchasedAt, merchant, category, categoryLabel, amount,
//      originalAmount, originalCurrency, converted, status, hasPhoto }], truncated }
// amount is in `currency` (the profile currency, at the purchase-date NBS rate) and negative for
// refunds; converted = false means no rate was available and amount is the original. tz decides where the month starts and ends.
export function fetchMonthlyExpenses(idToken, month) {
  const query = `month=${encodeURIComponent(month)}&tz=${encodeURIComponent(TIME_ZONE)}`;
  return fetchJson(`${EXPENSES_BASE_URL}?${query}`, idToken);
}

// Full receipt with items, for the detail view / editor.
export function fetchReceipt(idToken, receiptId) {
  return fetchJson(`${API_BASE_URL}/receipts/${encodeURIComponent(receiptId)}`, idToken);
}

// Ask the presigner for a URL to PUT a receipt image to S3.
export function requestUploadUrl(idToken, contentType) {
  return fetchJson(`${PRESIGN_BASE_URL}/presign/upload`, idToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType, timeZone: TIME_ZONE }),
  });
}

// Upload straight to S3. Content-Type and the signed extra headers (x-amz-meta-tz) must match
// what the URL was signed for; pass the `headers` returned by requestUploadUrl.
export async function uploadToS3(url, body, contentType, extraHeaders = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: { ...extraHeaders, "Content-Type": contentType },
      body,
    });
  } catch {
    throw new ApiError(NETWORK_MESSAGE, { status: 0, code: "NETWORK" });
  }
  if (!res.ok) {
    // 403 from S3 is almost always an expired link (or a type mismatch we can't fix here)
    const message =
      res.status === 403
        ? "The upload link expired. Please try again."
        : res.status === 400 && /EntityTooLarge/.test(await res.text().catch(() => ""))
          ? "The file is too large."
          : `The upload failed (status ${res.status}). Please try again.`;
    throw new ApiError(message, { status: res.status, code: "UPLOAD_FAILED" });
  }
}

// Ask the presigner for a URL to read one of the signed-in user's files.
export function requestDownloadUrl(idToken, fileId) {
  return fetchJson(
    `${PRESIGN_BASE_URL}/presign/${encodeURIComponent(fileId)}/download`,
    idToken,
  );
}

// Presigned URL of the receipt's photo: an attached photo, else the scanned original.
// -> { url, contentType, expiresAt }; the URL is valid for a few minutes, so fetch it on click.
export function requestReceiptPhoto(idToken, receiptId) {
  return fetchJson(`${API_BASE_URL}/receipts/${encodeURIComponent(receiptId)}/photo`, idToken);
}

// `npm run local`: the local montra-api has no JWT authorizer and trusts X-User-Id instead,
// so send the token's `sub` (decoded only, not verified; API Gateway does that in AWS).
const LOCAL_API = import.meta.env.VITE_API_URL?.startsWith("http://localhost");

function localUserHeaders(idToken) {
  if (!LOCAL_API) return {};
  try {
    const payload = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return { "X-User-Id": JSON.parse(atob(payload)).sub };
  } catch {
    return {};
  }
}

export async function fetchJson(url, idToken, options = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...localUserHeaders(idToken),
        ...options.headers,
      },
    });
  } catch {
    // offline, DNS, CORS (API Gateway answers some errors without CORS headers), aborted
    throw new ApiError(NETWORK_MESSAGE, { status: 0, code: "NETWORK" });
  }

  if (!res.ok) {
    // montra-api errors are ProblemDetail JSON: `detail` is user-facing, `code` is stable,
    // `errors` lists invalid fields ([{ field, message }]) for validation failures.
    let body;
    try {
      body = await res.json();
    } catch {
      // not JSON (e.g. an API Gateway or Lambda error)
    }
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new ApiError(body?.detail || statusMessage(res.status), {
      status: res.status,
      code: body?.code,
      errors: body?.errors,
    });
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(message, { status, code, errors } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors ?? [];
  }
}

// Fired on any 401; App.jsx refreshes the tokens (or signs out).
export const UNAUTHORIZED_EVENT = "montra:unauthorized";

const NETWORK_MESSAGE = "Can't reach the server. Check your connection and try again.";

// Used when the response has no ProblemDetail (API Gateway, Lambda timeouts, throttling).
function statusMessage(status) {
  if (status === 401) return "Your session expired. Please sign in again.";
  if (status === 403) return "You don't have access to this.";
  if (status === 404) return "Not found. It may have been deleted.";
  if (status === 413) return "The file or request is too large.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status === 503 || status === 504) return "The server is busy or timed out. Please try again.";
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  return `Request failed (status ${status}).`;
}

// The message to show for any caught error; `fallback` covers non-API errors (bugs, parsing).
export function errorMessage(err, fallback = "Something went wrong. Please try again.") {
  return err instanceof ApiError ? err.message : fallback;
}

// Dinars without decimals, as before ("1,234 din"); other currencies with two ("€12.50").
export function formatMoney(value, currency = "RSD") {
  if (currency === "RSD") return `${Math.round(value || 0).toLocaleString()} din`;
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value || 0);
}

// -> { currency, supportedCurrencies }; currency is what /expenses converts amounts into.
export function fetchProfile(idToken) {
  return fetchJson(`${API_BASE_URL}/profile`, idToken);
}

export function updateProfileCurrency(idToken, currency) {
  return fetchJson(`${API_BASE_URL}/profile`, idToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currency }),
  });
}

// Manual correction. `items` is the full list: items with `id` are updated, items without are
// added, missing ones are removed. unitPrice may be negative (discounts). -> updated receipt
// Full replace of the editable fields: { totalAmount, purchasedAt, transactionType, payments,
// category, merchant, location, address, city, currency, items }. Omitted nullable fields are cleared.
export function updateReceipt(idToken, receiptId, body) {
  return fetchJson(`${API_BASE_URL}/receipts/${encodeURIComponent(receiptId)}`, idToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Fiscal receipt QR codes point here; montra-api enforces the same allow-list.
export const SUF_HOST = "suf.purs.gov.rs";

export function isSufUrl(text) {
  try {
    const u = new URL(text);
    return u.protocol === "https:" && u.hostname === SUF_HOST;
  } catch {
    return false;
  }
}

// Import a receipt from its scanned QR URL; montra-api fetches the SUF data server-side.
// -> { receipt, created } (receipt = full ReceiptResponse; created = false when this invoice was already saved)
export function importReceiptFromQr(idToken, verificationUrl) {
  return fetchJson(`${API_BASE_URL}/receipts`, idToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verificationUrl }),
  });
}

// Photo/document of a saved receipt. The API accepts these types only.
export const ATTACHMENT_TYPES = ["image/jpeg", "image/png", "application/pdf"];

// -> { uploadUrl, expiresAt }; PUT the file to uploadUrl with the same Content-Type.
export function requestAttachmentUpload(idToken, receiptId, contentType) {
  return fetchJson(`${API_BASE_URL}/receipts/${encodeURIComponent(receiptId)}/attachment`, idToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType }),
  });
}

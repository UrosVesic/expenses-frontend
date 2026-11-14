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
// -> { expenses: [{ id, purchasedAt, merchant, category, categoryLabel, amount, status, hasPhoto }], truncated }
// amount is negative for refunds. tz decides where the month starts and ends.
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
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...extraHeaders, "Content-Type": contentType },
    body,
  });
  if (!res.ok) {
    throw new Error(`S3 upload failed with status ${res.status}`);
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

export async function fetchJson(url, idToken, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }

  return res.json();
}

export function formatDin(value) {
  return `${Math.round(value || 0).toLocaleString()} din`;
}

// Manual correction. `items` is the full list: items with `id` are updated, items without are
// added, missing ones are removed. unitPrice may be negative (discounts). -> updated receipt
export function updateReceipt(idToken, receiptId, { totalAmount, items }) {
  return fetchJson(`${API_BASE_URL}/receipts/${encodeURIComponent(receiptId)}`, idToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ totalAmount, items }),
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

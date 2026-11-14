const CLIENT_ID = "35kq5tpku3bkv6l9rkg05v2dde";
const COGNITO_DOMAIN =
  "https://eu-central-1tyezhz734.auth.eu-central-1.amazoncognito.com";
// current origin, so the same build works on localhost and on CloudFront
// (each origin must be listed in the app client's sign-out URLs)
const LOGOUT_URI = `${window.location.origin}/`;

export function signOutRedirect() {
  window.location.href = `${COGNITO_DOMAIN}/logout?client_id=${CLIENT_ID}&logout_uri=${encodeURIComponent(LOGOUT_URI)}`;
}

// "Switch account": sign out of the app and of Cognito, then (on the landing page,
// see App.jsx) start a new sign-in that forces Google's account chooser.
export const SWITCH_ACCOUNT_FLAG = "switchAccount";

export function switchAccountRedirect() {
  try {
    localStorage.setItem(SWITCH_ACCOUNT_FLAG, "1");
  } catch {
    // storage unavailable: falls back to a plain sign-out
  }
  signOutRedirect();
}

const CLIENT_ID = "35kq5tpku3bkv6l9rkg05v2dde";
const COGNITO_DOMAIN =
  "https://eu-central-1tyezhz734.auth.eu-central-1.amazoncognito.com";
const LOGOUT_URI = "http://localhost:5173/";

export function signOutRedirect() {
  window.location.href = `${COGNITO_DOMAIN}/logout?client_id=${CLIENT_ID}&logout_uri=${encodeURIComponent(LOGOUT_URI)}`;
}

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import Dashboard from "./Dashboard.jsx";
import { AuthProvider } from "react-oidc-context";
import { WebStorageStateStore } from "oidc-client-ts";
import "./index.css";

const cognitoAuthConfig = {
  authority:
    "https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_tYEzhz734",
  client_id: "35kq5tpku3bkv6l9rkg05v2dde",
  // current origin, so the same build works on localhost and on CloudFront
  // (each origin must be listed in the app client's callback URLs)
  redirect_uri: `${window.location.origin}/auth`,
  response_type: "code",
  scope: "phone openid email profile",
  // Keep the session (incl. refresh token) and the sign-in state in localStorage
  // instead of sessionStorage: an installed Android PWA loses sessionStorage when
  // it is killed from recents, and the Cognito redirect can come back in a
  // different browsing context ("No matching state found in storage").
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  stateStore: new WebStorageStateStore({ store: window.localStorage }),
  // renew the access/ID token with the refresh token before it expires
  automaticSilentRenew: true,
  // drop ?code=&state= from the URL so a relaunch doesn't replay a used code
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider {...cognitoAuthConfig}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/auth" element={<App />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

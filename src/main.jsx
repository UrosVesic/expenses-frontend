import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import Dashboard from "./Dashboard.jsx";
import { AuthProvider } from "react-oidc-context";
import "./index.css";

const cognitoAuthConfig = {
  authority:
    "https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_tYEzhz734",
  client_id: "35kq5tpku3bkv6l9rkg05v2dde",
  redirect_uri: "http://localhost:5173/auth",
  response_type: "code",
  scope: "phone openid email profile",
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

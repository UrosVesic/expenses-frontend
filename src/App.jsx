// App.js

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";

// same rule as the dashboard: saved choice, else the OS preference
function applyStoredTheme() {
  const saved = localStorage.getItem("theme");
  const dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
}

function Screen({ children }) {
  return (
    <div className="min-h-dvh grid place-items-center px-6 py-[env(safe-area-inset-top)] bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {children}
    </div>
  );
}

function App() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(applyStoredTheme, []);

  useEffect(() => {
    if (auth.isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [auth.isAuthenticated, navigate]);

  if (auth.isLoading) {
    return (
      <Screen>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 animate-pulse">Loading…</p>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 grid place-items-center text-3xl font-bold shadow-lg">
          M
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Montra</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Snap a receipt, see where your money goes.
        </p>

        {auth.error && (
          <p className="mt-6 text-sm text-red-600 dark:text-red-400">
            Sign-in failed: {auth.error.message}
          </p>
        )}

        <button
          type="button"
          onClick={() => auth.signinRedirect()}
          className="mt-8 w-full h-12 rounded-xl text-base font-medium bg-zinc-900 text-white active:scale-[0.98] transition-transform dark:bg-zinc-100 dark:text-zinc-900"
        >
          Sign in
        </button>
      </div>
    </Screen>
  );
}

export default App;

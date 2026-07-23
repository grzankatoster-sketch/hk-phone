// Cichy logger błędów runtime → Supabase (tabela error_logs) z fallbackiem na
// localStorage gdy brak sieci / Supabase. NIGDY nie rzuca — logowanie błędu nie
// może wywołać kolejnego błędu w UI. Zob. migracja 0013_error_logs.sql.
import { supabase, supabaseReady } from "./supabase.js";
import { TENANT_ID } from "./constants.js";
import { STORAGE_KEYS } from "./storage.js";

const LS_KEY = STORAGE_KEYS.errorLog;
const LS_MAX = 50; // trzymamy tylko ostatnie N lokalnie, by nie puchło

// Wersja aplikacji wstrzykiwana przez Vite (define w vite.config.js); fallback gdy brak.
const APP_VERSION =
  (typeof __APP_VERSION__ !== "undefined" && __APP_VERSION__) || "unknown";

function bufferLocal(entry) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(entry);
    localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, LS_MAX)));
  } catch {
    // localStorage pełny lub niedostępny — odpuszczamy po cichu
  }
}

// Zgłasza błąd. error: Error|string, opts: { severity, source, componentStack, context }
export function logError(error, opts = {}) {
  const entry = {
    tenant_id: TENANT_ID,
    severity: opts.severity || "error",
    source: opts.source || "manual",
    message: (error && error.message) || String(error || "Nieznany błąd"),
    stack: (error && error.stack) || null,
    component_stack: opts.componentStack || null,
    url: typeof location !== "undefined" ? location.href : null,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    app_version: APP_VERSION,
    context: opts.context || null,
    created_at: new Date().toISOString(),
  };

  // Zawsze zostaw lokalny ślad (działa też offline / w Electron bez sieci).
  bufferLocal(entry);

  if (supabaseReady && supabase) {
    // fire-and-forget; każdy błąd insertu połykamy
    Promise.resolve(supabase.from("error_logs").insert(entry)).catch(() => {});
  }
}

let installed = false;
// Podpina globalne handlery błędów (synchroniczne + odrzucone promisy).
// Wywołać raz przy starcie aplikacji.
export function initGlobalErrorLogging() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    logError(e.error || e.message, { severity: "error", source: "window" });
  });

  window.addEventListener("unhandledrejection", (e) => {
    logError(e.reason, { severity: "error", source: "promise" });
  });
}

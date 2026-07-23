import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import { initGlobalErrorLogging } from "./lib/errorLog.js";
import "./theme-conrad.css"; // warstwa motywu (tokeny marki) — PRZED core (WYKONANIE 2.6)
import "./style.css";

initGlobalErrorLogging();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { initNativeShell } from "./lib/nativePlatform.js";

// Native shell polish (Capacitor). No-op on web/PWA — must not gate app boot.
initNativeShell().catch(() => {});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

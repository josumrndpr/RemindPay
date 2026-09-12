import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Service worker (PWA): solo en navegador real por https/localhost.
// En la app Tauri no aplica; en red local http (pruebas iPhone) puede fallar
// y se ignora en silencio (offline total requiere https).
if (
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  (window.location.protocol === "https:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1")
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sin offline en este origen */
    });
  });
}

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { getBrowserCapabilities } from "./lib/capabilities";
import { getLifeHubServiceWorkerRegistration } from "./lib/service-worker";

if (import.meta.env.PROD && getBrowserCapabilities().serviceWorkerSupported) {
  window.addEventListener("load", () => {
    void getLifeHubServiceWorkerRegistration().catch(() => undefined);
  }, { once: true });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/source-sans-3/latin-400.css";
import "@fontsource/source-sans-3/latin-600.css";
import "@fontsource/source-sans-3/latin-700.css";
import { App } from "./App";
import "./styles.css";

const configuredMode = import.meta.env.VITE_APP_MODE;
const isDemo =
  import.meta.env.MODE === "demo" ||
  (import.meta.env.DEV && (!configuredMode || configuredMode === "demo"));

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isDemo ? (
      <App />
    ) : (
      <main className="configuration-error">
        <h1>Appen er ikke konfigureret</h1>
        <p>
          Denne version understøtter kun den lokale demo. En
          produktionsopsætning er endnu ikke tilgængelig.
        </p>
      </main>
    )}
  </React.StrictMode>,
);

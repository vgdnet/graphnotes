import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { hashFromPathname } from "./appRoute";
import { applyTheme, resolveTheme } from "./theme";
import "./styles.css";

const personHash = hashFromPathname(window.location.pathname);
if (personHash && window.location.hash !== personHash) {
  window.history.replaceState(null, "", `/${personHash}`);
}
applyTheme(resolveTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

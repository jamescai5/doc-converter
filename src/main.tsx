import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Metrics from "./Metrics";
import "./styles.css";

// Minimal path-based routing — no router dependency needed for two pages.
const path = window.location.pathname.replace(/\/+$/, "");
const isMetrics = path === "/metrics";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isMetrics ? <Metrics /> : <App />}</StrictMode>,
);

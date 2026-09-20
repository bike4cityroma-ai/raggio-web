import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import { RaggioApp } from "../app/raggio-app";
import PrivacyPage from "../app/privacy/page";
import StatsPage from "../app/stats/page";

const Page = window.location.pathname.startsWith("/privacy") ? PrivacyPage : window.location.pathname.startsWith("/statistiche") ? StatsPage : RaggioApp;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);

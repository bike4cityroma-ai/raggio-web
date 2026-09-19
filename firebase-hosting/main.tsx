import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import { RaggioApp } from "../app/raggio-app";
import PrivacyPage from "../app/privacy/page";

const Page = window.location.pathname.startsWith("/privacy") ? PrivacyPage : RaggioApp;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);

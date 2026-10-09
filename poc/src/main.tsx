import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { StoreProvider } from "./lib/store";
import { AuthGate } from "./components/AuthGate";
import { LiveApp } from "./live/LiveApp";
import { ToastProvider } from "./live/toast";
import { DEMO_MODE } from "./lib/supabase";

// Normal builds: the live app on Supabase behind sign-in. Demo build (`--mode demo`): the
// original POC screens with browser-only sample data (used by the browser tests and for reference).
createRoot(document.getElementById("root")!).render(
  DEMO_MODE
    ? <StoreProvider><App /></StoreProvider>
    : <AuthGate><ToastProvider><LiveApp /></ToastProvider></AuthGate>,
);

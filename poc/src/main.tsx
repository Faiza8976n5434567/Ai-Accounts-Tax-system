import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { StoreProvider } from "./lib/store";
import { AuthGate } from "./components/AuthGate";
createRoot(document.getElementById("root")!).render(<AuthGate><StoreProvider><App /></StoreProvider></AuthGate>);

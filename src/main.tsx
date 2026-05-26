import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initAppCheck } from "./lib/appCheck";

void initAppCheck();

createRoot(document.getElementById("root")!).render(<App />);

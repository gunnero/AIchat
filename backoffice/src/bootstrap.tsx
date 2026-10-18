import { createRoot } from "react-dom/client";
import { App } from "./main";
import "@fontsource/source-sans-3/latin-400.css";
import "@fontsource/source-sans-3/latin-600.css";
import "@fontsource/source-sans-3/latin-700.css";
import "./style.css";

createRoot(document.getElementById("root")!).render(<App />);

import { createRoot } from "react-dom/client";
import { App } from "./main";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "./style.css";

createRoot(document.getElementById("root")!).render(<App />);

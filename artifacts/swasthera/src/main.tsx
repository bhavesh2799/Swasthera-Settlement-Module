import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installApiInterceptor } from "./lib/apiInterceptor";

installApiInterceptor();

createRoot(document.getElementById("root")!).render(<App />);

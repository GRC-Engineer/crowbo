import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./demo/app";
import "./tokens.css";
import "./base.css";

const root = document.getElementById("root");
if (!root) throw new Error("The Crowbo root element is missing.");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

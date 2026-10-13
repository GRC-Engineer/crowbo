import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Harness from "./harness";
import "../tokens.css";
import "../base.css";
import "../terminal.css";

const root = document.getElementById("root");
if (!root) throw new Error("The Crowbo root element is missing.");
createRoot(root).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Demo from "./demo";
import "./tokens.css";
import "./base.css";

const root = document.getElementById("root");
if (!root) throw new Error("The Crowbo root element is missing.");
createRoot(root).render(
  <StrictMode>
    <Demo
      initialArea={
        new URLSearchParams(window.location.search).get("view") === "workspace"
          ? "queue"
          : "flow"
      }
    />
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import QuestionDemo from "./question-demo";
import "./styles.css";
import "./identity.css";
import "./clarity.css";

const root = document.getElementById("root");
if (!root) throw new Error("The Crowbo root element is missing.");
createRoot(root).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).get("view") === "ask" ? (
      <QuestionDemo />
    ) : (
      <App />
    )}
  </StrictMode>,
);

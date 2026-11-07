import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import PillView from "./PillView";

document.documentElement.classList.add("pill");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PillView />
  </StrictMode>,
);

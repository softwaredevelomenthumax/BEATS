import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import { PieBuild } from "@/components/PieBuild";
import { MarquesinaApp } from "./MarquesinaApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MarquesinaApp />
    <PieBuild />
  </StrictMode>,
);

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import "@/index.css";
import { PieBuild } from "@/components/PieBuild";
import { EjecucionApp } from "./EjecucionApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Toaster richColors position="top-right" />
    <EjecucionApp />
    <PieBuild />
  </StrictMode>,
);

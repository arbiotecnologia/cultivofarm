import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
export default defineConfig({ plugins: [react()], test: { environment: "jsdom", globals: true,
  setupFiles: ["./src/test/setup.ts"], include: ["src/test/financeiro/EmitirReciboButton.authenticated.test.tsx"] },
  resolve: { alias: [
    { find: "@/components/financeiro/EmitirReciboButton", replacement: path.resolve("scripts/receipt-emission-attachments-20261021/baseline/EmitirReciboButton.tsx") },
    { find: "@", replacement: path.resolve("src") },
  ] } });
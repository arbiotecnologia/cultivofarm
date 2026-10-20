import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"], include: ["scripts/monitor-loader-renewal-20261020/*.test.tsx"] },
  resolve: { alias: [
    { find: "@/hooks/useAuth", replacement: path.resolve("scripts/monitor-loader-renewal-20261020/frontend-candidate/src/hooks/useAuth.tsx") },
    { find: "@", replacement: path.resolve("src") },
  ] },
});
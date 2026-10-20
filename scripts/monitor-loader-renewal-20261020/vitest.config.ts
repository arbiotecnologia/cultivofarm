import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"], include: process.env.MONITOR_LOADER_BASELINE === "1" ? ["scripts/monitor-loader-renewal-20261020/baseline-reproduction.test.tsx"] : process.env.MONITOR_LOADER_REGRESSION === "1" ? ["scripts/monitor-loader-renewal-20261020/*.regression.test.tsx"] : ["scripts/monitor-loader-renewal-20261020/loader.test.tsx"] },
  resolve: { alias: [
    { find: "@/hooks/useAuth", replacement: process.env.MONITOR_LOADER_BASELINE === "1" ? "/tmp/monitor-loader-validation/baseline.tsx" : path.resolve(process.env.MONITOR_CANDIDATE ?? "scripts/monitor-loader-renewal-20261020/candidate-v2/src/hooks/useAuth.tsx") },
    { find: "@", replacement: path.resolve("src") },
  ] },
});
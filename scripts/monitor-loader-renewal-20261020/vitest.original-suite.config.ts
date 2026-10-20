// Runs the ORIGINAL runtime suites (unmodified) against the candidate useAuth.
// Every resolution of src/hooks/useAuth.tsx (alias or relative) is redirected.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
const runtime = path.resolve("src/hooks/useAuth.tsx");
const candidate = path.resolve(process.env.MONITOR_CANDIDATE ?? "scripts/monitor-loader-renewal-20261020/candidate-v2/src/hooks/useAuth.tsx");
export default defineConfig({
  plugins: [react(), { name: "candidate-useAuth", enforce: "pre", async resolveId(source, importer, opts) {
    if (process.env.MONITOR_TARGET === "baseline") return null;
    if (source.includes("useAuth") && !source.includes("useAuthz")) {
      const r = await this.resolve(source, importer, { ...opts, skipSelf: true });
      if (r && r.id.split("?")[0] === runtime) return candidate;
    }
    return null;
  } }],
  resolve: { alias: [{ find: "@", replacement: path.resolve("src") }] },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"], include: (process.env.MONITOR_INCLUDE ?? "src/test/config/**/*.test.{ts,tsx}").split(";") },
});

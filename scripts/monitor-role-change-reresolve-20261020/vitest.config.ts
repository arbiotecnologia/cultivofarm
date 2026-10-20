// Candidate harness. MONITOR_TARGET=baseline runs the same files against runtime useAuth (0feac450, ace8f12d).
// MONITOR_INCLUDE selects files (default: the new candidate tests). Every resolution of src/hooks/useAuth.tsx is redirected.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
const P = "scripts/monitor-role-change-reresolve-20261020";
const runtime = path.resolve("src/hooks/useAuth.tsx");
const candidate = path.resolve(`${P}/candidate/src/hooks/useAuth.tsx`);
export default defineConfig({
  plugins: [react(), { name: "candidate-useAuth", enforce: "pre", async resolveId(source, importer, opts) {
    if (process.env.MONITOR_TARGET === "baseline") return null;
    if (source === "@/lib/authz/roleChangeReresolve") return path.resolve(`${P}/candidate/src/lib/authz/roleChangeReresolve.ts`);
    if (source.includes("useAuth") && !source.includes("useAuthz")) {
      const r = await this.resolve(source, importer, { ...opts, skipSelf: true });
      if (r && r.id.split("?")[0] === runtime) return candidate;
    }
    return null;
  } }],
  resolve: { alias: [{ find: "@/lib/authz/roleChangeReresolve", replacement: path.resolve(process.env.MONITOR_ROLECHANGE === "off" ? `${P}/audit/roleChangeReresolve.neutral.ts` : `${P}/candidate/src/lib/authz/roleChangeReresolve.ts`) }, { find: "@", replacement: path.resolve("src") }] },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"],
    include: (process.env.MONITOR_INCLUDE ?? `${P}/*.test.{ts,tsx}`).split(";") },
});

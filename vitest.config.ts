import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { delimiter, dirname } from "path";
import { existsSync, realpathSync } from "fs";

// PostgreSQL derives $libdir/sharedir from the path of the invoked binary. When `initdb`/`postgres` are reached
// through /usr/bin symlinks, the relative lookup lands outside the real installation (missing dict_snowball).
// Put the resolved bin dir of the SAME installation first so disposable batteries use a coherent PostgreSQL.
const pgCtl = (process.env.PATH ?? "").split(delimiter).map((d) => path.join(d, "pg_ctl")).find((f) => existsSync(f));
if (pgCtl) process.env.PATH = `${dirname(realpathSync(pgCtl))}${delimiter}${process.env.PATH ?? ""}`;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@edge-shared": path.resolve(__dirname, "./supabase/functions/_shared"),
    },
  },
});

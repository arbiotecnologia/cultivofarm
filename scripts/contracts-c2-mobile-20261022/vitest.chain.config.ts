// INACTIVE C2. Full candidate chain: every coordinated runtime-copy (INCLUDING useAuth/AuthProvider,
// guards, selector, useMyPartner, portalContext, contract) + candidate MobileLayout. Nothing from src
// replaces a candidate file; remaining imports resolve to the real runtime.
import { defineConfig } from "vitest/config";
import base from "../../vitest.config";
import fs from "node:fs"; import path from "node:path";
const coord = path.resolve(__dirname, "../contracts-c2-20261022/coordinated/frontend");
const rows = JSON.parse(fs.readFileSync(path.join(coord, "manifest.json"), "utf8")) as { path: string }[];
export const chainAliases = [
  ...rows.map(r => ({ find: "@/" + r.path.slice(4).replace(/\.tsx?$/, ""), replacement: path.join(coord, "runtime-copies", r.path) })),
  { find: "@/pages/app/MobileLayout", replacement: path.resolve(__dirname, "runtime-copies/src/pages/app/MobileLayout.tsx") },
  { find: "@", replacement: path.resolve(__dirname, "../../src") },
];
export default defineConfig({ ...base, resolve: { ...base.resolve, alias: chainAliases }, test: { ...base.test, include: ["scripts/contracts-c2-mobile-20261022/*.test.{ts,tsx}"] } });

// INACTIVE. Whole coordinated frontend: every manifest copy aliased; nothing from src
// replaces a candidate file. Runs ALL package tests together (C2, mobile, finance, admin).
import { defineConfig } from "vitest/config";
import base from "../../../../vitest.config";
import fs from "node:fs"; import path from "node:path";
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8")) as { path: string }[];
const S = path.resolve(__dirname, "../../..");
export default defineConfig({ ...base, resolve: { alias: [
  ...rows.map(r => ({ find: new RegExp("^@/" + r.path.slice(4).replace(/\.tsx?$/, "").replace(/[/.]/g, m => "\\" + m) + "$"), replacement: path.join(__dirname, "runtime-copies", r.path) })),
  { find: "@", replacement: path.resolve(S, "../src") },
] }, test: { ...base.test, include: [
  "scripts/contracts-c2-mobile-20261022/*.test.tsx",
  "scripts/contracts-c2-20261022/coordinated/frontend/*.test.{ts,tsx}",
  "scripts/contracts-c2-20261022/frontend/*.test.{ts,tsx}",
  "scripts/partner-own-finance-20261022/*.test.{ts,tsx}",
  "scripts/contracts-c2-20261022/integral/frontend/*.test.{ts,tsx}",
  "src/test/catalogo/ownerCatalogFilters.session.test.tsx",
] } });

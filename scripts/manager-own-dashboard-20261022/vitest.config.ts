import { defineConfig } from "vitest/config";
import base from "../../vitest.config";
import { fileURLToPath } from "node:url";
const local = (name: string) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig({ ...base, resolve: { ...base.resolve, alias: [
  { find: "@/lib/comercial/ownOrderIndicators", replacement: local("./ownOrderIndicators.ts") },
  { find: "@", replacement: local("../../src") },
] }, test: { ...base.test, include: ["scripts/manager-own-dashboard-20261022/*.test.{ts,tsx}", "src/test/config/commercialOwnOrders.session.test.tsx"] } });
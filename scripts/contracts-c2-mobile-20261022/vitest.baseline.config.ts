import { defineConfig } from "vitest/config";
import base from "../../vitest.config";
import { fileURLToPath } from "node:url";
const local = (name: string) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig({ ...base, resolve: { ...base.resolve, alias: [
  { find: "@/hooks/useAvailableContexts", replacement: local("../contracts-c2-20261022/coordinated/frontend/runtime-copies/src/hooks/useAvailableContexts.ts") },
  { find: "@/lib/authz/multiProfileContract", replacement: local("../contracts-c2-20261022/coordinated/frontend/runtime-copies/src/lib/authz/multiProfileContract.ts") },
  { find: "@/pages/app/MobileLayout", replacement: local("../../src/pages/app/MobileLayout.tsx") },
  { find: "@", replacement: local("../../src") },
] }, test: { ...base.test, include: ["scripts/contracts-c2-mobile-20261022/*.test.{ts,tsx}"] } });

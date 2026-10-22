import { defineConfig } from "vitest/config";
import base from "../../vitest.config";
import { fileURLToPath } from "node:url";
const local = (name: string) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig({ ...base, resolve: { ...base.resolve, alias: [
  { find: "@/lib/catalogo/catalogAccess", replacement: local("./catalogAccess.ts") },
  { find: "@/components/catalogo/OwnerCatalog", replacement: local("./OwnerCatalog.tsx") },
  { find: "@", replacement: local("../../src") },
] }, test: { ...base.test, include: ["scripts/contracts-c2-cat-20261022/*.test.{ts,tsx}"] } });
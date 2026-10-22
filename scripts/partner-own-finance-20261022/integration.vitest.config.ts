import { defineConfig } from "vitest/config";
import path from "node:path";
import base from "../../vitest.config";
export default defineConfig({
  ...base,
  resolve: { alias: [
    { find: "@/pages/portal-parceiro/PortalParceiroLayout", replacement: path.resolve(__dirname, "runtime-copies/src/pages/portal-parceiro/PortalParceiroLayout.tsx") },
    { find: "@/components/comercial/OwnerFinance", replacement: path.resolve(__dirname, "runtime-copies/src/components/comercial/OwnerFinance.tsx") },
    { find: "@/hooks/useOwnFinance", replacement: path.resolve(__dirname, "runtime-copies/src/hooks/useOwnFinance.ts") },
    { find: "@/lib/comercial/financeAccess", replacement: path.resolve(__dirname, "financeAccess.ts") },
    { find: "@/lib/comercial/financeContract", replacement: path.resolve(__dirname, "financeContract.ts") },
    { find: "@", replacement: path.resolve(__dirname, "../../src") },
  ] },
  test: { ...base.test, include: ["src/test/catalogo/ownerCatalogFilters.session.test.tsx", "scripts/partner-own-finance-20261022/layout-finance.integration.test.tsx"] },
});
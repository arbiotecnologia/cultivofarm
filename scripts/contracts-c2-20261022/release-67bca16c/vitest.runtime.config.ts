// Release verification: production modules resolve ONLY to promoted src.
import { defineConfig } from "vitest/config";
import base from "../../../vitest.config";
import path from "node:path";
const root = path.resolve(__dirname, "../../..");
const source = (p: string) => path.join(root, "src", p);
export default defineConfig({ ...base,
  plugins: [...(base.plugins ?? []), {
    name: "c2-promoted-source-only", enforce: "pre" as const,
    resolveId(id: string, importer?: string) {
      if (!importer || !id.startsWith(".")) return;
      // Existing candidate tests import these helpers relatively. Route the
      // actual production modules to src, retaining test-only SQL decoders.
      const targets: Record<string, string> = {
        "scripts/contracts-c2-20261022/coordinated/frontend/multiProfileContract": "lib/authz/multiProfileContract.ts",
        "scripts/contracts-c2-20261022/frontend/partnerLifecycle": "lib/configuracoes/partnerLifecycle.ts",
        "scripts/contracts-c2-20261022/frontend/PartnerLifecycleFields": "components/configuracoes/PartnerLifecycleFields.tsx",
        "scripts/partner-own-finance-20261022/financeContract": "lib/comercial/financeContract.ts",
        "scripts/partner-own-finance-20261022/financeAccess": "lib/comercial/financeAccess.ts",
        "scripts/partner-own-finance-20261022/useOwnFinance": "hooks/useOwnFinance.ts",
      };
      const resolved = path.relative(root, path.resolve(path.dirname(importer.split("?")[0]), id)).replace(/\.tsx?$/, "");
      return targets[resolved] ? source(targets[resolved]) : undefined;
    },
  }],
  resolve: { alias: { "@": source(""), "@edge-shared": path.join(root, "supabase/functions/_shared") } },
  test: { ...base.test, include: [
    "scripts/contracts-c2-mobile-20261022/*.test.tsx",
    "scripts/contracts-c2-20261022/coordinated/frontend/*.test.{ts,tsx}",
    "scripts/contracts-c2-20261022/frontend/*.test.{ts,tsx}",
    "scripts/partner-own-finance-20261022/*.test.{ts,tsx}",
    "scripts/contracts-c2-20261022/integral/frontend/*.test.{ts,tsx}",
    "scripts/contracts-c2-20261022/release-67bca16c/*.test.{ts,tsx}",
    "src/test/config/authProviderCallback.test.tsx",
    "src/test/config/authzFoundation.integration.test.tsx",
    "src/test/config/monitorRetryReresolve.integration.test.tsx",
    "src/test/config/retryLoadingRace.integration.test.tsx",
    "src/test/config/portalContextRecovery.integration.test.tsx",
    "src/test/config/b2bOpenSession.integration.test.tsx",
  ] },
});
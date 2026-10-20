import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
export default defineConfig({plugins:[react()],resolve:{alias:{"@/components/cockpit/CQComparativoTable":"/tmp/cq-review-validation/CQComparativoTable.tsx","@/hooks/useCQReferencia":"/tmp/cq-review-validation/useCQReferencia.ts","@":path.resolve("src")}},test:{environment:"jsdom",globals:true,setupFiles:[path.resolve("src/test/setup.ts")],include:["scripts/manual-cq-recovery-20261020/*.test.tsx"]}});

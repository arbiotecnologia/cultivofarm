import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
export default defineConfig({plugins:[react()],resolve:{alias:[{find:/^\/tmp\/cq-review-validation\/(CQComparativoTable|RegistrarCQDialog)$/,replacement:"/dev-server/src/components/cockpit/$1.tsx"},{find:/^\/tmp\/cq-review-validation\/useCQReferencia$/,replacement:"/dev-server/src/hooks/useCQReferencia.ts"},{find:"@",replacement:path.resolve("/dev-server/src")}]},test:{root:"/dev-server",environment:"jsdom",globals:true,setupFiles:["/dev-server/src/test/setup.ts"],include:["scripts/manual-cq-recovery-20261020/*.test.tsx","src/test/lotes/**","src/test/cq/**"]}});

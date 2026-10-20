import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
export default defineConfig({plugins:[react()],resolve:{alias:{"@":path.resolve("src")}},test:{environment:"jsdom",globals:true,setupFiles:[path.resolve("src/test/setup.ts")],include:["scripts/manual-cq-recovery-20261020/*.test.tsx"]}});

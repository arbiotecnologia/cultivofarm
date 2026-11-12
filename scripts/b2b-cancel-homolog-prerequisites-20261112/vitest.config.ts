import { defineConfig } from "vitest/config";
import base from "../../vitest.config";
export default defineConfig({ ...base, test: { ...base.test, include: ["scripts/b2b-cancel-homolog-prerequisites-20261112/ui/*.test.tsx", "src/test/fiscal/cancellationPolicyCandidate.ui.test.tsx"], maxWorkers: 2 } });
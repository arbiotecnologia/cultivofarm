import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../../vitest.config";
export default mergeConfig(base, defineConfig({ test: { include: ["scripts/owner-orders-20261023/p1-isolation/*.test.tsx"] } }));

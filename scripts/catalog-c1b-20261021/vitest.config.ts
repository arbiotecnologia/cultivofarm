import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../vitest.config";

export default mergeConfig(base, defineConfig({
  test: { include: ["scripts/catalog-c1b-20261021/frontend/**/*.test.tsx"] },
}));
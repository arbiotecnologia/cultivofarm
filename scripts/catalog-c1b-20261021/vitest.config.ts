import { defineConfig } from "vitest/config";
import base from "../../vitest.config";

export default defineConfig({
  ...base,
  test: { ...base.test, include: ["scripts/catalog-c1b-20261021/frontend/**/*.test.tsx"] },
});
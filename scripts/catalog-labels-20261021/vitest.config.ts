import { defineConfig } from "vitest/config";
import base from "../../vitest.config";

export default defineConfig({
  ...base,
  test: { ...base.test, include: ["scripts/catalog-labels-20261021/frontend/**/*.test.tsx"] },
});

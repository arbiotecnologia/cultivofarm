import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../../vitest.config";

export default mergeConfig(base, defineConfig({
  test: {
    setupFiles: ["./src/test/config/runtimeGateNoNetwork.ts"],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
}));
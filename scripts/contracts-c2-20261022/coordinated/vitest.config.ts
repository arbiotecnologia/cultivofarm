import { defineConfig } from "vitest/config";
import base from "../../../vitest.config";
export default defineConfig({...base,test:{...base.test,include:["scripts/contracts-c2-20261022/coordinated/frontend/**/*.test.{ts,tsx}"]}});
import {defineConfig} from "vitest/config";
import base from "../../vitest.config";
export default defineConfig({...base,test:{...base.test,include:["scripts/partner-own-finance-20261022/*.test.{ts,tsx}"],exclude:["scripts/partner-own-finance-20261022/layout-finance.integration.test.tsx"]}});
import { defineConfig } from "vitest/config";
import base from "../../../vitest.config";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(__dirname,"runtime-copies/src");
export default defineConfig({...base,resolve:{alias:[...JSON.parse(fs.readFileSync(path.resolve(__dirname,"frontend-drift.json"),"utf8")).map((r:{path:string})=>({find:"@/"+r.path.slice(4).replace(/\.(tsx?|jsx?)$/,""),replacement:path.resolve(root,r.path.slice(4))})),{find:"@",replacement:path.resolve(__dirname,"../../../src")}]},test:{...base.test,include:["scripts/fiscal-products-refinement-20261022/global/*.test.tsx"]}});

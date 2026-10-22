import {defineConfig} from "vitest/config";
import base from "../../../vitest.config";
import fs from "node:fs";import path from "node:path";
const rows=JSON.parse(fs.readFileSync(path.resolve(__dirname,"frontend/manifest.json"),"utf8")) as {path:string}[];
export default defineConfig({...base,resolve:{alias:[...rows.filter(r=>r.path!=="src/hooks/useAuth.tsx").map(r=>({find:"@/"+r.path.slice(4).replace(/\.tsx?$/,""),replacement:path.resolve(__dirname,"frontend/runtime-copies",r.path)})),{find:"@",replacement:path.resolve(__dirname,"../../../src")}]},test:{...base.test,include:["scripts/contracts-c2-20261022/coordinated/frontend/selector.integration.test.tsx"]}});

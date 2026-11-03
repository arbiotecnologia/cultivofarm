import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";

/**
 * Loads the real create-user entrypoint for isolated execution. The entrypoint now exports `handler` and only serves
 * under `import.meta.main` (Deno module semantics); here the module is evaluated as a function body, so the guard is
 * replaced by an unconditional `Deno.serve` registration and the remaining npm imports are injected as parameters.
 * No authorization branch of the handler is altered.
 */
export function createUserEntrypointJavascript(transform: (source: string) => string = (s) => s): string {
  const source = transform(readFileSync("supabase/functions/create-user/index.ts", "utf8"))
    .replace(/^import .*createClient.*;\s*/m, "")
    .replace(/^import \{ corsHeaders \} from .*;\s*/m, "")
    .replace(/^import \{ z \} from .*;\s*/m, "")
    .replace(/^export (async function|function|const) /gm, "$1 ")
    .replace(/^if \(import\.meta\.main\) Deno\.serve\(/m, "Deno.serve(");
  if (/import\.meta|^import |^export /m.test(source)) throw new Error("create-user entrypoint has unsupported module syntax");
  (globalThis as Record<string, unknown>).__cfCreateUserDeps = { z, corsHeaders: ENTRYPOINT_CORS_HEADERS };
  return "const { z, corsHeaders } = globalThis.__cfCreateUserDeps;\n" + ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
}

export const ENTRYPOINT_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

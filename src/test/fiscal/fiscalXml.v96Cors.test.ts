import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";

const source = readFileSync("supabase/functions/_shared/fiscal/corsAllowlist.ts", "utf8");
const code = ts.transpileModule(source.replace(/^export /gm, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const cors: (origin: string | null) => { allowed: boolean; headers: Record<string, string> } =
  new Function("Deno", code + "\nreturn fiscalCorsHeaders;")({ env: { get: () => undefined } });

for (const [label, origin, allowed] of [
  ["app canônico", "https://app.cultivofarm.com.br", true],
  ["preview autorizado", "https://id-preview--a79bb3db-f665-466d-bf41-ee8c6cb91fab.lovable.app", true],
  ["origem externa", "https://evil.example", false],
  ["sufixo malicioso", "https://app.cultivofarm.com.br.evil.example", false],
  ["origem ausente", null, false],
] as const) {
  it(`CORS v96: ${label}`, () => {
    const result = cors(origin);
    expect(result.allowed).toBe(allowed);
    expect(result.headers["Access-Control-Allow-Origin"]).toBe(allowed ? origin : "null");
  });
}
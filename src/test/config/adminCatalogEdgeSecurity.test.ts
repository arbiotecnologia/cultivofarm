import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const FUNCTIONS = [
  "supabase/functions/admin-wipe-produtos-catalog/index.ts",
  "supabase/functions/admin-audit-produtos-orfaos/index.ts",
] as const;

describe("funções administrativas de catálogo — fronteiras de origem e autenticação", () => {
  it.each(FUNCTIONS)("%s reutiliza CORS fail-closed sem wildcard", (path) => {
    const source = read(path);
    expect(source).toContain("isTrustedOrigin(origin)");
    expect(source).toContain("handlePreflight(req)");
    expect(source).toContain("corsHeadersFor(origin)");
    expect(source).not.toContain('"Access-Control-Allow-Origin": "*"');
  });

  it.each(FUNCTIONS)("%s valida JWT e papel administrador antes do cliente elevado", (path) => {
    const source = read(path);
    const authIndex = source.indexOf("auth.getClaims(token)");
    const roleIndex = Math.max(source.indexOf('eq("role", "administrador")'), source.indexOf('rpc("has_role"')));
    const elevatedIndex = source.indexOf("SUPABASE_SERVICE_ROLE_KEY");
    expect(authIndex).toBeGreaterThan(0);
    expect(roleIndex).toBeGreaterThan(authIndex);
    expect(elevatedIndex).toBeGreaterThan(0);
  });

  it("não devolve detalhes internos no caminho de erro da função destrutiva", () => {
    const source = read(FUNCTIONS[0]);
    expect(source).not.toContain('detail: roleErr.message');
    expect(source).not.toContain('detail: (e as Error).message');
  });
});
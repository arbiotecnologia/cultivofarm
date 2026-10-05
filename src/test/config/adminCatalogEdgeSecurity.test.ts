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

  it.each(FUNCTIONS)("%s valida JWT e Superadmin antes do cliente elevado", (path) => {
    const source = read(path);
    const authIndex = source.indexOf("auth.getClaims(token)");
    const roleIndex = Math.max(
      source.indexOf('rpc("is_platform_superadmin"'),
      source.indexOf('rpc(\n      "is_platform_superadmin"'),
    );
    const elevatedIndex = source.indexOf("SUPABASE_SERVICE_ROLE_KEY");
    expect(authIndex).toBeGreaterThan(0);
    expect(roleIndex).toBeGreaterThan(authIndex);
    expect(elevatedIndex).toBeGreaterThan(0);
  });

  it("exige confirmação explícita e não tem fallback destrutivo no navegador", () => {
    const edge = read(FUNCTIONS[0]);
    const client = read("src/lib/protocolos/seedCatalogoARBioV13.ts");
    expect(edge).toContain("explicit_confirmation_required");
    expect(edge).toContain("APAGAR CATALOGO GLOBAL");
    expect(client).not.toContain("wipeCatalogoProdutosViaClient");
    expect(client).not.toContain("export async function wipeCatalogoProdutos");
    expect(client).not.toContain("export async function executeOrphanCleanup");
  });

  it("exige motivo e correlação e delega o wipe à RPC transacional", () => {
    const edge = read(FUNCTIONS[0]);
    const migration = read("supabase/migrations/20261005210938_9fe86779-c1d6-4552-978c-1c1a7db7991e.sql");
    expect(edge).toContain("reason_required");
    expect(edge).toContain("correlation_id_required");
    expect(edge).toContain('rpc("platform_wipe_global_product_catalog"');
    expect(edge).not.toContain("WIPE_ORDER");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("catalog_platform_admin_audit");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.platform_wipe_global_product_catalog(uuid, text, uuid) TO service_role");
    expect(migration).not.toContain("'fiscal_invoices'");
    expect(migration).not.toContain("'ordens_servico'");
  });

  it("não devolve detalhes internos no caminho de erro da função destrutiva", () => {
    const source = read(FUNCTIONS[0]);
    expect(source).not.toContain('detail: roleErr.message');
    expect(source).not.toContain('detail: (e as Error).message');
  });
});
/**
 * H7e — Gates estáticos do CORS fiscal e do marcador de release.
 *
 * O helper compartilhado precisa: unir default versionado + ambiente
 * (um secret nunca elimina origens canônicas), normalizar a origem,
 * nunca usar wildcard e expor o marcador de release não sensível.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const HELPER = "supabase/functions/_shared/fiscal/corsAllowlist.ts";
const FISCAL_FUNCTIONS = [
  "fiscal-certificate-upload",
  "fiscal-certificate-revoke",
  "fiscal-xml-engine",
  "fiscal-event-sign",
  "fiscal-sefaz-transport",
  "fiscal-binding-diagnostics",
  "fiscal-preflight",
  "fiscal-cnpj-lookup",
];

describe("H7e — CORS fiscal canônico", () => {
  const helper = read(HELPER);

  it("mantém origem do preview autorizado e demais origens canônicas", () => {
    expect(helper).toContain("a79bb3db-f665-466d-bf41-ee8c6cb91fab");
    expect(helper).toContain("https://cultivofarm.com.br");
    expect(helper).toContain("http://localhost:8080");
  });

  it("faz UNIÃO entre default versionado e origens de ambiente", () => {
    expect(helper).toContain("FISCAL_CORS_ALLOWLIST");
    expect(helper).toContain("FISCAL_ALLOWED_ORIGINS");
    expect(helper).toMatch(/new Set\(\[\s*\n\s*\.\.\.canonical/);
    // nunca substitui o default por ausência/presença do secret
    expect(helper).not.toMatch(/fromEnv\.length > 0 \? fromEnv/);
  });

  it("normaliza a origem e nunca usa wildcard", () => {
    expect(helper).toContain("new URL(raw).origin");
    expect(helper).not.toContain('"Access-Control-Allow-Origin": "*"');
  });

  it("expõe marcador de release não sensível", () => {
    expect(helper).toContain("FISCAL_RELEASE_ID");
    expect(helper).toContain("X-AR-Bio-Function-Version");
    expect(helper).not.toMatch(/SERVICE_ROLE|MASTER_KEY|password/i);
  });

  it("todas as funções fiscais usam o helper compartilhado", () => {
    for (const fn of FISCAL_FUNCTIONS) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect(src).toContain("_shared/fiscal/corsAllowlist.ts");
      expect(src).not.toContain('"Access-Control-Allow-Origin": "*"');
    }
  });

  it("upload trata OPTIONS antes da autenticação", () => {
    const src = read("supabase/functions/fiscal-certificate-upload/index.ts");
    const optionsIdx = src.indexOf('req.method === "OPTIONS"');
    const authIdx = src.indexOf('req.headers.get("Authorization")');
    expect(optionsIdx).toBeGreaterThan(0);
    expect(optionsIdx).toBeLessThan(authIdx);
  });
});

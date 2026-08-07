import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guarda fail-closed do vinculo de backend.
 *
 * Contexto: o backend Cloud acidental (prefixo "yzszl") ja regenerou .env e
 * src/integrations/supabase/types.ts mais de uma vez, apontando a aplicacao
 * para um projeto que NAO e o staging autorizado. Este teste falha na suite
 * antes que a divergencia chegue a uma auditoria.
 *
 * Ambiente autorizado: staging ikaauvsflpmamgxmkhoq.
 * Producao navfzbwgwzruipouyfnk NUNCA pode aparecer como conexao.
 */

const ROOT = resolve(__dirname, "../../..");
const STAGING_REF = "ikaauvsflpmamgxmkhoq";
const PRODUCTION_REF = "navfzbwgwzruipouyfnk";
const ACCIDENTAL_REF_PREFIX = "yzszl";

const read = (relative: string): string =>
  readFileSync(resolve(ROOT, relative), "utf8");

const envValue = (env: string, key: string): string | null => {
  const match = env.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, "m"));
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, "");
};

describe("Vinculo de backend — .env / client.ts / config.toml", () => {
  const env = read(".env");
  const client = read("src/integrations/supabase/client.ts");
  const toml = read("supabase/config.toml");

  it(".env aponta para o staging autorizado", () => {
    expect(envValue(env, "VITE_SUPABASE_PROJECT_ID")).toBe(STAGING_REF);
    expect(envValue(env, "VITE_SUPABASE_URL")).toBe(
      `https://${STAGING_REF}.supabase.co`,
    );
  });

  it("client.ts aponta para o staging autorizado", () => {
    expect(client).toContain(`https://${STAGING_REF}.supabase.co`);
  });

  it("config.toml aponta para o staging autorizado", () => {
    expect(toml).toMatch(new RegExp(`^project_id\\s*=\\s*"${STAGING_REF}"`, "m"));
  });

  it("a chave publicavel do .env e exatamente a anon do client.ts", () => {
    const fromClient = client.match(
      /const SUPABASE_PUBLISHABLE_KEY = "([^"]+)"/,
    )?.[1];
    expect(fromClient, "client.ts sem chave anon").toBeTruthy();

    const fromEnv = envValue(env, "VITE_SUPABASE_PUBLISHABLE_KEY");
    if (fromEnv !== null) {
      // Comparacao sem revelar o valor.
      expect(fromEnv === fromClient).toBe(true);
    }
  });

  it("nenhum arquivo de conexao referencia o backend acidental", () => {
    for (const [name, content] of [
      [".env", env],
      ["client.ts", client],
      ["config.toml", toml],
    ] as const) {
      expect(
        content.includes(ACCIDENTAL_REF_PREFIX),
        `${name} referencia backend acidental`,
      ).toBe(false);
    }
  });

  it("producao nunca aparece como conexao", () => {
    for (const [name, content] of [
      [".env", env],
      ["client.ts", client],
      ["config.toml", toml],
    ] as const) {
      expect(
        content.includes(PRODUCTION_REF),
        `${name} referencia producao`,
      ).toBe(false);
    }
  });
});

describe("Contrato de tipos do staging", () => {
  const types = read("src/integrations/supabase/types.ts");

  it("types.ts nao e um stub", () => {
    // O contrato real do staging tem dezenas de milhares de linhas; o stub
    // gerado pelo backend acidental tinha 155.
    expect(types.split("\n").length).toBeGreaterThan(5000);
  });

  it("types.ts cobre as relacoes criticas do dominio fiscal/regulatorio", () => {
    const required = [
      "microrganismos",
      "microorganism_fiscal_profiles",
      "microorganism_regulatory_dossiers",
      "microorganism_ncm_candidates",
      "microorganism_regulatory_presentations",
      "microorganism_regulatory_checklist",
      "fiscal_matrix_load_ledger",
      "company_fiscal_settings",
      "ordens_servico",
      "notificacoes_operacionais",
      "user_roles",
    ];
    const missing = required.filter((table) => !types.includes(`${table}: {`));
    expect(missing).toEqual([]);
  });
});

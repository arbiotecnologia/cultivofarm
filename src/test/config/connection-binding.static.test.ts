import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guarda fail-closed do vinculo de backend.
 *
 * Contexto: bindings divergentes ja regeneraram .env e types.ts, apontando a
 * aplicacao para projetos que NAO sao o CultivoFarm autorizado. Este teste falha na suite
 * antes que a divergencia chegue a uma auditoria.
 *
 * Ambiente autorizado: CultivoFarm swzpzcwiasxmjutrmvkm.
 * Producao navfzbwgwzruipouyfnk NUNCA pode aparecer como conexao.
 */

const ROOT = resolve(__dirname, "../../..");
const CULTIVOFARM_REF = "swzpzcwiasxmjutrmvkm";
const LEGACY_STAGING_REF = "ikaauvsflpmamgxmkhoq";
const PRODUCTION_REF = "navfzbwgwzruipouyfnk";
const ACCIDENTAL_REF_PREFIX = "yzszl";

const read = (relative: string): string =>
  readFileSync(resolve(ROOT, relative), "utf8");

describe("Vinculo de backend — cliente runtime / config.toml", () => {
  const client = read("src/integrations/supabase/client.ts");
  const toml = read("supabase/config.toml");

  it("client.ts aponta para o CultivoFarm autorizado", () => {
    const guard = read("src/integrations/supabase/bindingGuard.ts");
    expect(guard).toContain(CULTIVOFARM_REF);
    expect(client).toContain(`https://${CULTIVOFARM_REF}.supabase.co`);
    expect(client).not.toContain("import.meta.env");
  });

  it("config.toml aponta para o CultivoFarm autorizado", () => {
    expect(toml).toMatch(new RegExp(`^project_id\\s*=\\s*"${CULTIVOFARM_REF}"`, "m"));
  });

  it("o cliente preserva uma chave publicavel sem usar fallback ambiental", () => {
    const fromClient = client.match(
      /const SUPABASE_PUBLISHABLE_KEY = "([^"]+)"/,
    )?.[1];
    expect(fromClient?.startsWith("sb_publishable_"), "client.ts sem chave publicavel").toBe(true);
    expect(client).not.toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
  });

  it("nenhum arquivo de conexao referencia o backend acidental", () => {
    for (const [name, content] of [
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
      ["client.ts", client],
      ["config.toml", toml],
    ] as const) {
      expect(
        content.includes(PRODUCTION_REF),
        `${name} referencia producao`,
      ).toBe(false);
    }
  });

  it("paginas com Edge Functions reutilizam as constantes canonicas do cliente", () => {
    const pages = [
      "src/components/protocolos/catalog/ProfileFieldAI.tsx",
      "src/pages/configuracoes/ComunicacaoConfigTab.tsx",
    ] as const;

    for (const page of pages) {
      const content = read(page);
      expect(content, `${page} sem import das constantes`).toMatch(
        /import\s*{[^}]*SUPABASE_URL[^}]*SUPABASE_PUBLISHABLE_KEY[^}]*}\s*from\s*"@\/integrations\/supabase\/client"/s,
      );
      expect(
        content.includes("VITE_SUPABASE_URL"),
        `${page} ainda le VITE_SUPABASE_URL`,
      ).toBe(false);
      expect(
        content.includes("VITE_SUPABASE_PUBLISHABLE_KEY"),
        `${page} ainda le VITE_SUPABASE_PUBLISHABLE_KEY`,
      ).toBe(false);
    }
  });

  it("client.ts exporta as constantes canonicas", () => {
    expect(client).toMatch(/export const SUPABASE_URL\s*=/);
    expect(client).toMatch(/export const SUPABASE_PUBLISHABLE_KEY\s*=/);
    expect(client).toContain("assertCanonicalSupabaseBinding(SUPABASE_URL)");
    expect(client.indexOf("assertCanonicalSupabaseBinding(SUPABASE_URL)")).toBeLessThan(
      client.indexOf("createClient<Database>"),
    );
  });

  it("featureFlags.ts nao expande o objeto completo de ambiente", () => {
    const flags = read("src/config/featureFlags.ts");
    expect(flags.includes("import.meta.env?"), "featureFlags usa import.meta.env?").toBe(false);
  });

  it("staging legado nunca aparece como conexao ativa", () => {
    for (const [name, content] of [
      ["client.ts", client],
      ["config.toml", toml],
    ] as const) {
      expect(content.includes(LEGACY_STAGING_REF), `${name} referencia staging legado`).toBe(false);
    }
  });
});


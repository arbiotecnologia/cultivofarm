/**
 * Guarda: a única fonte de tipos do banco é src/integrations/supabase/cultivofarm.types.ts.
 *
 * O arquivo src/integrations/supabase/types.ts é gerado automaticamente por
 * outro ambiente (binding não canônico) e está desatualizado. Nenhum código de
 * aplicação pode importá-lo; testes estáticos que conferem contrato de schema
 * também devem ler o arquivo canônico.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

const LEGACY = "@/integrations/supabase/types";
const LEGACY_REL = "integrations/supabase/types";

function grep(pattern: string, dir: string): string[] {
  try {
    const out = execFileSync(
      "grep",
      ["-rl", "--include=*.ts", "--include=*.tsx", "-F", pattern, dir],
      { encoding: "utf8" },
    );
    return out.split("\n").filter(Boolean);
  } catch {
    return []; // grep sai com 1 quando não há match
  }
}

describe("Fonte canônica de tipos do banco", () => {
  it("nenhum arquivo de aplicação importa o types.ts legado", () => {
    const hits = [...grep(LEGACY, "src"), ...grep(`./${LEGACY_REL.split("/").pop()}`, "src/integrations/supabase")]
      .filter((f) => !f.startsWith("src/test/"))
      .filter((f) => f !== "src/integrations/supabase/types.ts");
    expect(hits).toEqual([]);
  });

  it("o cliente do banco usa os tipos canônicos", () => {
    const [client] = grep("cultivofarm.types", "src/integrations/supabase");
    expect(client).toBeDefined();
  });
});

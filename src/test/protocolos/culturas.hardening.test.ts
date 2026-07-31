import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapCulturaError } from "@/hooks/useCulturas";

describe("Protocolos › Culturas — proteções e mensagens", () => {
  it("traduz violação do índice único case-insensitive", () => {
    expect(
      mapCulturaError({ code: "23505", message: 'duplicate key value violates unique constraint "culturas_nome_ci_uidx"' })
    ).toMatch(/Já existe uma cultura com esse nome/i);
  });

  it("traduz bloqueio de exclusão de cultura em uso orientando desativação", () => {
    const msg = mapCulturaError({
      code: "23503",
      message: "Cultura em uso nao pode ser excluida. Desative a cultura em vez de excluir.",
    });
    expect(msg).toMatch(/em uso/i);
    expect(msg).toMatch(/desative/i);
  });

  it("traduz negativa de RLS em mensagem de permissão", () => {
    expect(
      mapCulturaError({ code: "42501", message: "new row violates row-level security policy" })
    ).toMatch(/permissão/i);
  });

  it("mantém mensagem original para erros desconhecidos", () => {
    expect(mapCulturaError({ message: "boom" })).toBe("boom");
  });
});

describe("Protocolos › Culturas — desacoplamento de visita técnica (P1)", () => {
  it("o diálogo de Cultura não referencia objetivos de visita", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/pages/Protocolos.tsx", "utf8");
    expect(src).not.toMatch(/objetivos_visita_sugestoes/);
    expect(src).not.toMatch(/Objetivos de Visita/i);
    expect(src).not.toMatch(/Objetivo da visita/i);
  });

  it('o gerenciador de culturas do catálogo usa o rótulo "Objetivo agronômico"', async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/components/protocolos/catalog/CropsManager.tsx", "utf8");
    expect(src).toContain("Objetivo agronômico");
    expect(src).not.toContain("Objetivo de uso");
    // compatibilidade de schema preservada
    expect(src).toContain("objetivo_uso");
  });

  it("listas de seleção de cultura consideram apenas culturas ativas", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/hooks/useCatalogTargetsCrops.ts", "utf8");
    expect(src).toMatch(/from\("culturas"\)[\s\S]*?\.eq\("ativo", true\)/);
  });
});

import { describe, expect, it } from "vitest";
import { mapNfeReadinessError } from "@/hooks/useFiscalNfeReadiness";

describe("F3 — prontidão NF-e (mapeamento de erros do servidor)", () => {
  it("traduz FISCAL_FORBIDDEN sem vazar detalhes internos", () => {
    const msg = mapNfeReadinessError(
      "FISCAL_FORBIDDEN: perfil sem permissao de leitura fiscal.",
    );
    expect(msg).toContain("competência fiscal");
    expect(msg).not.toContain("FISCAL_FORBIDDEN");
  });

  it("traduz emitente não configurado", () => {
    expect(mapNfeReadinessError("FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.")).toContain(
      "Emitente ainda não cadastrado",
    );
  });

  it("usa mensagem genérica para erros desconhecidos", () => {
    expect(mapNfeReadinessError("57014 statement timeout")).toBe(
      "Não foi possível carregar a prontidão NF-e. Tente novamente.",
    );
    expect(mapNfeReadinessError(null)).toContain("Não foi possível");
  });
});

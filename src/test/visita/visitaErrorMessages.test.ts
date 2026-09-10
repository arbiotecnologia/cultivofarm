/**
 * H9-GR — mensagens amigáveis das RPCs de visita.
 */
import { describe, it, expect } from "vitest";
import {
  mensagemAmigavelVisita,
  codigoTecnicoVisita,
  CODIGOS_VISITA_MAPEADOS,
} from "@/lib/visita/visitaErrorMessages";

describe("mensagemAmigavelVisita", () => {
  it("traduz a duplicidade de check-in para português amigável", () => {
    const msg = mensagemAmigavelVisita({ message: "checkin_duplicado_para_tipo_no_ciclo" });
    expect(msg).toBe("Este check-in já foi registrado para esta visita. Não é necessário repetir.");
    expect(msg).not.toContain("checkin_duplicado_para_tipo_no_ciclo");
  });

  it("nunca devolve o código cru para nenhum código mapeado", () => {
    for (const codigo of CODIGOS_VISITA_MAPEADOS) {
      const msg = mensagemAmigavelVisita(new Error(codigo));
      expect(msg).not.toContain(codigo);
      expect(msg.length).toBeGreaterThan(10);
    }
  });

  it("preserva o código técnico apenas para log interno", () => {
    expect(codigoTecnicoVisita({ message: 'erro: "checkout_duplicado"' })).toBe("checkout_duplicado");
    expect(codigoTecnicoVisita({ message: "algo inesperado" })).toBeNull();
  });

  it("usa o fallback amigável quando o erro é desconhecido", () => {
    expect(mensagemAmigavelVisita(new Error("boom"), "Falhou aqui.")).toBe("Falhou aqui.");
    expect(mensagemAmigavelVisita(undefined)).toBe(
      "Não foi possível concluir a operação. Tente novamente.",
    );
  });

  it("traduz negativa de permissão sem revelar existência do registro", () => {
    const msg = mensagemAmigavelVisita({ message: "forbidden_visita_nao_atribuido" });
    expect(msg).toBe("Você não tem permissão para registrar esta visita.");
    expect(msg.toLowerCase()).not.toContain("existe");
  });
});

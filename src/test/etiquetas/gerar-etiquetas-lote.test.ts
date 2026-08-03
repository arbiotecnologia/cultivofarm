import { describe, it, expect } from "vitest";
import { traduzirErroEtiqueta } from "@/components/estoque/GerarEtiquetasLoteDialog";

describe("traduzirErroEtiqueta", () => {
  it("traduz bloqueio de validade não validada", () => {
    expect(
      traduzirErroEtiqueta('label_expiry_not_validated: validade não validada para o lote L1'),
    ).toContain("Validade não validada");
  });

  it("traduz ausência de perfil de conformidade aprovado", () => {
    expect(traduzirErroEtiqueta("label_compliance_profile_missing: ...")).toContain(
      "perfil de conformidade aprovado",
    );
  });

  it("traduz perfil incompleto", () => {
    expect(traduzirErroEtiqueta("label_compliance_field_missing: registro_mapa")).toContain(
      "Perfil de conformidade incompleto",
    );
  });

  it("traduz bloqueio de CQ", () => {
    expect(traduzirErroEtiqueta("label_cq_not_approved: lote X")).toContain("CQ");
  });

  it("traduz template inexistente", () => {
    expect(traduzirErroEtiqueta("label_template_not_found: x")).toContain("Modelo de etiqueta");
  });

  it("mantém mensagem desconhecida", () => {
    expect(traduzirErroEtiqueta("erro qualquer")).toBe("erro qualquer");
  });

  it("não expõe fallback de validade estimada", () => {
    expect(traduzirErroEtiqueta("label_expiry_not_validated")).not.toContain("6 meses");
  });
});

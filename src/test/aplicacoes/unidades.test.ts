import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dependentesNovaOS, totalAplicacao, unidadeAplicacao, UNIDADE_EXECUCAO_CANONICA } from "@/lib/aplicacoes/unidades";
import { dataLocal, validarAplicacao } from "@/lib/aplicacoes/validacao";

describe("unidades e horários de aplicação", () => {
  it("execução explícita mL/ha produz mL sem inferir recomendação", () => {
    expect(UNIDADE_EXECUCAO_CANONICA).toBe("mL/ha");
    expect(totalAplicacao("2", "3", UNIDADE_EXECUCAO_CANONICA)).toEqual({ valor: 6, unidade: "mL" });
  });
  it.each(["mL", "L", "kg", "g", "unidade"])("preserva %s sem conversão", u => {
    expect(totalAplicacao("2", "3", `${u}/ha`)).toEqual({ valor: 6, unidade: u });
  });
  it("não presume unidade nem denominador", () => {
    expect(unidadeAplicacao(null)).toBeNull();
    expect(unidadeAplicacao("L")).toBeNull();
    expect(totalAplicacao("100", "10", undefined)).toBeNull();
  });
  it("limpa valores dependentes na troca de OS", () => {
    expect(dependentesNovaOS()).toEqual({ dose: "", area: "", lote: "", calda: "" });
    const source = readFileSync("src/components/aplicacao/AplicacaoFormDialog.tsx", "utf8");
    expect(source).toContain("onValueChange={trocarOS}");
    expect(source).toContain("setLoteId(limpos.lote)");
    expect(source).toContain('if (!unidade) return toast.error(erroUnidade)');
    expect(source).toContain('disabled={saving || !osId || !unidade}');
    expect(source).toContain('.eq("produto_id", (osSel as any).produtos.id)');
  });
  it("mantém hora civil local sem deslocar para UTC", () => {
    expect(dataLocal(new Date(2026, 8, 12, 23, 30))).toBe("2026-09-12T23:30");
  });
  const base = { osId: "os", doseAplicada: "2", areaAplicada: "3", dataAplicacao: "2026-09-12", horaInicio: "2026-09-12T10:00" };
  it.each(["09:00", "10:00"])("bloqueia término %s", h => {
    expect(validarAplicacao({ ...base, horaFim: `2026-09-12T${h}` })).toMatch(/posterior/);
  });
  it("bloqueia dia divergente, data impossível e fim isolado", () => {
    expect(validarAplicacao({ ...base, horaFim: "2026-09-13T11:00" })).toMatch(/mesmo dia/);
    expect(validarAplicacao({ ...base, dataAplicacao: "2026-02-30" })).toMatch(/data.*válida/);
    expect(validarAplicacao({ ...base, horaInicio: "", horaFim: "2026-09-12T11:00" })).toMatch(/início/);
    expect(validarAplicacao({ ...base, horaFim: "2026-09-12T11:00" })).toBeNull();
  });
});
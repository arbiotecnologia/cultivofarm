import { expect, it } from "vitest";
import { CATEGORIAS, SEVERIDADES, URGENCIAS, diagnosticoValidationError } from "./diagnosticoOptions";
it("categorias correspondem aos dez valores canônicos", () => {
  expect(CATEGORIAS.map((o) => o.value)).toEqual(["insetos_praga", "doencas_fungicas", "doencas_bacterianas", "nematoides", "plantas_daninhas", "desequilibrio_biologico_solo", "baixa_vitalidade", "falha_estande", "fitotoxidade", "outro"]);
});
it("severidade usa baixo/medio/alto/severo", () => { expect(SEVERIDADES.map((o) => o.value)).toEqual(["baixo", "medio", "alto", "severo"]); });
it("urgência usa baixa/media/alta/critica", () => { expect(URGENCIAS.map((o) => o.value)).toEqual(["baixa", "media", "alta", "critica"]); });
it("preserva legado inválido e exige correção humana", () => {
  const legacy = { categoria: "TESTE DE SISTEMA", severidade: "alta" };
  expect(diagnosticoValidationError(legacy)).not.toBeNull();
  expect(legacy).toEqual({ categoria: "TESTE DE SISTEMA", severidade: "alta" });
  expect(diagnosticoValidationError({ categoria: "outro", severidade: "severo", urgencia: "critica" })).toBeNull();
});
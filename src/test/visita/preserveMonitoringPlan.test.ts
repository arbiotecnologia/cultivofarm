import { expect, it } from "vitest";
import { preserveMonitoringPlan } from "@/lib/visita/preserveMonitoringPlan";
import { parseConduta, serializeConduta } from "@/lib/condutaSerializer";
import { CONDUTA_DEFAULT } from "@/components/visita/CondutaCard";
const block = "[PLANO DE MONITORAMENTO]\nItens: Nutrição, Estande\nPróxima Avaliação: 2026-11-05\n[FIM DO PLANO]";
it("preserva bloco byte-exato sem converter assuntos nem descartar texto posterior à conduta", () => {
  const original = serializeConduta("Descrição", CONDUTA_DEFAULT) + "\n\n" + block;
  expect(parseConduta(original).clean).toBe("Descrição\n\n" + block);
  expect(preserveMonitoringPlan(original, "Conduta atual")).toBe("Conduta atual\n\n" + block);
});
it("recusa substituição obsoleta ou bloco ambíguo", () => {
  expect(() => preserveMonitoringPlan(block, block.replace("2026-11-05", "2026-11-01"))).toThrow();
  expect(() => preserveMonitoringPlan(block + "\n" + block, "Conduta")).toThrow();
});
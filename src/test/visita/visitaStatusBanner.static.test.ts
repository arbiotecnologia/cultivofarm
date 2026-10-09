import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const banner = readFileSync("src/components/visita/VisitaStatusBanner.tsx", "utf8");
const page = readFileSync("src/pages/VisitaTecnica.tsx", "utf8");

describe("H9-G 2A · regressão estática", () => {
  it("banner não usa mais texto fixo de aprovação para toda visita finalizada", () => {
    expect(banner).not.toContain('descricao = "Pronta para envio à aprovação técnica.";');
    expect(banner).toContain("descricaoVisitaFinalizada(proximoPasso)");
  });

  it("acordeão de evidências conta arquivos + notas", () => {
    expect(page).not.toContain("Evidências ({(arquivos as any[]).length})");
    const ocorrencias = page.split("contarEvidencias(arquivos as any[], notes)").length - 1;
    expect(ocorrencias).toBe(2);
  });
});

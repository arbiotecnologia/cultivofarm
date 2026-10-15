import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  REC_MICRO_SELECT, REC_PRODUTO_SELECT, recCatalogErrorMessage, recMicroLabel, recProdutoLabel, recReferencedIds, recSelectOptions,
} from "@/lib/visita/recomendacaoCatalogo";

const src = readFileSync("src/pages/app/wizard/WizardRecomendacaoStep.tsx", "utf8");

describe("etapa Recomendação — colunas reais do catálogo", () => {
  it("usa nome/nome_cientifico e produtos.nome; nunca colunas inexistentes", () => {
    expect(REC_MICRO_SELECT).toBe("id, nome, nome_cientifico");
    expect(REC_PRODUTO_SELECT).toBe("id, nome");
    expect(src).not.toMatch(/nome_comum|nome_comercial/);
    expect(src).toMatch(/\.order\("nome"\)/);
  });
  it("renderiza rótulos com nomes reais", () => {
    expect(recMicroLabel({ id: "m", nome: "Bacillus subtilis BS1", nome_cientifico: "Bacillus subtilis" })).toBe("Bacillus subtilis BS1 (Bacillus subtilis)");
    expect(recMicroLabel({ id: "m", nome: "Trichoderma", nome_cientifico: null })).toBe("Trichoderma");
    expect(recProdutoLabel({ id: "p", nome: "Bombarbio" })).toBe("Bombarbio");
    expect(recMicroLabel(undefined)).toBe("—");
  });
  it("nova seleção só com ativos; valor histórico aparece desativado", () => {
    const hist = new Map([["old", { id: "old", nome: "Antigo" }]]);
    const opts = recSelectOptions([{ id: "a", nome: "Ativo" }], "old", hist);
    expect(opts).toEqual([{ item: { id: "a", nome: "Ativo" }, selectable: true }, { item: { id: "old", nome: "Antigo" }, selectable: false }]);
    expect(recSelectOptions([{ id: "a", nome: "Ativo" }], "a", hist)).toHaveLength(1);
    expect(src).toMatch(/\.eq\("ativo", true\)\.order\("nome"\)/);
  });
  it("histórico lê por ID referenciado, sem filtro de ativo", () => {
    expect(recReferencedIds([{ microrganismo_id: "b", produto_biologico_sugerido_id: null }, { microrganismo_id: "a" }, { microrganismo_id: "b" }]))
      .toEqual({ micro: ["a", "b"], prod: [] });
    expect(src).toMatch(/select\(REC_MICRO_SELECT\)\.in\("id", refIds\.micro\)/);
  });
  it("erro de schema/consulta vira mensagem explícita", () => {
    expect(recCatalogErrorMessage({ message: "column produtos.nome_comercial does not exist" })).toContain("does not exist");
    expect(src).toMatch(/role="alert"[^>]*>\{recCatalogErrorMessage\(microSel\.error\)\}/);
    expect(src.replace(/\/\/.*$/gm, "")).not.toMatch(/ocult/i); // UI não promete filtro por empresa neste seletor
  });
});

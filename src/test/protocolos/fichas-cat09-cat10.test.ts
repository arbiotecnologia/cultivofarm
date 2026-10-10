import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

import {
  buildMicroFormDefaults,
  buildProductFormDefaults,
  emptyMicroForm,
  emptyProductForm,
  mapMicroProfileToForm,
  mapProductProfileToForm,
} from "@/lib/catalogo/fichaFormDefaults";
import { fetchMicroProfileBundle } from "@/hooks/useMicroorganismProfile";
import { fetchProductProfileBundle } from "@/hooks/useProductProfile";

type Result = { data: any; error: any };

function makeClient(results: Record<string, Result>) {
  const from = (table: string) => {
    const value: Result = results[table] ?? { data: [], error: null };
    const builder: any = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.order = () => builder;
    builder.maybeSingle = () => Promise.resolve(value);
    builder.then = (res: any, rej: any) => Promise.resolve(value).then(res, rej);
    return builder;
  };
  return { from };
}

const MICRO_TABLES = [
  "microorganism_technical_profiles",
  "microorganism_targets",
  "microorganism_crop_recommendations",
];

const PRODUCT_TABLES = [
  "product_technical_profiles",
  "product_target_recommendations",
  "product_crop_recommendations",
  "formulacoes",
];

describe("CAT-09 · estado da ficha derivado apenas da entidade atual", () => {
  it("microrganismo sem ficha zera todos os campos não derivados", () => {
    const anterior = mapMicroProfileToForm({
      resumo_curto: "RESUMO ANTERIOR",
      mecanismo_acao: "MECANISMO ANTERIOR",
      explicacao_b2b: "B2B ANTERIOR",
      status_validacao: "aprovado",
    });
    expect(anterior.explicacao_b2b).toBe("B2B ANTERIOR");

    const novo = buildMicroFormDefaults({
      descricao: "Descrição do novo microrganismo",
      funcao_agronomica: "Fixação de nitrogênio",
      observacoes: null,
    });

    expect(novo.resumo_curto).toBe("Descrição do novo microrganismo");
    expect(novo.beneficios_agronomicos).toBe("Fixação de nitrogênio");
    expect(novo.explicacao_b2b).toBe("");
    expect(novo.mecanismo_acao).toBe("");
    expect(novo.observacoes_regulatorias).toBe("");
    expect(novo.status_validacao).toBe("rascunho");
    expect(JSON.stringify(novo)).not.toContain("ANTERIOR");
  });

  it("produto sem ficha zera todos os campos não derivados", () => {
    const anterior = mapProductProfileToForm({
      resumo_curto: "RESUMO ANTERIOR",
      beneficio_combinado: "BENEFICIO ANTERIOR",
      explicacao_b2b: "B2B ANTERIOR",
      status_validacao: "aprovado",
    });
    expect(anterior.beneficio_combinado).toBe("BENEFICIO ANTERIOR");

    const novo = buildProductFormDefaults({
      descricao: "Novo produto",
      modo_acao: "Modo de ação",
      funcao_completa: null,
    });

    expect(novo.resumo_curto).toBe("Novo produto");
    expect(novo.explicacao_tecnica).toBe("Modo de ação");
    expect(novo.indicacoes_uso).toBe("");
    expect(novo.beneficio_combinado).toBe("");
    expect(novo.explicacao_b2b).toBe("");
    expect(novo.status_validacao).toBe("rascunho");
    expect(JSON.stringify(novo)).not.toContain("ANTERIOR");
  });

  it("sem entidade o estado é totalmente vazio", () => {
    expect(Object.values(emptyMicroForm()).filter((v) => v !== "" && v !== "rascunho")).toHaveLength(0);
    expect(Object.values(emptyProductForm()).filter((v) => v !== "" && v !== "rascunho")).toHaveLength(0);
    expect(buildMicroFormDefaults(null)).toEqual(emptyMicroForm());
    expect(buildProductFormDefaults(null)).toEqual(emptyProductForm());
  });
});

describe("CAT-10 · erros de consulta são propagados", () => {
  it("carrega normalmente quando todas as consultas passam (microrganismo)", async () => {
    const out = await fetchMicroProfileBundle(
      makeClient({
        microorganism_technical_profiles: { data: { id: "p1", status_validacao: "rascunho" }, error: null },
      }),
      "m1",
    );
    expect(out.profile).toMatchObject({ id: "p1" });
    expect(out.targets).toEqual([]);
  });

  for (const table of MICRO_TABLES) {
    it(`propaga erro de ${table}`, async () => {
      const results: Record<string, Result> = {};
      results[table] = { data: null, error: { message: `falha em ${table}` } };
      await expect(fetchMicroProfileBundle(makeClient(results), "m1")).rejects.toThrow(`falha em ${table}`);
    });
  }

  it("carrega normalmente quando todas as consultas passam (produto)", async () => {
    const out = await fetchProductProfileBundle(
      makeClient({
        product_technical_profiles: { data: { id: "pp1", status_validacao: "rascunho" }, error: null },
      }),
      "pr1",
    );
    expect(out.profile).toMatchObject({ id: "pp1" });
    expect(out.composicao).toEqual([]);
  });

  for (const table of PRODUCT_TABLES) {
    it(`propaga erro de ${table}`, async () => {
      const results: Record<string, Result> = {};
      results[table] = { data: null, error: { message: `falha em ${table}` } };
      await expect(fetchProductProfileBundle(makeClient(results), "pr1")).rejects.toThrow(`falha em ${table}`);
    });
  }
});

describe("CAT-10 · erro bloqueia escrita e oferece retry", () => {
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
  const micro = read("src/components/protocolos/MicroorganismTechnicalProfileDialog.tsx");
  const produto = read("src/components/protocolos/ProductTechnicalProfileDialog.tsx");
  const errorState = read("src/components/protocolos/catalog/ProfileLoadErrorState.tsx");

  it("estado de erro tem mensagem clara e botão de retry", () => {
    expect(errorState).toContain("Não foi possível carregar a ficha técnica");
    expect(errorState).toContain("Tentar novamente");
    expect(errorState).toContain("onRetry");
  });

  for (const [nome, src] of [["microrganismo", micro], ["produto", produto]] as const) {
    it(`ficha de ${nome} bloqueia formulário e ações quando há erro`, () => {
      expect(src).toContain("{isError ? (");
      expect(src).toContain("<ProfileLoadErrorState");
      expect(src).toContain("onRetry={() => { void refetch(); }}");
      // nenhuma ação de escrita renderizada no rodapé quando há erro
      const rodape = src.slice(src.indexOf('border-t pt-3 mt-2"'));
      const acoes = rodape.match(/\{(!isError && )?can(EditFull|EditB2BOnly)[^\n]*&& \(/g) ?? [];
      expect(acoes.length).toBeGreaterThan(0);
      expect(acoes.every((a) => a.includes("!isError"))).toBe(true);
      // formulário/IA só renderizam no ramo sem erro
      expect(src.indexOf("{isError ? (")).toBeLessThan(src.indexOf("<ProfileFieldAI"));
      if (nome === "microrganismo") {
        expect(src).toContain("{!isError && canEditB2BOnly && !canEditFull && (");
      }

    });

    it(`ficha de ${nome} não usa o estado anterior como fallback`, () => {
      expect(src).not.toContain("setForm((f) => ({\n        ...f,");
      expect(src).toContain("CAT-09");
    });
  }
});

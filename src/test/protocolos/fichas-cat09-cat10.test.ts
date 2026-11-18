import { describe, it, expect, vi } from "vitest";

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

const validProductProfile = {
  id: "pp1", produto_id: "pr1", status_validacao: "rascunho", created_at: "2026-11-18T04:00:00Z", updated_at: "2026-11-18T04:00:00Z",
  resumo_curto: "Texto observado", beneficio_combinado: null, explicacao_tecnica: null, explicacao_produtor: null, explicacao_b2b: null,
  indicacoes_uso: null, janela_aplicacao: null, cuidados_aplicacao: null, compatibilidade: null, observacoes_regulatorias: null, validado_em: null,
};
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
        product_technical_profiles: { data: validProductProfile, error: null },
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

describe("CAT-09/CAT-10 · contrato de hidratação do produto", () => {
  it("ausência confirmada permite defaults somente da entidade atual", async () => {
    const out = await fetchProductProfileBundle(makeClient({ product_technical_profiles: { data: null, error: null } }), "pr1");
    expect(out.profile).toBeNull();
    expect(buildProductFormDefaults({ descricao: "Produto atual" }).resumo_curto).toBe("Produto atual");
    expect(buildProductFormDefaults({ descricao: "Produto atual" }).beneficio_combinado).toBe("");
  });
  it("perfil incompleto não vira ausência nem fallback", async () => {
    await expect(fetchProductProfileBundle(makeClient({ product_technical_profiles: { data: { id: "pp1", status_validacao: "rascunho" }, error: null } }), "pr1")).rejects.toThrow();
    await expect(fetchProductProfileBundle(makeClient({ product_technical_profiles: { data: undefined, error: null } }), "pr1")).rejects.toThrow();
  });
  it("hidrata texto e revisão observados sem incorporar campos da entidade anterior", async () => {
    const out = await fetchProductProfileBundle(makeClient({ product_technical_profiles: { data: validProductProfile, error: null } }), "pr1");
    expect(out.profile?.updated_at).toBe("2026-11-18T04:00:00Z");
    const form = mapProductProfileToForm(out.profile);
    expect(form.resumo_curto).toBe("Texto observado");
    expect(form.beneficio_combinado).toBe("");
  });
});

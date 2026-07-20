import { describe, it, expect } from "vitest";
import {
  sanitizeComposicao,
  buildFormulacoesPayload,
  type ComposicaoItem,
} from "@/lib/protocolos/composicaoSync";

const mk = (over: Partial<ComposicaoItem> = {}): ComposicaoItem => ({
  microrganismo_id: null,
  component_insumo_id: null,
  volume_ml: 100,
  proporcao: null,
  e_volume_fixo: false,
  ...over,
});

describe("sanitizeComposicao", () => {
  it("descarta rows vazios (sem microrganismo e sem insumo)", () => {
    const out = sanitizeComposicao([
      mk({ microrganismo_id: "m1" }),
      mk({ microrganismo_id: "" }),
      mk({ microrganismo_id: null, component_insumo_id: "" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].microrganismo_id).toBe("m1");
  });

  it("deduplica por microrganismo_id mantendo a última ocorrência", () => {
    const out = sanitizeComposicao([
      mk({ microrganismo_id: "m1", volume_ml: 100 }),
      mk({ microrganismo_id: "m2", volume_ml: 200 }),
      mk({ microrganismo_id: "m1", volume_ml: 999 }),
    ]);
    expect(out).toHaveLength(2);
    const m1 = out.find((c) => c.microrganismo_id === "m1");
    expect(m1?.volume_ml).toBe(999);
  });

  it("preserva múltiplos rows de insumo (não deduplica null)", () => {
    const out = sanitizeComposicao([
      mk({ component_insumo_id: "i1", proporcao: 10 }),
      mk({ component_insumo_id: "i2", proporcao: 20 }),
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("buildFormulacoesPayload", () => {
  it("formata payload com unidade mL e produto_id em todos os rows", () => {
    const payload = buildFormulacoesPayload("prod-1", [
      mk({ microrganismo_id: "m1", volume_ml: 150 }),
      mk({ component_insumo_id: "i1", proporcao: 10, volume_ml: 0 }),
    ]);
    expect(payload).toEqual([
      {
        produto_id: "prod-1",
        microrganismo_id: "m1",
        component_insumo_id: null,
        volume_ml: 150,
        proporcao: null,
        e_volume_fixo: false,
        unidade: "mL",
      },
      {
        produto_id: "prod-1",
        microrganismo_id: null,
        component_insumo_id: "i1",
        volume_ml: 0,
        proporcao: 10,
        e_volume_fixo: false,
        unidade: "mL",
      },
    ]);
  });

  it("retorna array vazio quando não há rows válidos", () => {
    expect(buildFormulacoesPayload("p1", [])).toEqual([]);
    expect(buildFormulacoesPayload("p1", [mk({ microrganismo_id: "" })])).toEqual([]);
  });
});

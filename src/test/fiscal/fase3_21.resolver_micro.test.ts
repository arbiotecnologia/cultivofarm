/**
 * Fase Fiscal 3.21 — Resolver PURO de item fiscal para microrganismo.
 *
 * O resolver JAMAIS consulta produto vinculado como fallback.
 */
import { describe, test, expect } from "vitest";
import {
  resolveFiscalItemFromMicroorganism,
  type MicroorganismFiscalProfileLike,
} from "../../../supabase/functions/_shared/fiscal/resolveMicroorganismItem";
import {
  SOURCE_ITEM_TYPE as SRC_EDGE,
} from "../../../supabase/functions/_shared/fiscal/sourceItemTypes";
import { SOURCE_ITEM_TYPE as SRC_CLIENT } from "@/lib/fiscal/sourceItemTypes";

function baseProfile(): MicroorganismFiscalProfileLike {
  return {
    id: "mprof-1",
    microorganism_id: "micro-1",
    is_active: true,
    fiscal_description: "Trichoderma harzianum inóculo",
    commercial_unit: "L",
    taxable_unit: "L",
    ncm: "30021029",
    cest: null,
    origin_code: "0",
    cfop_in_state: "5101",
    cfop_interstate: "6101",
    icms_cst: null,
    icms_csosn: "103",
    ipi_cst: null,
    pis_cst: "49",
    cofins_cst: "49",
    gtin: null,
    taxable_gtin: null,
    tax_benefit_code: null,
    profile_status: "VALIDATED",
  };
}

describe("resolveFiscalItemFromMicroorganism — puro", () => {
  test("sucesso quando perfil próprio existe, ativo e minimamente classificado", async () => {
    const res = await resolveFiscalItemFromMicroorganism("micro-1", async () => baseProfile());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.item.source_item_type).toBe("MICROORGANISM");
    expect(res.item.source_item_id).toBe("micro-1");
    expect(res.item.fiscal_snapshot.ncm).toBe("30021029");
    expect(res.item.fiscal_snapshot.profile_id).toBe("mprof-1");
  });

  test("falha quando perfil ausente — NÃO consulta produto como fallback", async () => {
    const res = await resolveFiscalItemFromMicroorganism("micro-x", async () => null);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.code).toBe("microorganism_profile_missing");
  });

  test("falha quando perfil inativo", async () => {
    const res = await resolveFiscalItemFromMicroorganism("micro-1", async () => ({
      ...baseProfile(), is_active: false,
    }));
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.code).toBe("microorganism_profile_inactive");
  });

  test("falha quando não minimamente classificado (sem NCM ou CFOP interno)", async () => {
    const r1 = await resolveFiscalItemFromMicroorganism("micro-1", async () => ({
      ...baseProfile(), ncm: null,
    }));
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.code).toBe("microorganism_not_minimally_classified");
    const r2 = await resolveFiscalItemFromMicroorganism("micro-1", async () => ({
      ...baseProfile(), cfop_in_state: null,
    }));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe("microorganism_not_minimally_classified");
  });

  test("loader é único ponto de I/O — resolver não recebe supabase nem faz fetch", async () => {
    let called = 0;
    const res = await resolveFiscalItemFromMicroorganism("micro-1", async (id) => {
      called += 1;
      expect(id).toBe("micro-1");
      return baseProfile();
    });
    expect(called).toBe(1);
    expect(res.ok).toBe(true);
  });

  test("paridade das constantes SOURCE_ITEM_TYPE entre client e edge", () => {
    expect(SRC_CLIENT).toEqual(SRC_EDGE);
    expect(SRC_CLIENT.MICROORGANISM).toBe("MICROORGANISM");
  });
});

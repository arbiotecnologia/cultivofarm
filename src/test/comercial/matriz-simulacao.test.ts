import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  matrixPresentations,
  validateMatrixSimulation,
  presentationKey,
  type MatrixPresentationRow,
} from "@/lib/comercial/validation";

const base: MatrixPresentationRow = {
  plan_id: "plan-1",
  buyer_scope: "partner",
  partner_id: "p-1",
  customer_id: null,
  product_id: "bio-fungicida",
  microrganismo_id: null,
  unit_type: "litro",
  volume_ml: null,
  min_quantity: 5,
  status: "published",
  valid_from: "2026-01-01",
  valid_until: null,
};

const opts = { planId: "plan-1", partnerId: "p-1", itemId: "bio-fungicida", today: "2026-09-12" };

describe("Simulação da matriz — apresentação real da regra", () => {
  it("devolve a unidade litro da regra publicada, sem assumir hectare", () => {
    const r = matrixPresentations([base], opts);
    expect(r).toHaveLength(1);
    expect(r[0].unit_type).toBe("litro");
    expect(r[0].min_quantity).toBe(5);
  });

  it("lista múltiplas apresentações elegíveis para escolha explícita", () => {
    const r = matrixPresentations(
      [base, { ...base, unit_type: "unidade", volume_ml: 1000, min_quantity: 1 }],
      opts,
    );
    expect(r.map((x) => x.key).sort()).toEqual([presentationKey("litro", null), presentationKey("unidade", 1000)].sort());
  });

  it("ignora rascunho, fora de vigência e outro parceiro", () => {
    expect(matrixPresentations([{ ...base, status: "draft" }], opts)).toHaveLength(0);
    expect(matrixPresentations([{ ...base, valid_until: "2026-08-01" }], opts)).toHaveLength(0);
    expect(matrixPresentations([{ ...base, partner_id: "p-2" }], opts)).toHaveLength(0);
  });

  it("inclui escopo default quando elegível", () => {
    const def = { ...base, buyer_scope: "default", partner_id: null };
    expect(matrixPresentations([def], opts)).toHaveLength(1);
    expect(matrixPresentations([def], { ...opts, partnerId: "" })).toHaveLength(1);
    expect(matrixPresentations([base], { ...opts, partnerId: "" })).toHaveLength(0);
  });

  it("exige quantidade válida e respeita a quantidade mínima", () => {
    const [p] = matrixPresentations([base], opts);
    expect(validateMatrixSimulation({ presentation: p, quantity: "" }).quantity).toBeTruthy();
    expect(validateMatrixSimulation({ presentation: p, quantity: "0" }).quantity).toBeTruthy();
    expect(validateMatrixSimulation({ presentation: p, quantity: "abc" }).quantity).toBeTruthy();
    expect(validateMatrixSimulation({ presentation: p, quantity: "4" }).quantity).toMatch(/mínima/i);
    expect(validateMatrixSimulation({ presentation: p, quantity: "5" })).toEqual({});
    expect(validateMatrixSimulation({ presentation: null, quantity: "5" }).presentation).toBeTruthy();
  });

  it("apresentação por unidade exige volume definido na regra", () => {
    const p = { key: "unidade|", unit_type: "unidade" as const, volume_ml: null, min_quantity: 0 };
    expect(validateMatrixSimulation({ presentation: p, quantity: "2" }).presentation).toBeTruthy();
  });

  it("o diálogo não força mais hectare e envia quantidade", () => {
    const src = readFileSync("src/components/comercial/MatrizConfiguravelTab.tsx", "utf8");
    expect(src).not.toContain('unit_type: "hectare",\n                    volume_ml: null,');
    expect(src).toContain("unit_type: presentation.unit_type");
    expect(src).toContain("quantity: Number(simQuantity)");
    const hook = readFileSync("src/hooks/useCommercialConditions.ts", "utf8");
    expect(hook).toContain("p_quantity: v.quantity");
  });
});

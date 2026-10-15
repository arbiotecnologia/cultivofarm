import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("scripts/rbac-audit/proposed-lab-biological-only-07.sql", "utf8");

describe("laboratório exclusivamente biológico — candidato 07", () => {
  it("usa familia_catalogo e não o enum legado tipo", () => {
    expect(sql).toMatch(/p\.familia_catalogo='biologico'/);
    expect(sql).not.toMatch(/p\.tipo\s*=\s*'fungicida'/);
  });
  it("aceita roots isolados e bloqueia qualquer vínculo ambíguo produto+microrganismo", () => {
    expect(sql).toMatch(/WHEN p_product_id IS NOT NULL AND p_microorganism_id IS NOT NULL THEN false/);
    expect(sql.indexOf("p_product_id IS NOT NULL AND p_microorganism_id IS NOT NULL")).toBeLessThan(
      sql.indexOf("WHEN p_product_id IS NOT NULL THEN EXISTS"),
    );
    expect(sql).toMatch(/LAB_ITEM_NOT_MANUFACTURABLE/);
    expect(sql).toMatch(/ERRCODE='23514'/);
  });
  it("fixa o preflight no corpo live que preserva a contenção B2B", () => {
    expect(sql).toContain("ad584fa71bd7cc2bb00f4887e5b3706b");
    expect(sql).toContain("B2B_INTERNAL_DOWNSTREAM_UNVERIFIED");
    expect(sql).not.toContain("68ca411c80fb9a191fdd55f65e171fc8");
  });
  it("protege programação e lote sem bloquear update histórico irrelevante", () => {
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF produto_id,microrganismo_id ON public\.programacao_producao/);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF produto_id,microrganismo_id ON public\.lotes/);
    expect(sql.match(/NEW\.produto_id IS NOT DISTINCT FROM OLD\.produto_id/g)?.length).toBe(2);
  });
  it("permanece candidato sem grants, publicação ou módulo paralelo", () => {
    expect(sql).not.toMatch(/\bGRANT\b/);
    expect(sql).not.toMatch(/compras/i);
    expect(sql).toMatch(/NO-GO/);
  });
});
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const summary = JSON.parse(readFileSync("docs/auditorias/matriz-auditoria-fluxo-b2b-20261028-resumo.json", "utf8"));
const csv = readFileSync("docs/auditorias/matriz-auditoria-fluxo-b2b-20261028.csv", "utf8");
describe("Auditoria planejada — não promove mocks a JWT real", () => {
  it("cobre os18 passos e17 perfis/condições nas3 empresas", () => {
    expect(summary.steps).toBe(18); expect(summary.profiles).toHaveLength(17);
    expect(summary.profiles).toEqual(expect.arrayContaining(["superadmin", "parceiro_b2b_tecnico_sem_compra", "multi_vinculo", "anon", "inativo", "transferido", "revogado"]));
    expect(csv).toContain("A_proprio"); expect(csv).toContain("B_alheio"); expect(csv).toContain("C_sem_vinculo");
  });
  it("os9.180 cenários reais ainda são bloqueados/não executados, zero PASS real", () => {
    expect(summary.real_PASS).toBe(0);
    expect(summary.statuses.BLOCKED + summary.statuses["NOT RUN"]).toBe(9180);
    expect(summary.statuses.FAIL).toBe(4); expect(summary.statuses.PASS).toBe(6);
    expect(summary.rows).toBe(9190);
  });
});
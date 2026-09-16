import { describe, it, expect } from "vitest";

/**
 * FASE 8 — Validação do Motor de Condições Comerciais B2B Cultivo Farm
 *
 * Fórmula oficial (mesma usada em simulate_b2b_payment_plan_secure e
 * create_partner_order_secure):
 *   liquido = tabela * (1 - desconto/100)
 *   final   = liquido * POWER(1 + taxa_mensal/100, meses)
 *   juros   = final - liquido
 */
function calc(tabela: number, desconto: number, taxa: number, meses: number) {
  const liquido = tabela * (1 - desconto / 100);
  const final = liquido * Math.pow(1 + taxa / 100, meses);
  const juros = final - liquido;
  return { liquido, final, juros };
}

const near = (a: number, b: number, tol = 0.5) => Math.abs(a - b) <= tol;

describe("Fase 8 · Motor de Condições Comerciais B2B", () => {
  it("Cenário 1 — À vista 40%", () => {
    const r = calc(100000, 40, 0, 0);
    expect(r.liquido).toBe(60000);
    expect(r.juros).toBe(0);
    expect(r.final).toBe(60000);
  });

  it("Cenário 2 — 60 dias, 30% desc, 1,5% a.m. (2 meses)", () => {
    const r = calc(100000, 30, 1.5, 2);
    expect(r.liquido).toBe(70000);
    expect(near(r.final, 72115.75)).toBe(true);
    expect(near(r.juros, 2115.75)).toBe(true);
  });

  it("Cenário 3 — 90 dias, 25% desc, 2% a.m. (3 meses)", () => {
    const r = calc(100000, 25, 2, 3);
    expect(r.liquido).toBe(75000);
    expect(near(r.final, 79590.6)).toBe(true);
  });

  it("Cenário 4 — Safra 8 meses, 20% desc, 2% a.m.", () => {
    const r = calc(100000, 20, 2, 8);
    expect(r.liquido).toBe(80000);
    expect(near(r.final, 93732.75)).toBe(true);
  });
});

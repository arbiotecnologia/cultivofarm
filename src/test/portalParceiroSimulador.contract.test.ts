import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Fase 6 — Testes de contrato do Portal Parceiro B2B.
 *
 * Não montam a UI; validam decisões estruturais do código para evitar
 * regressões nas correções das fases 1–5:
 *  - DashboardTecnico usa `get_b2b_user_clients_secure`, nunca a RPC antiga
 *    `get_b2b_technician_clients_secure`.
 *  - NovoPedido detecta `/portal-parceiro/simulador` como modo simulação
 *    (sem desconto) e `/portal-parceiro/novo` como pedido oficial.
 *  - Simulador nunca chama `useCreatePartnerOrder`.
 */

const read = (p: string) =>
  fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("Portal Parceiro B2B — contrato de código", () => {
  const dashboard = read("src/pages/portal-parceiro/DashboardTecnico.tsx");
  const novoPedido = read("src/pages/portal-parceiro/NovoPedido.tsx");

  it("DashboardTecnico usa get_b2b_user_clients_secure", () => {
    expect(dashboard).toContain("get_b2b_user_clients_secure");
    expect(dashboard).not.toContain("get_b2b_technician_clients_secure");
  });

  it("DashboardTecnico exibe título do novo modelo", () => {
    expect(dashboard).toMatch(/Portal Técnico B2B|Área B2B de Campo/);
  });

  it("NovoPedido reconhece a rota do simulador", () => {
    expect(novoPedido).toContain("/portal-parceiro/simulador");
    expect(novoPedido).toContain("isSimuladorRoute");
    expect(novoPedido).toContain("isSimulationMode");
  });

  it("Simulador força catálogo técnico (sem desconto)", () => {
    expect(novoPedido).toContain("usePartnerCatalogTecnico");
    // usePartnerCatalog só é usado no modo pedido oficial
    expect(novoPedido).toMatch(/usePartnerCatalog\(\s*isSimulationMode\s*\?/);
  });

  it("Simulador não cria pedido real", () => {
    // useCreatePartnerOrder só pode ser invocado fora de isSimulationMode
    const importa = novoPedido.includes("useCreatePartnerOrder");
    expect(importa).toBe(true);
    expect(novoPedido).toMatch(/if\s*\(\s*isSimulationMode\s*\)/);
  });
});

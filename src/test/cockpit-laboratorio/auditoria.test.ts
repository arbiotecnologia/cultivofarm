import { describe, expect, it } from "vitest";
import { criarTrava, deduplicarEsteira, filtrarCockpit, formatVolume, podeOperar, somaVolumes, statusConhecido, timestampBrasilia, volumeLitros } from "@/lib/cockpit/auditoria";

describe("volumes", () => {
  it("preserva zero e rejeita valores inválidos", () => {
    expect(volumeLitros(0)).toBe(0);
    expect(volumeLitros(null)).toBeNull();
    expect(volumeLitros("abc")).toBeNull();
    expect(volumeLitros(-2)).toBeNull();
  });
  it("mostra travessão quando não há medida", () => {
    expect(formatVolume(null)).toBe("—");
    expect(formatVolume(12.34)).toContain("L");
  });
  it("não soma conjunto com dado ausente", () => {
    expect(somaVolumes([1, 2])).toBe(3);
    expect(somaVolumes([1, null])).toBeNull();
  });
});

describe("status e guardas", () => {
  it("reconhece somente status do contrato", () => {
    expect(statusConhecido("em_producao")).toBe(true);
    expect(statusConhecido("inventado")).toBe(false);
  });
  it("bloqueia ação em terminal, sem OS ou status desconhecido", () => {
    expect(podeOperar({ id: "p", os_id: "o", status_esteira_oficial: "em_producao" })).toBe(true);
    expect(podeOperar({ id: "p", os_id: "o", status_esteira_oficial: "finalizada" })).toBe(false);
    expect(podeOperar({ id: "p", status_esteira_oficial: "em_producao" })).toBe(false);
    expect(podeOperar({ id: "p", os_id: "o", status_esteira_oficial: "xyz" })).toBe(false);
  });
});

describe("duplicidade", () => {
  it("remove repetição idêntica e recusa divergência", () => {
    const row = { os_id: "1", origem_os: "manual" };
    expect(deduplicarEsteira([row, { ...row }])).toHaveLength(1);
    expect(() => deduplicarEsteira([row, { ...row, extra: 1 } as any])).toThrow();
    expect(() => deduplicarEsteira([{ origem_os: "manual" } as any])).toThrow();
  });
});

describe("filtros", () => {
  const base = { status_esteira_oficial: "em_producao", cliente_id: "c1", fazenda_id: "f1", produto_id: "p1" };
  it("combina cliente, fazenda, produto e status", () => {
    expect(filtrarCockpit([base], { cliente: "c1", fazenda: "f1", produto: "p1", status: "all" })).toHaveLength(1);
    expect(filtrarCockpit([base], { cliente: "c2", fazenda: "all", produto: "all", status: "all" })).toHaveLength(0);
    expect(filtrarCockpit([base], { cliente: "all", fazenda: "all", produto: "all", status: "entregue" })).toHaveLength(0);
  });
});

describe("data e concorrência", () => {
  it("formata em Brasília e trata data ausente", () => {
    expect(timestampBrasilia(null)).toBe("—");
    expect(timestampBrasilia("2026-01-10T12:00:00Z")).toContain("10/01/2026");
  });
  it("impede execução simultânea", async () => {
    const trava = criarTrava();
    let ativos = 0;
    const acao = async () => { ativos++; expect(ativos).toBe(1); await new Promise(r => setTimeout(r, 5)); ativos--; return true; };
    const [a, b] = await Promise.all([trava(acao), trava(acao)]);
    expect(a).toBe(true);
    expect(b).toBe(false);
  });
});

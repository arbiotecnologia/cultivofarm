/**
 * Bloco 3 — Rótulos pt-BR dos perfis fiscais.
 * Testes focais complementares: independência da página (opções não
 * dependem de dados carregados) e gestor sem edição (helpers só
 * resolvem exibição, nunca alteram o valor persistido).
 *
 * Sem banco, sem RLS, sem produção.
 */
import { describe, it, expect } from "vitest";
import {
  PRODUCT_FISCAL_PROFILE_STATUS_OPTIONS,
  SERVICE_FISCAL_PROFILE_STATUS_OPTIONS,
  CUSTOMER_FISCAL_PROFILE_STATUS_OPTIONS,
  TAXPAYER_INDICATOR_OPTIONS,
  getFiscalStatusLabel,
  getTaxpayerIndicatorLabel,
} from "@/lib/fiscal/fiscalOptions";

describe("Bloco 3 — independência da página", () => {
  it("listas são constantes de módulo, não derivadas de props/consulta", () => {
    // Snapshot dos values antes/depois de tentativa de mutação: as listas
    // devem permanecer estáveis entre invocações, independentemente de
    // qualquer estado da página que as consuma.
    const snapshot = (opts: { value: string }[]) => opts.map((o) => o.value).join(",");
    const before = [
      snapshot(PRODUCT_FISCAL_PROFILE_STATUS_OPTIONS),
      snapshot(SERVICE_FISCAL_PROFILE_STATUS_OPTIONS),
      snapshot(CUSTOMER_FISCAL_PROFILE_STATUS_OPTIONS),
      snapshot(TAXPAYER_INDICATOR_OPTIONS),
    ];
    // Nenhuma chamada de helper altera o conteúdo das listas.
    getFiscalStatusLabel("product", "DRAFT");
    getFiscalStatusLabel("service", "VALIDATED");
    getFiscalStatusLabel("customer", "BLOCKED");
    getTaxpayerIndicatorLabel("1");
    const after = [
      snapshot(PRODUCT_FISCAL_PROFILE_STATUS_OPTIONS),
      snapshot(SERVICE_FISCAL_PROFILE_STATUS_OPTIONS),
      snapshot(CUSTOMER_FISCAL_PROFILE_STATUS_OPTIONS),
      snapshot(TAXPAYER_INDICATOR_OPTIONS),
    ];
    expect(after).toEqual(before);
  });

  it("todas as opções têm value + label não-vazios", () => {
    const all = [
      ...PRODUCT_FISCAL_PROFILE_STATUS_OPTIONS,
      ...SERVICE_FISCAL_PROFILE_STATUS_OPTIONS,
      ...CUSTOMER_FISCAL_PROFILE_STATUS_OPTIONS,
      ...TAXPAYER_INDICATOR_OPTIONS,
    ];
    for (const o of all) {
      expect(o.value.trim().length).toBeGreaterThan(0);
      expect(o.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("Bloco 3 — gestor sem edição (helpers só resolvem exibição)", () => {
  it("getFiscalStatusLabel não devolve o valor técnico; devolve rótulo pt-BR ou fallback", () => {
    const casos: Array<["product" | "service" | "customer", string]> = [
      ["product", "DRAFT"],
      ["product", "PENDING_ACCOUNTING"],
      ["service", "VALIDATED"],
      ["customer", "INCOMPLETE"],
    ];
    for (const [kind, v] of casos) {
      const label = getFiscalStatusLabel(kind, v);
      // A UI deve mostrar rótulo pt-BR — nunca o código técnico como texto.
      expect(label).not.toBe(v);
      expect(label).not.toMatch(/^[A-Z_]+$/);
    }
  });

  it("fallback estável para códigos legados / desconhecidos (sem coerção)", () => {
    expect(getFiscalStatusLabel("product", "LEGADO_X")).toBe("Status não reconhecido");
    expect(getFiscalStatusLabel("service", "OUTRO")).toBe("Status não reconhecido");
    expect(getFiscalStatusLabel("customer", "?????")).toBe("Status não reconhecido");
    // O helper não altera nem "recupera" o valor: é somente leitura.
    expect(getTaxpayerIndicatorLabel("42")).toBe("Indicador não reconhecido");
  });
});

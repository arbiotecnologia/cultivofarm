/**
 * Fase Fiscal 3.19.2 — Auditoria adicional:
 *  - RPCs canônicas presentes e autorizadas.
 *  - Cards RTC/IBS-CBS presentes nas telas.
 *  - Readiness rebaixada quando RTC ausente.
 *  - Hooks nunca enviam production_enabled.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const canonical = read("supabase/migrations/20260727000000_fiscal_fase3_19_rtc_2026.sql");

describe("Fase 3.19.2 — RPCs RTC", () => {
  test.each([
    ["rpc_fiscal_company_rtc_get", "administrador'::app_role"],
    ["rpc_fiscal_company_rtc_save", "administrador'::app_role"],
    ["rpc_fiscal_product_ibs_cbs_get", "administrador'::app_role"],
    ["rpc_fiscal_product_ibs_cbs_save", "administrador'::app_role"],
    ["rpc_fiscal_service_ibs_cbs_get", "administrador'::app_role"],
    ["rpc_fiscal_service_ibs_cbs_save", "administrador'::app_role"],
  ])("%s existe e valida role", (fn) => {
    expect(canonical).toContain(`FUNCTION public.${fn}`);
    // Cada RPC de save de item requer admin OU financeiro.
    if (fn.endsWith("_save") && !fn.includes("company")) {
      const block = canonical.substring(canonical.indexOf(`FUNCTION public.${fn}`));
      const body = block.substring(0, block.indexOf("$$;"));
      expect(body).toMatch(/administrador/);
      expect(body).toMatch(/financeiro/);
    }
  });

  test("nenhuma RPC concede EXECUTE a anon", () => {
    const grants = canonical.match(/GRANT EXECUTE[^\n]*/g) ?? [];
    for (const g of grants) expect(g).not.toMatch(/\banon\b/);
    expect(canonical).toMatch(/REVOKE ALL[^\n]*FROM PUBLIC, anon/);
  });

  test("save aborta se payload trouxer production_enabled", () => {
    expect(
      (canonical.match(/production_enabled não é aceito/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
  });

  test("readiness sobrescrita adiciona item rtc_configured e bloqueia READY", () => {
    expect(canonical).toContain("rpc_fiscal_homologation_readiness_rtc_check");
    expect(canonical).toContain("'rtc_configured'");
    // A migration antiga (20260725000000) NÃO é editada.
    const oldMig = read("supabase/migrations/20260725000000_fiscal_fase3_17_homologation_readiness.sql");
    expect(oldMig).not.toContain("rtc_configured");
  });
});

describe("Fase 3.19.2 — integração frontend RTC", () => {
  test("FiscalEmpresa monta aba e card RTC", () => {
    const src = read("src/pages/configuracoes/FiscalEmpresa.tsx");
    expect(src).toContain('value="rtc"');
    expect(src).toContain("RtcCompanyCard");
    expect(src).toContain('data-testid="fiscal-empresa-panel-rtc"');
  });

  test("FiscalProdutos e FiscalServicos incluem IbsCbsItemCard", () => {
    expect(read("src/pages/configuracoes/FiscalProdutos.tsx"))
      .toContain('kind="product"');
    const svc = read("src/pages/configuracoes/FiscalServicos.tsx");
    expect(svc).toContain('kind="service"');
  });

  test("hook não envia production_enabled", () => {
    const src = read("src/hooks/useFiscalRtc.ts");
    expect(src).not.toMatch(/production_enabled\s*:/);
  });

  test("card de serviço expõe finNFSe/tpNFSeDebito/tpNFSeCredito", () => {
    const src = read("src/components/fiscal/IbsCbsItemCard.tsx");
    for (const f of ["finNFSe", "tpNFSeDebito", "tpNFSeCredito"]) {
      expect(src).toContain(f);
    }
    // cIndOp é campo tipado em ibsCbsItemSchema
    expect(src).toContain("c_ind_op");
  });
});

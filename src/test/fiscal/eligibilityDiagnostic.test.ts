import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const { rpc, from, functions } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), functions: { invoke: vi.fn() } }));
rpc.mockImplementation(() => Promise.resolve({ data: null, error: null }));
vi.mock("@/integrations/supabase/client", () => ({ SUPABASE_URL: "https://swzpzcwiasxmjutrmvkm.supabase.co", supabase: { rpc, from, functions, bind: undefined } }));
import { runEligibilityDiagnostic, databaseHost, isPreviewHost, isDiagnosticOpen, summarize } from "@/lib/fiscal/eligibilityDiagnostic";

const ID = "11111111-2222-4333-8444-555555555555";
beforeEach(() => { rpc.mockReset(); from.mockReset(); functions.invoke.mockReset(); });

describe("diagnóstico de elegibilidade", () => {
  it("chama somente as duas sobrecargas do leitor, nada mais", async () => {
    rpc.mockResolvedValue({ data: { eligible: false, reasons: [{ code: "X" }] }, error: null });
    await runEligibilityDiagnostic("ENTREGA", ` ${ID} `);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(["fn_fiscal_invoice_eligibility", { _source_type: "ENTREGA", _source_id: ID }]);
    expect(rpc.mock.calls[1]).toEqual(["fn_fiscal_invoice_eligibility", { _source_type: "ENTREGA", _source_id: ID, _current_invoice_id: null }]);
    expect(from).not.toHaveBeenCalled();
    expect(functions.invoke).not.toHaveBeenCalled();
  });
  it("entrada inválida não chama nada", async () => {
    await expect(runEligibilityDiagnostic("ENTREGA", "abc")).rejects.toThrow("ENTRADA_INVALIDA");
    await expect(runEligibilityDiagnostic("OUTRO" as never, ID)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("hostname: só prévia (localhost apenas em dev) e expira", () => {
    expect(isPreviewHost("id-preview--a79bb3db-f665-466d-bf41-ee8c6cb91fab.lovable.app", false)).toBe(true);
    expect(isPreviewHost("cultivofarm.lovable.app", false)).toBe(false);
    expect(isPreviewHost("app.cultivofarm.com.br", false)).toBe(false);
    expect(isPreviewHost("localhost", false)).toBe(false);
    expect(isDiagnosticOpen("id-preview--x.lovable.app", new Date("2026-11-19T00:00:00Z"), false)).toBe(false);
  });
  it("resumo: códigos, booleanos e coincidência do pedido", () => {
    const s = summarize("2-args", "PARTNER_ORDER", ID, { eligible: true, reasons: [], orderId: ID.toUpperCase(), debtorPartnerId: "p" }, null);
    expect(s).toMatchObject({ eligible: true, hasOrderId: true, hasDebtorPartnerId: true, orderMatchesInput: true });
    const h = summarize("2-args", "ENTREGA", ID, { eligible: false, reasons: [{ code: "FISCAL_SOURCE_NOT_FOUND" }] }, null);
    expect(h).toMatchObject({ codes: ["FISCAL_SOURCE_NOT_FOUND"], hasOrderId: false, orderMatchesInput: null });
  });
});

describe("databaseHost usa o cliente canônico", () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it("ignora VITE_SUPABASE_URL divergente", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://yzszlzjpovmcteuxjznj.supabase.co");
    expect(databaseHost()).toBe("swzpzcwiasxmjutrmvkm.supabase.co");
  });
  it("funciona com VITE_SUPABASE_URL ausente", () => {
    vi.stubEnv("VITE_SUPABASE_URL", undefined as unknown as string);
    expect(databaseHost()).toBe("swzpzcwiasxmjutrmvkm.supabase.co");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const hook = readFileSync("src/hooks/useFiscalTaxPreview.ts", "utf8");
const wizard = readFileSync("src/components/fiscal/documentos/RascunhoWizard.tsx", "utf8");
const service = readFileSync("src/components/fiscal/documentos/TributosServicoSecao.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261035000000_h12_fiscal_totals_certificate_authorization_services.sql",
  "utf8",
);

describe("H12 NFS-e service calculation integration", () => {
  it("calls the dedicated service RPC and never the merchandise preview", () => {
    expect(hook).toContain('"rpc_fiscal_calculate_service_invoice_v1"');
    expect(wizard).toContain('values.invoice_type === "NFE" ? <TributosPorItemSecao');
    expect(wizard).toContain("<TributosServicoSecao");
  });

  it("keeps DPS, XML and national transmission blocked", () => {
    expect(service).toContain("IBS/CBS e transmissão nacional bloqueados");
    expect(wizard).toContain("Emissão nacional ainda bloqueada");
    expect(migration).toContain("'nationalTransmissionSupported', false");
  });

  it("persists only through the explicit calculation command", () => {
    expect(hook).toContain("p_persist: persist");
    expect(service).toContain("Calcular e salvar apuração");
    expect(migration).toContain("IF p_persist THEN");
  });

  it("keeps IBS/CBS fail-closed without validated layout support", () => {
    expect(migration).toContain("FISCAL_RTC_LAYOUT_UNVALIDATED");
    expect(migration).toContain("xsd_validated IS TRUE");
    expect(migration).toContain("supported IS TRUE");
  });
});
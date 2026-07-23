import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  SERVICE_FISCAL_PROFILE_STATUSES,
  SERVICE_FISCAL_PROFILE_STATUS_OPTIONS,
  isServiceFiscalProfileStatus,
  getFiscalStatusLabel,
} from "@/lib/fiscal/fiscalOptions";

describe("Correção cirúrgica final — service status NOT_FISCALLY_BILLED", () => {
  it("inclui NOT_FISCALLY_BILLED na lista canônica", () => {
    expect(SERVICE_FISCAL_PROFILE_STATUSES).toContain("NOT_FISCALLY_BILLED");
    expect(SERVICE_FISCAL_PROFILE_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      "DRAFT",
      "PENDING_ACCOUNTING",
      "VALIDATED",
      "BLOCKED",
      "NOT_FISCALLY_BILLED",
    ]);
  });

  it("rótulo pt-BR e guard", () => {
    expect(getFiscalStatusLabel("service", "NOT_FISCALLY_BILLED")).toBe(
      "Não faturado fiscalmente",
    );
    expect(isServiceFiscalProfileStatus("NOT_FISCALLY_BILLED")).toBe(true);
    expect(isServiceFiscalProfileStatus("NOT_FISCALLY_SOLD")).toBe(false);
  });

  it("alinhado ao CHECK real da migration 20260721000000", () => {
    const sql = readFileSync(
      "supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql",
      "utf8",
    );
    expect(sql).toMatch(
      /service_fiscal_profiles[\s\S]*?CHECK \(profile_status IN \('DRAFT','PENDING_ACCOUNTING','VALIDATED','BLOCKED','NOT_FISCALLY_BILLED'\)\)/,
    );
  });
});

describe("Correção cirúrgica final — updated_by no save do perfil de serviço", () => {
  const sql = readFileSync(
    "supabase/migrations/20260727000000_fiscal_fase3_19_rtc_2026.sql",
    "utf8",
  );

  it("rpc_fiscal_service_profile_ibs_cbs_save grava updated_by = v_uid", () => {
    const m = sql.match(
      /CREATE OR REPLACE FUNCTION public\.rpc_fiscal_service_profile_ibs_cbs_save[\s\S]*?\$F\$;/,
    );
    expect(m).toBeTruthy();
    const body = m![0];
    expect(body).toMatch(
      /SET ibs_cbs_configuration = payload, updated_at = now\(\), updated_by = v_uid/,
    );
  });

  it("não altera contratos antigos (product/service por p_service_id)", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.rpc_fiscal_product_ibs_cbs_save\(\s*p_product_id/,
    );
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.rpc_fiscal_service_ibs_cbs_save\(\s*p_service_id/,
    );
  });
});

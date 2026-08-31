/**
 * FASE H7k — Testes estáticos do preflight fiscal por campo.
 *
 * Garantem que o script canônico permanece fail-closed e que o consumo no
 * frontend não introduz autorização client-side.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { groupBySection, type PreflightFinding } from "@/hooks/useFiscalPreflight";

const APPLY = readFileSync("restoration/homologacao-h7/93-h7k-preflight-apply.sql", "utf8");
const HOOK = readFileSync("src/hooks/useFiscalPreflight.ts", "utf8");
const UI = readFileSync("src/components/fiscal/documentos/PreflightNfeSecao.tsx", "utf8");

describe("H7k — script canônico", () => {
  it("mantém o gate de ambiente e a versão do preflight", () => {
    expect(APPLY).toContain("fn_fiscal_environment_gate_v1");
    expect(APPLY).toContain("'h7k-v1'");
  });

  it("reutiliza as funções canônicas de pendências", () => {
    expect(APPLY).toContain("fn_fiscal_emitter_pendencies_row");
    expect(APPLY).toContain("fn_fiscal_recipient_pendencies_row");
  });

  it("é SECURITY DEFINER com search_path fixo e sem EXECUTE para anon", () => {
    expect(APPLY).toContain("SECURITY DEFINER");
    expect(APPLY).toContain("SET search_path = public, pg_temp");
    expect(APPLY).toMatch(/REVOKE ALL ON FUNCTION public\.rpc_fiscal_preflight_v1\(uuid\) FROM anon/);
  });

  it("valida as constraints de sanidade dos itens", () => {
    for (const c of [
      "h7k_fii_quantity_positive",
      "h7k_fii_values_non_negative",
      "h7k_fii_commercial_unit_present",
    ]) {
      expect(APPLY).toContain(`VALIDATE CONSTRAINT ${c}`);
    }
  });

  it("revoga o helper de marcador de ambiente dos papéis públicos", () => {
    expect(APPLY).toContain("fn_fiscal_assert_staging_marker");
    expect(APPLY).toContain("FROM authenticated");
  });
});

describe("H7k — consumo no frontend", () => {
  it("usa a RPC canônica e não decide autorização localmente", () => {
    expect(HOOK).toContain("rpc_fiscal_preflight_v1");
    expect(UI).not.toMatch(/canTransmit\s*=\s*true/);
  });

  it("não oferece ação de emissão nem menciona produção liberada", () => {
    expect(UI).not.toMatch(/transmitir agora|emitir nf-?e/i);
    expect(UI).toMatch(/produção continua bloqueada/i);
  });

  it("agrupa achados na ordem canônica de seções", () => {
    const findings: PreflightFinding[] = [
      { code: "A", section: "ITENS", field: "quantity", message: "x" },
      { code: "B", section: "EMITENTE", field: "cnpj", message: "y" },
      { code: "C", section: "AMBIENTE", field: "environment", message: "z" },
    ];
    expect(groupBySection(findings).map(([s]) => s)).toEqual(["AMBIENTE", "EMITENTE", "ITENS"]);
  });
});

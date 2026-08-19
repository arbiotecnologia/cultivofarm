import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildFiscalEventIdempotencyKey,
  isFiscalIdempotencyConflict,
  FISCAL_IDEMPOTENCY_REQUIRED,
} from "@/lib/fiscal/eventIdempotency";

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
const MIGRATION = read(
  "supabase/migrations/20260920000000_h7b_fiscal_idempotencia_ambiente_v1.sql",
);

describe("H7b — chave de idempotência do evento fiscal", () => {
  const inv = "11111111-2222-3333-4444-555555555555";

  it("é determinística para a mesma tentativa lógica", () => {
    const a = buildFiscalEventIdempotencyKey(inv, "MANUAL_UPDATED", "nota");
    const b = buildFiscalEventIdempotencyKey(inv, "MANUAL_UPDATED", " nota ");
    expect(a).toBe(b);
  });

  it("muda quando o conteúdo material muda", () => {
    const a = buildFiscalEventIdempotencyKey(inv, "MANUAL_UPDATED", "nota A");
    const b = buildFiscalEventIdempotencyKey(inv, "MANUAL_UPDATED", "nota B");
    expect(a).not.toBe(b);
  });

  it("separa documentos e tipos de evento distintos", () => {
    const outro = "99999999-2222-3333-4444-555555555555";
    expect(buildFiscalEventIdempotencyKey(inv, "MANUAL_UPDATED", "x")).not.toBe(
      buildFiscalEventIdempotencyKey(outro, "MANUAL_UPDATED", "x"),
    );
    expect(buildFiscalEventIdempotencyKey(inv, "MANUAL_UPDATED", "x")).not.toBe(
      buildFiscalEventIdempotencyKey(inv, "RECONCILIATION_COMPLETED", "x"),
    );
  });

  it("reconhece o conflito estável devolvido pelo servidor", () => {
    expect(isFiscalIdempotencyConflict(new Error("FISCAL_IDEMPOTENCY_CONFLICT: ..."))).toBe(true);
    expect(isFiscalIdempotencyConflict(new Error("outro erro"))).toBe(false);
    expect(FISCAL_IDEMPOTENCY_REQUIRED).toBe("FISCAL_IDEMPOTENCY_REQUIRED");
  });
});

describe("H7b — contrato da migration canônica", () => {
  it("a RPC de evento exige chave e detecta conflito de payload", () => {
    expect(MIGRATION).toContain("FISCAL_IDEMPOTENCY_REQUIRED");
    expect(MIGRATION).toContain("FISCAL_IDEMPOTENCY_CONFLICT");
    expect(MIGRATION).toContain("payload_fingerprint");
    expect(MIGRATION).toContain("pg_advisory_xact_lock");
  });

  it("o registro manual é classificado como externo e exige evidência", () => {
    expect(MIGRATION).toContain("FISCAL_MANUAL_EVIDENCE_REQUIRED");
    expect(MIGRATION).toContain("'MANUAL_RECORD'");
    expect(MIGRATION).toContain("FISCAL_DOCUMENT_LOCKED");
    expect(MIGRATION).toContain("FISCAL_DOCUMENT_ENGINE_MANAGED");
  });

  it("o ajuste de ambiente só ocorre no staging autorizado e nunca em produção", () => {
    expect(MIGRATION).toContain("ikaauvsflpmamgxmkhoq");
    expect(MIGRATION).toContain("production_emission_allowed = false");
    expect(MIGRATION).toContain("nfe_environment_code = '2'");
    expect(MIGRATION).not.toContain("navfzbwgwzruipouyfnk");
    expect(MIGRATION).not.toMatch(/nfe_environment_code\s*=\s*'1'/);
  });

  it("as trigger functions H6c perdem privilégio de PUBLIC/anon", () => {
    expect(MIGRATION).toContain("fn_h6c_entrega_ar_b2b_link");
    expect(MIGRATION).toContain("fn_h6c_set_canonical_payment_terms");
    expect(MIGRATION).toMatch(/REVOKE ALL ON FUNCTION public\.fn_h6c_/);
  });
});

describe("H7b — os callers enviam a chave", () => {
  it("useFiscalDocuments e useFiscalReconciliation passam p_idempotency_key", () => {
    for (const f of ["src/hooks/useFiscalDocuments.ts", "src/hooks/useFiscalReconciliation.ts"]) {
      const src = read(f);
      expect(src).toContain("rpc_fiscal_event_manual");
      expect(src).toContain("p_idempotency_key");
      expect(src).toContain("buildFiscalEventIdempotencyKey");
    }
  });
});

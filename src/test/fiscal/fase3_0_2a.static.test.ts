/**
 * Fase Fiscal 3.0.2-A — Testes estáticos (sem execução SQL).
 * Validam a canonicalização e o conteúdo textual da migration.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const CANONICAL = resolve(
  ROOT,
  "supabase/migrations/20260722000000_fiscal_fase3_0_1_integridade.sql",
);
const STUB = resolve(
  ROOT,
  "restoration/migrations/20260722000000_fiscal_fase3_0_1_integridade.sql",
);
const FUND = resolve(
  ROOT,
  "supabase/migrations/20260721000000_fiscal_fase2_fundacao.sql",
);
const HARDEN = resolve(
  ROOT,
  "supabase/migrations/20260721010000_fiscal_fase2_1_hardening.sql",
);

const canonical = readFileSync(CANONICAL, "utf8");
const stub = readFileSync(STUB, "utf8");

describe("Fase 3.0.2-A — canonicalização", () => {
  it("migration canônica existe em supabase/migrations", () => {
    expect(existsSync(CANONICAL)).toBe(true);
  });

  it("restoration contém apenas stub documental (sem SQL executável)", () => {
    expect(stub).toMatch(/STUB/);
    expect(stub).not.toMatch(/\bCREATE\s+POLICY\b/i);
    expect(stub).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(stub).not.toMatch(/\bCREATE\s+OR\s+REPLACE\s+FUNCTION\b/i);
  });

  it("nenhuma outra fonte executável duplica a migration 20260722000000", () => {
    expect(stub.includes("BEGIN;")).toBe(false);
  });

  it("migrations aplicadas 20260721000000/010000 não foram editadas por esta fase", () => {
    // Sanidade mínima: cabeçalho e finalização preservados.
    const f2 = readFileSync(FUND, "utf8");
    const h2 = readFileSync(HARDEN, "utf8");
    expect(f2).toMatch(/FASE FISCAL 2/);
    expect(h2).toMatch(/FASE FISCAL 2\.1/);
    expect(h2).not.toMatch(/FASE FISCAL 3\.0\.2/);
  });
});

describe("Fase 3.0.2-A — integridade e FKs", () => {
  it("cria FK product_fiscal_profiles.product_id → produtos com RESTRICT", () => {
    expect(canonical).toMatch(
      /product_fiscal_profiles_product_id_fkey[\s\S]*produtos\(id\)\s+ON DELETE RESTRICT/i,
    );
  });

  it("cria FK customer_fiscal_profiles.customer_id → clientes com RESTRICT", () => {
    expect(canonical).toMatch(
      /customer_fiscal_profiles_customer_id_fkey[\s\S]*clientes\(id\)\s+ON DELETE RESTRICT/i,
    );
  });

  it("aplica NOT NULL em fiscal_events.fiscal_invoice_id com fail-loud", () => {
    expect(canonical).toMatch(
      /fiscal_events[\s\S]*ALTER COLUMN fiscal_invoice_id SET NOT NULL/i,
    );
    // Falha objetiva se houver órfãos.
    expect(canonical).toMatch(/RAISE EXCEPTION 'fase3_0_2a: %? ?evento/i);
  });

  it("não engole erros com EXCEPTION WHEN OTHERS THEN NULL", () => {
    expect(canonical).not.toMatch(/EXCEPTION\s+WHEN\s+OTHERS\s+THEN\s+NULL/i);
    expect(canonical).not.toMatch(/EXCEPTION\s+WHEN\s+others\s+THEN\s+NULL/i);
  });
});

describe("Fase 3.0.2-A — integridade de serviços", () => {
  it("não cria FK fictícia para service_id", () => {
    expect(canonical).not.toMatch(
      /service_fiscal_profiles_service_id_fkey/i,
    );
  });

  it("aplica CHECK XOR service_id / source_reference com btrim", () => {
    expect(canonical).toMatch(/chk_service_fp_ref_or_id/);
    expect(canonical).toMatch(/NULLIF\(btrim\(source_reference\)/);
  });

  it("cria unicidade case-insensitive parcial para source_reference ativo", () => {
    expect(canonical).toMatch(/ux_service_fp_source_ref_ci_active/);
    expect(canonical).toMatch(/lower\(btrim\(source_reference\)\)/);
  });
});

describe("Fase 3.0.2-A — policies", () => {
  it("company_fiscal_settings: DELETE negado + policies split", () => {
    expect(canonical).toMatch(/DROP POLICY IF EXISTS "company_fiscal_settings_write"/);
    expect(canonical).toMatch(/CREATE POLICY "company_fiscal_settings_insert"/);
    expect(canonical).toMatch(/CREATE POLICY "company_fiscal_settings_update"/);
    expect(canonical).toMatch(
      /CREATE POLICY "company_fiscal_settings_delete"[\s\S]*USING\s*\(false\)/,
    );
    expect(canonical).toMatch(
      /REVOKE DELETE ON public\.company_fiscal_settings FROM authenticated/,
    );
  });

  it("fiscal_invoices: DELETE negado, sem FOR ALL, administrativo removido", () => {
    expect(canonical).toMatch(/DROP POLICY IF EXISTS "fi_staff_all"/);
    expect(canonical).toMatch(/CREATE POLICY "fi_staff_select"/);
    expect(canonical).toMatch(/CREATE POLICY "fi_staff_insert"/);
    expect(canonical).toMatch(/CREATE POLICY "fi_staff_update"/);
    expect(canonical).toMatch(
      /CREATE POLICY "fi_staff_delete"[\s\S]*USING\s*\(false\)/,
    );
    // administrativo não recebe policy nova de fiscal_invoices.
    const invBlock = canonical.split("-- 5. PERFIS FISCAIS")[0];
    expect(invBlock).not.toMatch(/'administrativo'::app_role/);
  });

  it("cliente_produtor limitado a documentos próprios", () => {
    expect(canonical).toMatch(
      /fi_producer_read[\s\S]*cliente_produtor[\s\S]*clientes[\s\S]*user_id = auth\.uid\(\)/,
    );
  });

  it("perfis fiscais: DELETE direto negado nas 3 tabelas", () => {
    expect(canonical).toMatch(/product_fiscal_profiles/);
    expect(canonical).toMatch(/service_fiscal_profiles/);
    expect(canonical).toMatch(/customer_fiscal_profiles/);
    expect(canonical).toMatch(
      /CREATE POLICY %I ON public\.%I FOR DELETE TO authenticated USING \(false\)/,
    );
    expect(canonical).toMatch(/REVOKE DELETE ON public\.%I FROM authenticated/);
  });
});

describe("Fase 3.0.2-A — eventos e RPC", () => {
  it("adiciona coluna notes e CHECK de 2000 chars", () => {
    expect(canonical).toMatch(/ADD COLUMN IF NOT EXISTS notes text/);
    expect(canonical).toMatch(/chk_fiscal_events_notes_len/);
    expect(canonical).toMatch(/char_length\(notes\)\s*<=\s*2000/);
  });

  it("RPC rpc_fiscal_event_manual mantém assinatura (uuid,text,text)", () => {
    expect(canonical).toMatch(
      /FUNCTION public\.rpc_fiscal_event_manual\(\s*p_invoice_id uuid,\s*p_event_type text,\s*p_notes text DEFAULT NULL\s*\)/,
    );
  });

  it("RPC valida documento, role e event_type e limita notes", () => {
    expect(canonical).toMatch(/invoice_id_required/);
    expect(canonical).toMatch(/invoice_not_found/);
    expect(canonical).toMatch(/event_type_not_allowed_for_manual/);
    expect(canonical).toMatch(/notes_too_long/);
    expect(canonical).toMatch(/event_source[\s\S]*'USER'/);
    expect(canonical).toMatch(/performed_by[\s\S]*v_actor/);
  });

  it("RPC executa apenas para authenticated", () => {
    expect(canonical).toMatch(
      /REVOKE ALL ON FUNCTION public\.rpc_fiscal_event_manual\(uuid,text,text\) FROM public, anon/,
    );
    expect(canonical).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.rpc_fiscal_event_manual\(uuid,text,text\) TO authenticated/,
    );
  });
});

describe("Fase 3.0.2-A — mascaramento e view", () => {
  it("mask_sensitive_jsonb é recursiva (array + object)", () => {
    expect(canonical).toMatch(/jsonb_typeof\(v\)\s*=\s*'array'/);
    expect(canonical).toMatch(/jsonb_typeof\(v\)\s*=\s*'object'/);
    expect(canonical).toMatch(/mask_sensitive_jsonb\(item\)/);
    expect(canonical).toMatch(/mask_sensitive_jsonb\(val\)/);
  });

  it("mask cobre todos os termos sensíveis", () => {
    for (const term of [
      "authorization","token","access_token","refresh_token",
      "password","senha","certificate","certificado",
      "private_key","privatekey","secret","client_secret",
      "pfx","p12","api_key","apikey","bearer",
    ]) {
      expect(canonical).toContain(`'${term}'`);
    }
  });

  it("comparação case-insensitive e substituição por ***REDACTED***", () => {
    expect(canonical).toMatch(/lower\(k\)/);
    expect(canonical).toMatch(/\*\*\*REDACTED\*\*\*/);
  });

  it("view reconciliation com security_invoker e filtro por role", () => {
    expect(canonical).toMatch(
      /VIEW public\.v_fiscal_document_reconciliation_pending[\s\S]*security_invoker\s*=\s*true/,
    );
    expect(canonical).toMatch(
      /v_fiscal_document_reconciliation_pending[\s\S]*has_role\(auth\.uid\(\),'administrador'/,
    );
    expect(canonical).toMatch(
      /REVOKE ALL ON public\.v_fiscal_document_reconciliation_pending FROM public, anon/,
    );
    expect(canonical).toMatch(
      /GRANT SELECT ON public\.v_fiscal_document_reconciliation_pending TO authenticated/,
    );
  });
});

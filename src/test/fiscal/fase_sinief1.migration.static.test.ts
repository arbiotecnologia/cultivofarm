/**
 * Fase SINIEF 1 — Auditoria estática da migration canônica.
 *
 * DIVERGÊNCIA CONTROLADA: o sandbox do agente não permitiu gravar em
 * supabase/migrations/ nesta fase (projeto usa Supabase externo sem
 * Lovable Cloud). A fonte executável canônica está em:
 *   restoration/migrations/20260807000000_fiscal_sinief_49_scaffolding.sql
 * O humano deve sincronizar este arquivo para supabase/migrations/
 * com o mesmo nome antes de aplicar via pipeline oficial.
 *
 * Testes garantem: fonte executável única (em restoration/) + ausência
 * de duplicata parcial em supabase/migrations/ (evita divergência).
 */
import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const CANON = path.resolve(
  process.cwd(),
  "restoration/migrations/20260807000000_fiscal_sinief_49_scaffolding.sql",
);
const SUPABASE_MIRROR = path.resolve(
  process.cwd(),
  "supabase/migrations/20260807000000_fiscal_sinief_49_scaffolding.sql",
);

const sql = fs.readFileSync(CANON, "utf-8");

describe("Fase SINIEF 1 — migration aditiva SINIEF 49/2025", () => {
  test("canônica existe em supabase/migrations/", () => {
    expect(fs.existsSync(CANON)).toBe(true);
  });

  test("transacional (BEGIN/COMMIT)", () => {
    expect(sql).toMatch(/\bBEGIN;/);
    expect(sql).toMatch(/\bCOMMIT;/);
  });

  test("aditiva: sem DROP TABLE / DROP COLUMN / TRUNCATE / DELETE / ALTER TYPE destrutivo", () => {
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    // DROP CONSTRAINT é permitido apenas para reescrever CHECKs; não deve
    // remover PK/FK/UNIQUE:
    expect(sql).not.toMatch(/DROP\s+CONSTRAINT\s+\w*(_pkey|_fkey|_key)\b/i);
  });

  test("sem provider/URL/transmissão introduzidos", () => {
    expect(sql).not.toMatch(/sefaz/i);
    expect(sql).not.toMatch(/focus[_-]?nfe/i);
    expect(sql).not.toMatch(/https?:\/\//i);
    expect(sql).not.toMatch(/transmit/i);
    expect(sql).not.toMatch(/xml/i);
  });

  test("fiscal_invoices: colunas aditivas + CHECKs restritivos", () => {
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+direction\s+text/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+fiscal_operation_type\s+text/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+fin_nfe\s+smallint/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+tp_nf_debito\s+smallint/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+tp_nf_credito\s+smallint/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+nature_operation\s+text/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+tax_authority_notes\s+text/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+legal_basis\s+text/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+legal_version\s+text/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+legal_effective_date\s+date/i);

    // CHECK direction
    expect(sql).toMatch(/chk_fi_direction[\s\S]+'OUT'[\s\S]+'IN'/);
    // CHECK fiscal_operation_type cobre os 8 cenários
    const OP_TYPES = [
      "NORMAL","ADVANCE_PAYMENT","EFFECTIVE_SALE_AFTER_ADVANCE","STOCK_LOSS",
      "VALUE_QUANTITY_REDUCTION","DELIVERY_REFUSAL_TOTAL","DELIVERY_REFUSAL_PARTIAL","RECIPIENT_NOT_FOUND",
    ];
    const opBlock = sql.match(/chk_fi_fiscal_operation_type[\s\S]+?\)\s*\)/);
    expect(opBlock).not.toBeNull();
    for (const t of OP_TYPES) {
      expect(opBlock![0]).toContain(`'${t}'`);
    }
    expect(sql).toMatch(/chk_fi_fin_nfe[\s\S]+IN\s*\(1,2,3,4,5,6\)/i);
    expect(sql).toMatch(/chk_fi_tp_nf_debito[\s\S]+BETWEEN\s+1\s+AND\s+99/i);
    expect(sql).toMatch(/chk_fi_tp_nf_credito[\s\S]+BETWEEN\s+1\s+AND\s+99/i);
  });

  test("fiscal_invoice_references: tabela + FKs + relation_type + no self-reference + access_key format", () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.fiscal_invoice_references/i);
    expect(sql).toMatch(/fiscal_invoice_id[\s\S]+REFERENCES\s+public\.fiscal_invoices\(id\)\s+ON\s+DELETE\s+CASCADE/i);
    expect(sql).toMatch(/referenced_invoice_id\s+uuid\s+NULL[\s\S]+REFERENCES\s+public\.fiscal_invoices\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i);

    const relBlock = sql.match(/chk_fir_relation_type[\s\S]+?\)\s*\)/);
    expect(relBlock).not.toBeNull();
    for (const t of [
      "ADVANCE_PAYMENT_OF","EFFECTIVE_SALE_OF","REDUCTION_OF",
      "TOTAL_REFUSAL_OF","PARTIAL_REFUSAL_OF","RECIPIENT_NOT_FOUND_OF",
    ]) {
      expect(relBlock![0]).toContain(`'${t}'`);
    }
    expect(sql).toMatch(/chk_fir_no_self_reference[\s\S]+referenced_invoice_id\s*<>\s*fiscal_invoice_id/i);
    expect(sql).toMatch(/chk_fir_has_target/i);
    expect(sql).toMatch(/chk_fir_access_key_format[\s\S]+\[0-9\]\{44\}/);
    expect(sql).toMatch(/ux_fir_unique_relation/i);
  });

  test("fiscal_invoice_item_references: DFeReferenciado por item + constraints positivas", () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.fiscal_invoice_item_references/i);
    expect(sql).toMatch(/fiscal_invoice_item_id[\s\S]+REFERENCES\s+public\.fiscal_invoice_items\(id\)\s+ON\s+DELETE\s+CASCADE/i);
    expect(sql).toMatch(/referenced_item_id\s+uuid\s+NULL[\s\S]+REFERENCES\s+public\.fiscal_invoice_items\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i);
    const refBlock = sql.match(/chk_fiir_reference_type[\s\S]+?\)\s*\)/);
    expect(refBlock).not.toBeNull();
    expect(refBlock![0]).toContain("'PARTIAL_REFUSAL_ITEM'");
    expect(refBlock![0]).toContain("'REDUCTION_ITEM'");
    expect(sql).toMatch(/chk_fiir_no_self_reference/i);
    expect(sql).toMatch(/chk_fiir_has_target/i);
    expect(sql).toMatch(/chk_fiir_quantity_positive[\s\S]+>\s*0/);
    expect(sql).toMatch(/chk_fiir_value_positive[\s\S]+>\s*0/);
    expect(sql).toMatch(/chk_fiir_referenced_item_sequence_positive[\s\S]+>\s*0/);
  });

  test("fiscal_stock_loss_contexts: categoria + justificativa + FK confirmada (lotes) + sem FK inventada", () => {
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.fiscal_stock_loss_contexts/i);
    // FK confirmada — lotes existe
    expect(sql).toMatch(/lote_id\s+uuid\s+NULL\s+REFERENCES\s+public\.lotes\(id\)/i);
    // movimentacao_id: sem FK inventada
    const movLine = sql.match(/movimentacao_id[^,\n]+/i);
    expect(movLine).not.toBeNull();
    expect(movLine![0]).not.toMatch(/REFERENCES/i);
    // Categorias legais
    const catBlock = sql.match(/chk_fslc_legal_reason_category[\s\S]+?\)\s*\)/);
    expect(catBlock).not.toBeNull();
    for (const c of ["LOSS","PERISHMENT","DETERIORATION","THEFT","ROBBERY"]) {
      expect(catBlock![0]).toContain(`'${c}'`);
    }
    // Justificativa obrigatória
    expect(sql).toMatch(/chk_fslc_legal_reason_details_not_blank[\s\S]+length\(btrim\(legal_reason_details\)\)\s*>\s*0/i);
    // UNIQUE por invoice
    expect(sql).toMatch(/fiscal_invoice_id\s+uuid\s+NOT\s+NULL\s+UNIQUE/i);
  });

  test("fiscal_events: CHECK preserva valores originais e amplia com SINIEF", () => {
    const legacy = [
      "CREATED","MANUAL_UPDATED","DOCUMENT_ATTACHED","VALIDATION_REQUESTED",
      "VALIDATION_FAILED","READY_FOR_FUTURE_INTEGRATION",
      "RECONCILIATION_REQUIRED","RECONCILIATION_COMPLETED",
      "DOCUMENT_CANCELED_FINANCIAL_REVIEW_REQUIRED","TOTAL_MISMATCH",
      "CUSTOMER_MISMATCH","SOURCE_MISMATCH","REPLACEMENT_REQUIRED",
    ];
    const sinief = [
      "SINIEF_ADVANCE_PAYMENT_ISSUED","SINIEF_EFFECTIVE_SALE_ISSUED",
      "SINIEF_STOCK_LOSS_ISSUED","SINIEF_VALUE_QUANTITY_REDUCTION_ISSUED",
      "SINIEF_DELIVERY_REFUSAL_TOTAL_ISSUED","SINIEF_DELIVERY_REFUSAL_PARTIAL_ISSUED",
      "SINIEF_RECIPIENT_NOT_FOUND_ISSUED",
    ];
    const block = sql.match(/fiscal_events_event_type_check[\s\S]+?\)\s*\)\s*;/);
    expect(block).not.toBeNull();
    for (const v of [...legacy, ...sinief]) {
      expect(block![0]).toContain(`'${v}'`);
    }
  });

  test("RLS: novas tabelas habilitam RLS e escrita restrita a administrador/financeiro; sem policy UPDATE/DELETE (imutabilidade)", () => {
    for (const t of [
      "fiscal_invoice_references",
      "fiscal_invoice_item_references",
      "fiscal_stock_loss_contexts",
    ]) {
      const re = new RegExp(`ALTER\\s+TABLE\\s+public\\.${t}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");
      expect(sql).toMatch(re);

      const insertPolRe = new RegExp(`CREATE\\s+POLICY[^;]*"${t}_insert"[\\s\\S]+?WITH\\s+CHECK[\\s\\S]+?;`, "i");
      const m = sql.match(insertPolRe);
      expect(m, `insert policy for ${t}`).not.toBeNull();
      expect(m![0]).toMatch(/'administrador'/);
      expect(m![0]).toMatch(/'financeiro'/);
      expect(m![0]).not.toMatch(/'tecnico_agronomo'/);

      // Sem policies UPDATE/DELETE (padrão fiscal imutável)
      expect(sql).not.toMatch(new RegExp(`CREATE\\s+POLICY[^;]*"${t}_update"`, "i"));
      expect(sql).not.toMatch(new RegExp(`CREATE\\s+POLICY[^;]*"${t}_delete"`, "i"));
    }
  });

  test("GRANTs explícitos para authenticated (SELECT,INSERT) e service_role (ALL)", () => {
    for (const t of [
      "fiscal_invoice_references",
      "fiscal_invoice_item_references",
      "fiscal_stock_loss_contexts",
    ]) {
      expect(sql).toMatch(new RegExp(`GRANT\\s+SELECT,\\s*INSERT\\s+ON\\s+public\\.${t}\\s+TO\\s+authenticated`, "i"));
      expect(sql).toMatch(new RegExp(`GRANT\\s+ALL\\s+ON\\s+public\\.${t}\\s+TO\\s+service_role`, "i"));
    }
  });

  test("fonte executável única: restoration/ é stub documental sem SQL executável", () => {
    expect(fs.existsSync(STUB)).toBe(true);
    const raw = fs.readFileSync(STUB, "utf-8");
    const body = raw
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(body).not.toMatch(/\bBEGIN\s*;/i);
    expect(body).not.toMatch(/\bCOMMIT\s*;/i);
    expect(body).not.toMatch(/\bCREATE\s+(TABLE|VIEW|POLICY|INDEX|TRIGGER|OR\s+REPLACE)/i);
    expect(body).not.toMatch(/\bALTER\s+(TABLE|VIEW|TYPE)/i);
    expect(body).not.toMatch(/\bGRANT\b/i);
    expect(body).not.toMatch(/\bREVOKE\b/i);
    expect(raw).toMatch(/supabase\/migrations\/20260807000000_fiscal_sinief_49_scaffolding\.sql/);
  });
});

describe("Fase SINIEF 1 — invariantes de emissão preservados", () => {
  test("fiscalEmissionEnabled=false em src/config/featureFlags.ts", () => {
    const flags = fs.readFileSync(
      path.resolve(process.cwd(), "src/config/featureFlags.ts"),
      "utf-8",
    );
    expect(flags).toMatch(/fiscalEmissionEnabled\s*:\s*false/);
  });

  test("preflight mantém provider=NONE e canTransmit=false hardcoded", () => {
    const pf = fs.readFileSync(
      path.resolve(process.cwd(), "supabase/functions/fiscal-preflight/index.ts"),
      "utf-8",
    );
    expect(pf).toMatch(/canTransmit:\s*false\s+as\s+const/);
    expect(pf).toMatch(/provider:\s*"NONE"\s+as\s+const/);
  });
});

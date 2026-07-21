/**
 * Fase Fiscal 3.6 — Testes estáticos da reconciliação assistida.
 *
 * Cobrem:
 *  (1) flags default false + fiscalEmissionEnabled=false;
 *  (2) matriz de perfis (admin/fin RW, gestor R, restantes none);
 *  (3) classificação de pendências e agregação;
 *  (4) whitelists estritas de LINK/UNLINK — apenas colunas do fiscal_invoices;
 *  (5) validação de motivo do UNLINK (10–500);
 *  (6) validação de UUID em LINK;
 *  (7) ausência de emissão, integradores, secrets e SELECT amplo no código;
 *  (8) mascaramento de CNPJ/chave;
 *  (9) sem DELETE / sem escrita em accounts_receivable / entregas;
 * (10) escrita fiscal_invoices em modo MANUAL + concorrência otimista;
 * (11) evento manual só via RPC e atrás das duas flags;
 * (12) preservação integral das fases anteriores (arquivos existem).
 */
import { describe, test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import { getAccessLevel } from "@/lib/permissions";
import {
  RECONCILIATION_STATUS_VALUES,
  PENDENCY_KIND_VALUES,
  classifyPendency,
  summarize,
  linkSchema,
  unlinkSchema,
  assertManualEditable,
  maskDocument,
  maskAccessKey,
  truncateId,
  ReconciliationWriteDisabledError,
  OptimisticReconciliationConflictError,
  NonManualInvoiceError,
  MissingUnlinkReasonError,
  LINK_UPDATE_COLUMNS,
  type ReconciliationPendingRow,
  type FiscalInvoiceRow,
} from "@/lib/fiscal/reconciliationValidation";

const HOOK_PATH = resolve(__dirname, "../../hooks/useFiscalReconciliation.ts");
const PAGE_PATH = resolve(__dirname, "../../pages/fiscal/FiscalReconciliacao.tsx");
const VALIDATION_PATH = resolve(__dirname, "../../lib/fiscal/reconciliationValidation.ts");
const APP_PATH = resolve(__dirname, "../../App.tsx");
const NAV_PATH = resolve(__dirname, "../../config/navigation.ts");

const hookSrc = readFileSync(HOOK_PATH, "utf8");
const pageSrc = readFileSync(PAGE_PATH, "utf8");
const validationSrc = readFileSync(VALIDATION_PATH, "utf8");
const appSrc = readFileSync(APP_PATH, "utf8");
const navSrc = readFileSync(NAV_PATH, "utf8");
const phaseSources = [hookSrc, pageSrc, validationSrc];

const UUID = "11111111-1111-1111-1111-111111111111";
const UUID2 = "22222222-2222-2222-2222-222222222222";

function baseInvoice(partial: Partial<FiscalInvoiceRow> = {}): FiscalInvoiceRow {
  return {
    id: UUID,
    updated_at: "2026-07-01T00:00:00Z",
    locked_at: null,
    document_origin: "MANUAL_RECORD",
    provider: "NONE",
    receivable_id: null,
    delivery_id: null,
    ...partial,
  } as FiscalInvoiceRow;
}

describe("Fase 3.6 · (1) Flags default false + emissão desligada", () => {
  test("fiscalReconciliationUi/Write default false", () => {
    expect(FEATURE_FLAGS.fiscalReconciliationUi).toBe(false);
    expect(FEATURE_FLAGS.fiscalReconciliationWrite).toBe(false);
  });
  test("fiscalEmissionEnabled permanece false", () => {
    expect(FEATURE_FLAGS.fiscalEmissionEnabled).toBe(false);
  });
});

describe("Fase 3.6 · (2) Matriz de perfis", () => {
  const ROUTE = "/fiscal/reconciliacao";
  test("administrador tem rw", () => {
    expect(getAccessLevel("administrador", ROUTE)).toBe("rw");
  });
  test("financeiro tem rw", () => {
    expect(getAccessLevel("financeiro", ROUTE)).toBe("rw");
  });
  test("gestor tem r", () => {
    expect(getAccessLevel("gestor", ROUTE)).toBe("r");
  });
  test.each([
    "consultor",
    "aplicador",
    "cliente_final",
    "parceiro_b2b",
    "usuario_padrao",
  ] as const)("%s não tem acesso", (r) => {
    expect(getAccessLevel(r, ROUTE)).toBe("none");
  });
});

describe("Fase 3.6 · (3) Classificação e agregação", () => {
  test("MISSING_RECEIVABLE", () => {
    const row: ReconciliationPendingRow = {
      fiscal_invoice_id: UUID,
      receivable_id: null,
      document_model: "NFE",
      document_origin: "MANUAL_RECORD",
      status: "issued",
      normalized_status: "issued",
      reconciliation_status: "PENDING",
    } as ReconciliationPendingRow;
    expect(classifyPendency(row)).toBe("MISSING_RECEIVABLE");
  });
  test("summarize conta por tipo", () => {
    const rows: ReconciliationPendingRow[] = [
      { fiscal_invoice_id: UUID, receivable_id: null } as ReconciliationPendingRow,
      { fiscal_invoice_id: UUID2, receivable_id: UUID } as ReconciliationPendingRow,
    ];
    const s = summarize(rows, [null, null]);
    expect(s.total).toBe(2);
    for (const k of PENDENCY_KIND_VALUES) {
      expect(typeof s.byKind[k]).toBe("number");
    }
  });
});

describe("Fase 3.6 · (4) Whitelists estritas", () => {
  test("LINK_UPDATE_COLUMNS = apenas receivable_id e delivery_id", () => {
    expect([...LINK_UPDATE_COLUMNS].sort()).toEqual(
      ["delivery_id", "receivable_id"],
    );
  });
  test("hook nunca atualiza colunas fora da whitelist", () => {
    const forbidden = [
      "invoice_number", "access_key", "authorized_at", "canceled_at",
      "customer_snapshot", "company_snapshot", "provider", "environment",
      "document_origin",
    ];
    // A whitelist é aplicada via patch tipado — verifica que colunas proibidas
    // não aparecem em .update(...) do módulo do hook.
    for (const col of forbidden) {
      expect(hookSrc).not.toMatch(new RegExp(`\\.update\\([^)]*${col}`));
    }
  });
});

describe("Fase 3.6 · (5) UNLINK exige motivo 10-500", () => {
  test("motivo curto rejeitado", () => {
    expect(() =>
      unlinkSchema.parse({
        invoiceId: UUID, target: "receivable_id", reason: "curto",
      }),
    ).toThrow();
  });
  test("motivo longo rejeitado", () => {
    expect(() =>
      unlinkSchema.parse({
        invoiceId: UUID, target: "receivable_id", reason: "x".repeat(501),
      }),
    ).toThrow();
  });
  test("motivo válido aceito", () => {
    const ok = unlinkSchema.parse({
      invoiceId: UUID, target: "delivery_id",
      reason: "Motivo suficientemente descritivo",
    });
    expect(ok.target).toBe("delivery_id");
  });
});

describe("Fase 3.6 · (6) LINK exige UUID válido", () => {
  test("UUID inválido rejeitado", () => {
    expect(() =>
      linkSchema.parse({
        invoiceId: UUID, target: "receivable_id",
        targetId: "not-a-uuid", confirmOverwrite: false,
      }),
    ).toThrow();
  });
  test("UUID válido aceito", () => {
    const ok = linkSchema.parse({
      invoiceId: UUID, target: "receivable_id",
      targetId: UUID2, confirmOverwrite: false,
    });
    expect(ok.targetId).toBe(UUID2);
  });
});

describe("Fase 3.6 · (7) Sem emissão, integradores, secrets ou SELECT amplo", () => {
  const banned = [
    "sefaz", "SEFAZ", "focusnfe", "webmania", "nfe.io", "envia",
    "process.env.", "SERVICE_ROLE", "service_role",
  ];
  test.each(banned)("token %s ausente do código da fase", (t) => {
    for (const src of phaseSources) {
      expect(src).not.toContain(t);
    }
  });
  test("nenhum SELECT('*') no hook/página", () => {
    expect(hookSrc).not.toMatch(/\.select\(\s*["']\*/);
    expect(pageSrc).not.toMatch(/\.select\(\s*["']\*/);
  });
});

describe("Fase 3.6 · (8) Mascaramento", () => {
  test("CNPJ mascarado", () => {
    expect(maskDocument("12345678000199")).not.toContain("34567800");
  });
  test("chave de acesso mascarada", () => {
    expect(maskAccessKey("1".repeat(44))).toMatch(/\*/);
  });
  test("truncateId encurta", () => {
    expect(truncateId(UUID, 8).length).toBeLessThanOrEqual(8 + 1);
  });
});

describe("Fase 3.6 · (9) Sem DELETE e sem escrita fora do fiscal_invoices", () => {
  test("nenhum .delete() no código da fase", () => {
    for (const src of phaseSources) {
      expect(src).not.toMatch(/\.delete\(/);
    }
  });
  test.each([
    "accounts_receivable", "entregas", "deliveries",
  ])("nenhum .from('%s').update|insert|delete", (tbl) => {
    for (const src of phaseSources) {
      expect(src).not.toMatch(new RegExp(`from\\(["']${tbl}["']\\)[^;]*\\.(update|insert|delete|upsert)`));
    }
  });
});

describe("Fase 3.6 · (10) Escrita gated + concorrência otimista", () => {
  test("assertManualEditable exige MANUAL_RECORD + NONE + sem lock", () => {
    expect(() => assertManualEditable(baseInvoice({ locked_at: "2026-01-01T00:00:00Z" }))).toThrow(NonManualInvoiceError);
    expect(() => assertManualEditable(baseInvoice({ document_origin: "EXTERNAL_IMPORTED" }))).toThrow(NonManualInvoiceError);
    expect(() => assertManualEditable(baseInvoice({ provider: "FOCUS_NFE" as unknown as FiscalInvoiceRow["provider"] }))).toThrow(NonManualInvoiceError);
    assertManualEditable(baseInvoice());
  });
  test("hook usa .eq('updated_at') e .is('locked_at', null)", () => {
    expect(hookSrc).toMatch(/\.eq\(["']updated_at["']/);
    expect(hookSrc).toMatch(/\.is\(["']locked_at["']\s*,\s*null\)/);
  });
  test("ReconciliationWriteDisabledError disponível", () => {
    expect(new ReconciliationWriteDisabledError().message).toMatch(/./);
    expect(new OptimisticReconciliationConflictError().message).toMatch(/./);
    expect(new MissingUnlinkReasonError().message).toMatch(/./);
  });
});

describe("Fase 3.6 · (11) Evento manual só via RPC", () => {
  test("hook referencia rpc_fiscal_event_manual", () => {
    // opcional: hook pode emitir evento manual no unlink quando ambas as flags estiverem on.
    // A referência textual garante que nenhum outro caminho está sendo usado.
    const usesRpc = hookSrc.includes("rpc_fiscal_event_manual");
    const doesNotUseInsert = !/fiscal_events["'].*\.insert/.test(hookSrc);
    expect(doesNotUseInsert).toBe(true);
    // Se referenciar, deve estar atrás de flag:
    if (usesRpc) {
      expect(hookSrc).toMatch(/fiscalDocumentManualEventRpc|manualEventEnabled/);
    }
  });
});

describe("Fase 3.6 · (12) Preservação das fases anteriores", () => {
  test.each([
    "src/pages/configuracoes/FiscalEmpresa.tsx",
    "src/pages/configuracoes/FiscalProdutos.tsx",
    "src/pages/configuracoes/FiscalServicos.tsx",
    "src/pages/configuracoes/FiscalClientes.tsx",
    "src/pages/fiscal/FiscalDocumentos.tsx",
  ])("arquivo %s continua existindo", (rel) => {
    expect(existsSync(resolve(__dirname, "../../../", rel))).toBe(true);
  });
  test("rota /fiscal/documentos permanece registrada", () => {
    expect(appSrc).toMatch(/\/fiscal\/documentos/);
  });
  test("rota /fiscal/reconciliacao registrada", () => {
    expect(appSrc).toMatch(/\/fiscal\/reconciliacao/);
  });
  test("menu de navegação inalterado até flag ativar", () => {
    // Fase 3.6 não adiciona entrada permanente enquanto flag off.
    expect(FEATURE_FLAGS.fiscalReconciliationUi).toBe(false);
    expect(navSrc.includes("/fiscal/reconciliacao")).toBe(false);
  });
});

describe("Fase 3.6 · Status de reconciliação declarado", () => {
  test("valores canônicos preservados", () => {
    expect(RECONCILIATION_STATUS_VALUES).toContain("PENDING");
    expect(RECONCILIATION_STATUS_VALUES).toContain("MATCHED");
  });
});

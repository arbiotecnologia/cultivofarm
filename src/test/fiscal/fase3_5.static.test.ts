/**
 * Fase Fiscal 3.5 — Testes estáticos do Workflow Documental Manual.
 *
 * Cobrem os 14 pontos obrigatórios:
 *  (1) flags default false + fiscalEmissionEnabled=false;
 *  (2) matriz de perfis + acesso por URL direta;
 *  (3) ausência no menu enquanto a flag estiver false;
 *  (4) ausência de emissão/integradores/secrets no código da fase;
 *  (5) provider NONE e ambiente não produtivo em INSERT/UPDATE;
 *  (6) whitelist estrita de payload (INSERT/UPDATE) — diff-only no UPDATE;
 *  (7) bloqueio de status normalizados que simulam emissão;
 *  (8) sem DELETE físico na página, hook ou validação;
 *  (9) evento manual SOMENTE via RPC (gate por flag e whitelist de tipos);
 * (10) concorrência otimista por updated_at + locked_at;
 * (11) idempotência: sem upsert, sem gerar chaves de integração;
 * (12) mascaramento: snapshots/segredos nunca crus;
 * (13) gestor somente leitura;
 * (14) preservação integral das Fases 3.1, 3.1.1, 3.2, 3.3 e 3.4 e
 *      nenhuma alteração nos módulos Financeiro/Entregas/Clientes/etc.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import { getAccessLevel } from "@/lib/permissions";
import {
  invoiceFormSchema,
  buildInsertPayload,
  buildUpdatePayload,
  rowToFormValues,
  maskSnapshot,
  maskSensitiveText,
  assertProviderManual,
  assertEnvironmentSafe,
  assertNormalizedStatusManual,
  assertManualEventType,
  ForbiddenProviderError,
  ForbiddenEnvironmentError,
  ForbiddenNormalizedStatusError,
  InvalidManualEventTypeError,
  INSERT_ALLOWED_COLUMNS,
  UPDATE_ALLOWED_COLUMNS,
  MANUAL_EVENT_TYPES,
  NORMALIZED_STATUS_FORBIDDEN_UI,
  ENVIRONMENT_FORBIDDEN,
  PROVIDER_MANUAL,
  DOCUMENT_ORIGIN_MANUAL,
  type FiscalInvoiceRow,
  type InvoiceFormValues,
} from "@/lib/fiscal/documentWorkflowValidation";
import {
  isEditableManualDocument,
  OptimisticFiscalConflictError,
  InvoiceLockedError,
  ManualEventRpcDisabledError,
} from "@/hooks/useFiscalDocuments";
import { navigation } from "@/config/navigation";

const ROUTE = "/fiscal/documentos";
const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

const BASE_VALUES: InvoiceFormValues = {
  invoice_type: "OTHER",
  document_model: "OTHER",
  environment: "NOT_CONFIGURED",
  status: "DRAFT",
  normalized_status: "DRAFT",
  reconciliation_status: "NOT_APPLICABLE",
  invoice_number: "",
  series: "",
  issue_date: "",
  total_amount: "",
  company_cnpj: "",
  notes: "",
  receivable_id: "",
  delivery_id: "",
};

function makeRow(over: Partial<FiscalInvoiceRow> = {}): FiscalInvoiceRow {
  return {
    id: UUID_A,
    invoice_type: "OTHER",
    document_model: "OTHER",
    document_origin: "MANUAL_RECORD",
    environment: "NOT_CONFIGURED",
    provider: "NONE",
    status: "DRAFT",
    normalized_status: "DRAFT",
    reconciliation_status: "NOT_APPLICABLE",
    invoice_number: null,
    series: null,
    issue_date: null,
    total_amount: null,
    company_cnpj: null,
    receivable_id: null,
    delivery_id: null,
    notes: null,
    locked_at: null,
    locked_by: null,
    updated_at: "2026-07-21T00:00:00Z",
    created_at: "2026-07-21T00:00:00Z",
    access_key: null,
    authorized_at: null,
    rejected_at: null,
    canceled_at: null,
    cancel_reason: null,
    provider_reference: null,
    provider_status_raw: null,
    idempotency_key: null,
    parent_invoice_id: null,
    substitution_invoice_id: null,
    source_id: null,
    source_type: null,
    xml_document_id: null,
    danfe_document_id: null,
    company_snapshot: null,
    customer_snapshot: null,
    fiscal_totals_snapshot: null,
    payload_schema_version: null,
    created_by: UUID_B,
    ...over,
  } as FiscalInvoiceRow;
}

// (1) — flags e emissão desligada
describe("Fase 3.5 (1) — flags default false", () => {
  test("fiscalDocumentWorkflowUi default = false", () => {
    expect(FEATURE_FLAGS.fiscalDocumentWorkflowUi).toBe(false);
  });
  test("fiscalDocumentManualEventRpc default = false", () => {
    expect(FEATURE_FLAGS.fiscalDocumentManualEventRpc).toBe(false);
  });
  test("fiscalEmissionEnabled continua false", () => {
    expect(FEATURE_FLAGS.fiscalEmissionEnabled).toBe(false);
  });
});

// (2) — matriz de perfis
describe("Fase 3.5 (2) — matriz de acesso por URL direta", () => {
  test("administrador rw", () => {
    expect(getAccessLevel("administrador", ROUTE)).toBe("rw");
  });
  test("financeiro rw", () => {
    expect(getAccessLevel("financeiro", ROUTE)).toBe("rw");
  });
  test("gestor somente leitura", () => {
    expect(getAccessLevel("gestor", ROUTE)).toBe("r");
  });
  test.each([
    "consultor_tecnico",
    "tecnico_agronomo",
    "operador_onfarm",
    "administrativo",
    "producao",
    "parceiro_b2b",
    "aplicador",
    "cliente",
  ] as const)("perfil %s bloqueado", (role) => {
    expect(getAccessLevel(role, ROUTE)).toBe("none");
  });
  test("anônimo bloqueado", () => {
    expect(getAccessLevel(null, ROUTE)).toBe("none");
  });
});

// (3) — ausência no menu
describe("Fase 3.5 (3) — ausência no menu com flag desligada", () => {
  test("navegação não expõe /fiscal/documentos", () => {
    const items = navigation as unknown as Array<{ route?: string }>;
    const hit = items.find((it) => it.route === ROUTE);
    expect(hit).toBeUndefined();
  });
});

// (4) — sem emissão / integradores / secrets
describe("Fase 3.5 (4) — sem emissão, integradores ou secrets", () => {
  const files = [
    "src/pages/fiscal/FiscalDocumentos.tsx",
    "src/hooks/useFiscalDocuments.ts",
    "src/lib/fiscal/documentWorkflowValidation.ts",
  ];
  const forbidden = [
    "SUPABASE_SERVICE_ROLE",
    "service_role",
    "authorizeInvoice",
    "transmitInvoice",
    "cancelInvoice",
    "inutilize",
    "sefaz",
    "webhook",
    "certificate.pfx",
    "certificado.pfx",
    "focusnfe",
    "nfe.io",
    "plugnotas",
  ];
  test.each(files)("arquivo %s não contém termos proibidos", (f) => {
    const src = readFileSync(resolve(f), "utf8").toLowerCase();
    for (const t of forbidden) {
      expect(src.includes(t.toLowerCase()), `${f} contém "${t}"`).toBe(false);
    }
  });
});

// (5) — provider/ambiente forçados
describe("Fase 3.5 (5) — provider NONE e ambiente não produtivo", () => {
  test("assertProviderManual aceita apenas NONE", () => {
    expect(() => assertProviderManual("NONE")).not.toThrow();
    expect(() => assertProviderManual("FOCUS")).toThrow(ForbiddenProviderError);
  });
  test("assertEnvironmentSafe bloqueia PRODUCTION", () => {
    for (const env of ENVIRONMENT_FORBIDDEN) {
      expect(() => assertEnvironmentSafe(env)).toThrow(ForbiddenEnvironmentError);
    }
    expect(() => assertEnvironmentSafe("NOT_CONFIGURED")).not.toThrow();
    expect(() => assertEnvironmentSafe("HOMOLOGATION")).not.toThrow();
  });
  test("INSERT força provider=NONE e origin=MANUAL_RECORD", () => {
    const payload = buildInsertPayload(BASE_VALUES, UUID_B) as Record<string, unknown>;
    expect(payload.provider).toBe(PROVIDER_MANUAL);
    expect(payload.document_origin).toBe(DOCUMENT_ORIGIN_MANUAL);
    expect(payload.environment).toBe("NOT_CONFIGURED");
    expect(payload.created_by).toBe(UUID_B);
  });
  test("INSERT rejeita environment=PRODUCTION mesmo se schema deixar", () => {
    expect(() =>
      buildInsertPayload(
        { ...BASE_VALUES, environment: "PRODUCTION" as InvoiceFormValues["environment"] },
        UUID_B,
      ),
    ).toThrow(ForbiddenEnvironmentError);
  });
});

// (6) — whitelist estrita
describe("Fase 3.5 (6) — whitelist de payload", () => {
  test("INSERT jamais grava colunas de integração", () => {
    const payload = buildInsertPayload(BASE_VALUES, UUID_B) as Record<string, unknown>;
    for (const col of Object.keys(payload)) {
      expect(
        (INSERT_ALLOWED_COLUMNS as readonly string[]).includes(col),
        `Coluna ${col} fora da whitelist INSERT`,
      ).toBe(true);
    }
  });
  test("UPDATE é diff-only e nunca inclui campos imutáveis", () => {
    const row = makeRow({ invoice_number: "0001", series: "1" });
    const values: InvoiceFormValues = { ...rowToFormValues(row), invoice_number: "0002" };
    const patch = buildUpdatePayload(values, row) as Record<string, unknown>;
    expect(patch.invoice_number).toBe("0002");
    for (const col of Object.keys(patch)) {
      expect(
        (UPDATE_ALLOWED_COLUMNS as readonly string[]).includes(col),
        `Coluna ${col} fora da whitelist UPDATE`,
      ).toBe(true);
    }
    // Sem mudanças → patch vazio
    const empty = buildUpdatePayload(rowToFormValues(row), row) as Record<string, unknown>;
    expect(Object.keys(empty).length).toBe(0);
  });
  test("UPDATE não inclui created_by/document_origin/provider", () => {
    expect((UPDATE_ALLOWED_COLUMNS as readonly string[]).includes("created_by")).toBe(false);
    expect((UPDATE_ALLOWED_COLUMNS as readonly string[]).includes("document_origin")).toBe(false);
    expect((UPDATE_ALLOWED_COLUMNS as readonly string[]).includes("provider")).toBe(false);
  });
});

// (7) — bloqueio de status que simulam emissão
describe("Fase 3.5 (7) — status normalizados proibidos", () => {
  test.each(NORMALIZED_STATUS_FORBIDDEN_UI)("bloqueia %s", (s) => {
    expect(() => assertNormalizedStatusManual(s)).toThrow(
      ForbiddenNormalizedStatusError,
    );
    // Zod também rejeita
    const parsed = invoiceFormSchema.safeParse({
      ...BASE_VALUES,
      normalized_status: s as unknown as InvoiceFormValues["normalized_status"],
    });
    expect(parsed.success).toBe(false);
  });
  test("aceita DRAFT e LEGACY_RECORDED", () => {
    expect(() => assertNormalizedStatusManual("DRAFT")).not.toThrow();
    expect(() => assertNormalizedStatusManual("LEGACY_RECORDED")).not.toThrow();
  });
});

// (8) — sem DELETE físico
describe("Fase 3.5 (8) — sem DELETE físico", () => {
  const files = [
    "src/pages/fiscal/FiscalDocumentos.tsx",
    "src/hooks/useFiscalDocuments.ts",
    "src/lib/fiscal/documentWorkflowValidation.ts",
  ];
  test.each(files)("arquivo %s não chama .delete()", (f) => {
    const src = readFileSync(resolve(f), "utf8");
    expect(src).not.toMatch(/\.delete\s*\(/);
    expect(src).not.toMatch(/DELETE FROM/i);
  });
});

// (9) — evento manual apenas via RPC + whitelist
describe("Fase 3.5 (9) — evento manual apenas via RPC", () => {
  test("assertManualEventType aceita só tipos permitidos", () => {
    for (const t of MANUAL_EVENT_TYPES) {
      expect(() => assertManualEventType(t)).not.toThrow();
    }
    expect(() => assertManualEventType("AUTHORIZED")).toThrow(
      InvalidManualEventTypeError,
    );
    expect(() => assertManualEventType("CANCELED")).toThrow(
      InvalidManualEventTypeError,
    );
  });
  test("hook usa rpc_fiscal_event_manual, sem INSERT em fiscal_events", () => {
    const src = readFileSync(resolve("src/hooks/useFiscalDocuments.ts"), "utf8");
    expect(src).toMatch(/rpc\(\s*"rpc_fiscal_event_manual"/);
    expect(src).not.toMatch(/from\(\s*"fiscal_events"\s*\)\.insert/);
  });
  test("ManualEventRpcDisabledError é a barreira default", () => {
    const err = new ManualEventRpcDisabledError();
    expect(err.name).toBe("ManualEventRpcDisabledError");
  });
});

// (10) — concorrência otimista
describe("Fase 3.5 (10) — concorrência otimista", () => {
  test("hook usa updated_at + is(locked_at, null) e OptimisticFiscalConflictError", () => {
    const src = readFileSync(resolve("src/hooks/useFiscalDocuments.ts"), "utf8");
    expect(src).toMatch(/\.eq\("updated_at",\s*prev\.updated_at\)/);
    expect(src).toMatch(/\.is\("locked_at",\s*null\)/);
    expect(src).toMatch(/OptimisticFiscalConflictError/);
  });
  test("registro travado é readonly", () => {
    const row = makeRow({ locked_at: "2026-07-21T01:00:00Z" });
    expect(isEditableManualDocument(row)).toBe(false);
  });
  test("registro não-manual é readonly", () => {
    expect(
      isEditableManualDocument(makeRow({ document_origin: "PROVIDER_INTEGRATED" })),
    ).toBe(false);
    expect(isEditableManualDocument(makeRow({ provider: "FOCUS" }))).toBe(false);
    expect(
      isEditableManualDocument(makeRow({ normalized_status: "AUTHORIZED" })),
    ).toBe(false);
  });
  test("InvoiceLockedError explícito", () => {
    const e = new InvoiceLockedError();
    expect(e.name).toBe("InvoiceLockedError");
  });
  test("OptimisticFiscalConflictError explícito", () => {
    const e = new OptimisticFiscalConflictError();
    expect(e.name).toBe("OptimisticFiscalConflictError");
  });
});

// (11) — idempotência: sem upsert, sem gerar idempotency_key
describe("Fase 3.5 (11) — sem upsert e sem chaves de integração", () => {
  const files = [
    "src/pages/fiscal/FiscalDocumentos.tsx",
    "src/hooks/useFiscalDocuments.ts",
    "src/lib/fiscal/documentWorkflowValidation.ts",
  ];
  test.each(files)("%s não usa upsert", (f) => {
    const src = readFileSync(resolve(f), "utf8");
    expect(src).not.toMatch(/\.upsert\s*\(/);
  });
  test("nenhuma escrita gera idempotency_key/access_key/provider_reference", () => {
    const payload = buildInsertPayload(BASE_VALUES, UUID_B) as Record<string, unknown>;
    expect(payload.idempotency_key).toBeUndefined();
    expect(payload.access_key).toBeUndefined();
    expect(payload.provider_reference).toBeUndefined();
  });
});

// (12) — mascaramento
describe("Fase 3.5 (12) — mascaramento de snapshots e segredos", () => {
  test("maskSnapshot nunca expõe payload cru", () => {
    expect(maskSnapshot({ secret: "abc" })).toBe("[snapshot mascarado]");
    expect(maskSnapshot("payload gigante")).toBe("[snapshot mascarado]");
    expect(maskSnapshot(null)).toBe("—");
  });
  test("maskSensitiveText retém apenas 4 chars finais", () => {
    expect(maskSensitiveText("ABCDEFGH")).toBe("****EFGH");
    expect(maskSensitiveText(null)).toBe("—");
    expect(maskSensitiveText("abc")).toBe("***");
  });
});

// (13) — gestor somente leitura
describe("Fase 3.5 (13) — gestor somente leitura", () => {
  test("acesso 'r' para gestor", () => {
    expect(getAccessLevel("gestor", ROUTE)).toBe("r");
  });
});

// (14) — regressões de fases anteriores
describe("Fase 3.5 (14) — preservação das fases 3.1 → 3.4", () => {
  test.each([
    ["/configuracoes/fiscal/empresa", "administrador", "rw"],
    ["/configuracoes/fiscal/empresa", "financeiro", "r"],
    ["/configuracoes/fiscal/empresa", "gestor", "r"],
    ["/configuracoes/fiscal/produtos", "administrador", "rw"],
    ["/configuracoes/fiscal/produtos", "gestor", "r"],
    ["/configuracoes/fiscal/servicos", "administrador", "rw"],
    ["/configuracoes/fiscal/servicos", "gestor", "r"],
    ["/configuracoes/fiscal/clientes", "administrador", "rw"],
    ["/configuracoes/fiscal/clientes", "financeiro", "rw"],
    ["/configuracoes/fiscal/clientes", "gestor", "r"],
  ] as const)("rota %s / perfil %s = %s", (route, role, level) => {
    expect(getAccessLevel(role, route)).toBe(level);
  });
  test("flags de UI de fases anteriores permanecem default false (exceto fiscalConfigurationUi na 3.15)", () => {
    expect(FEATURE_FLAGS.fiscalConfigurationUi).toBe(true); // Fase 3.15
    expect(FEATURE_FLAGS.fiscalProductProfilesUi).toBe(false);
    expect(FEATURE_FLAGS.fiscalServiceProfilesUi).toBe(false);
    expect(FEATURE_FLAGS.fiscalCustomerProfilesUi).toBe(false);
  });
});

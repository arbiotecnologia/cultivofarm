/**
 * Fase Fiscal 3.7 — Testes estáticos da Central de Prontidão.
 *
 * Cobrem:
 *  (1) flag default false + emissão false;
 *  (2) matriz de perfis (admin R, gestor R, financeiro R, demais none);
 *  (3) ausência no menu enquanto a flag estiver false;
 *  (4) somente leitura: sem insert/update/delete/upsert/RPC/functions.invoke;
 *  (5) gates externos nunca aprovados sem evidência;
 *  (6) "Não verificado" para ausência ou erro;
 *  (7) falha parcial isolada (uma query falha não anula o restante);
 *  (8) queries limitadas — count HEAD-only para contagens; limit(1) na empresa;
 *  (9) privacidade: sem CNPJ/CPF/chave completa exibidos;
 * (10) preservação das fases 3.1–3.6 e do restante do sistema.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import { getAccessLevel } from "@/lib/permissions";
import {
  BLOCK_STATUS_VALUES,
  BLOCK_STATUS_LABEL,
  EXTERNAL_GATES,
  EXTERNAL_GATE_KEYS,
  DOCUMENT_MODELS,
  classifyCompany,
  classifyAggregate,
  classifyReconciliation,
  labelForStatus,
  percent,
  prioritizeBlockers,
  type CompanyRow,
} from "@/lib/fiscal/readinessValidation";

const HOOK_PATH = resolve(__dirname, "../../hooks/useFiscalReadiness.ts");
const PAGE_PATH = resolve(__dirname, "../../pages/fiscal/FiscalProntidao.tsx");
const VALIDATION_PATH = resolve(__dirname, "../../lib/fiscal/readinessValidation.ts");
const APP_PATH = resolve(__dirname, "../../App.tsx");
const NAV_PATH = resolve(__dirname, "../../config/navigation.ts");
const PERM_PATH = resolve(__dirname, "../../lib/permissions.ts");

const hookSrc = readFileSync(HOOK_PATH, "utf8");
const pageSrc = readFileSync(PAGE_PATH, "utf8");
const validationSrc = readFileSync(VALIDATION_PATH, "utf8");
const appSrc = readFileSync(APP_PATH, "utf8");
const navSrc = readFileSync(NAV_PATH, "utf8");
const permSrc = readFileSync(PERM_PATH, "utf8");
const phaseSources = [hookSrc, pageSrc, validationSrc];

describe("Fase 3.7 · (1) Flags e emissão", () => {
  test("fiscalReadinessCenterUi habilitada na Fase 3.16", () => {
    expect(FEATURE_FLAGS.fiscalReadinessCenterUi).toBe(true);
  });
  test("fiscalEmissionEnabled permanece false", () => {
    expect(FEATURE_FLAGS.fiscalEmissionEnabled).toBe(false);
  });
  test("nenhuma flag de escrita fiscal foi habilitada", () => {
    expect(FEATURE_FLAGS.fiscalReconciliationWrite).toBe(false);
    expect(FEATURE_FLAGS.fiscalDocumentManualEventRpc).toBe(false);
    expect(FEATURE_FLAGS.fiscalReconciliationUi).toBe(false);
  });
});

describe("Fase 3.7 · (2) Matriz de perfis", () => {
  const ROUTE = "/fiscal/prontidao";
  test("administrador tem R", () => {
    expect(getAccessLevel("administrador", ROUTE)).toBe("r");
  });
  test("gestor tem R", () => {
    expect(getAccessLevel("gestor", ROUTE)).toBe("r");
  });
  test("financeiro tem R", () => {
    expect(getAccessLevel("financeiro", ROUTE)).toBe("r");
  });
  test.each([
    "consultor_tecnico", "aplicador", "operador_onfarm", "cliente_produtor",
    "administrativo", "tecnico_agronomo", "producao", "gestor_comercial",
    "parceiro_b2b", "parceiro_b2b_tecnico",
  ] as const)("%s não tem acesso", (r) => {
    expect(getAccessLevel(r, ROUTE)).toBe("none");
  });
  test("usuário anônimo (null) não tem acesso", () => {
    expect(getAccessLevel(null, ROUTE)).toBe("none");
  });
  test("nenhum perfil recebe rw nesta rota", () => {
    // Extrai bloco textual e assegura ausência de "rw".
    const m = permSrc.match(/"\/fiscal\/prontidao":\s*\{[^}]*\}/);
    expect(m, "bloco da rota deve existir").toBeTruthy();
    expect(m![0]).not.toMatch(/"rw"/);
  });
});

describe("Fase 3.7 · (3) Presença no menu (Fase 3.16)", () => {
  test("navigation.ts referencia /fiscal/prontidao sob featureFlag", () => {
    expect(navSrc.includes("/fiscal/prontidao")).toBe(true);
    expect(navSrc).toMatch(/featureFlag:\s*"fiscalReadinessCenterUi"/);
  });
  test("flag de UI está habilitada", () => {
    expect(FEATURE_FLAGS.fiscalReadinessCenterUi).toBe(true);
  });
});

describe("Fase 3.7 · (4) Somente leitura", () => {
  test("nenhum .insert()/.update()/.delete()/.upsert() no código da fase", () => {
    for (const src of phaseSources) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });
  test("nenhum supabase.rpc(...) e nenhum functions.invoke(...)", () => {
    for (const src of phaseSources) {
      expect(src).not.toMatch(/supabase\.rpc\(/);
      expect(src).not.toMatch(/functions\s*\.\s*invoke\(/);
    }
  });
  test("nenhum useMutation na fase", () => {
    for (const src of phaseSources) {
      expect(src).not.toMatch(/useMutation\b/);
    }
  });
});

describe("Fase 3.7 · (5) Gates externos permanecem pendentes", () => {
  test("todos os gates canônicos declarados", () => {
    const keys = EXTERNAL_GATES.map((g) => g.key).sort();
    expect(keys).toEqual([...EXTERNAL_GATE_KEYS].sort());
  });
  test("nenhuma classificação 'pronto' hardcoded para gates externos", () => {
    // A página deve renderizar `Pendente` para gates, sem exceções.
    expect(pageSrc).toMatch(/Pendente/);
    expect(pageSrc).not.toMatch(/gates?.*(aprovad|approved|pronto)/i);
  });
  test("nenhum teste estático marca gate como aprovado", () => {
    for (const src of phaseSources) {
      expect(src).not.toMatch(/gate.*=\s*("pronto"|"approved"|true)/);
    }
  });
});

describe("Fase 3.7 · (6) Não verificado para ausência/erro", () => {
  test("classifyCompany(null) = nao_verificado", () => {
    expect(classifyCompany(null)).toBe("nao_verificado");
  });
  test("classifyCompany com todos nulos = nao_verificado", () => {
    const row: CompanyRow = {
      id: null, configuration_status: null, fiscal_environment: null,
      fiscal_provider: null, nfe_enabled: null, nfse_enabled: null,
      production_enabled: null, accounting_validated: null,
      filled_score: null, max_score: null,
    };
    expect(classifyCompany(row)).toBe("nao_verificado");
  });
  test("production_enabled=true força bloqueado", () => {
    const row: CompanyRow = {
      id: "x", configuration_status: "ready", fiscal_environment: "homologacao",
      fiscal_provider: null, nfe_enabled: true, nfse_enabled: false,
      production_enabled: true, accounting_validated: true,
      filled_score: 10, max_score: 10,
    };
    expect(classifyCompany(row)).toBe("bloqueado");
  });
  test("configuração ready + ambiente seguro + contabilidade validada = pronto", () => {
    const row: CompanyRow = {
      id: "x", configuration_status: "ready", fiscal_environment: "homologacao",
      fiscal_provider: null, nfe_enabled: true, nfse_enabled: false,
      production_enabled: false, accounting_validated: true,
      filled_score: 10, max_score: 10,
    };
    expect(classifyCompany(row)).toBe("pronto");
  });
  test("ambiente inseguro => atenção", () => {
    const row: CompanyRow = {
      id: "x", configuration_status: "ready", fiscal_environment: "producao",
      fiscal_provider: null, nfe_enabled: true, nfse_enabled: false,
      production_enabled: false, accounting_validated: true,
      filled_score: 10, max_score: 10,
    };
    expect(classifyCompany(row)).toBe("atencao");
  });
  test("classifyAggregate com total null = nao_verificado", () => {
    expect(classifyAggregate({ total: null, ok: null, pending: null })).toBe("nao_verificado");
  });
  test("classifyAggregate com pendentes = atencao", () => {
    expect(classifyAggregate({ total: 10, ok: 6, pending: 4 })).toBe("atencao");
  });
  test("classifyAggregate ok=total = pronto", () => {
    expect(classifyAggregate({ total: 5, ok: 5, pending: 0 })).toBe("pronto");
  });
  test("classifyReconciliation(null) = nao_verificado", () => {
    expect(classifyReconciliation(null)).toBe("nao_verificado");
  });
  test("labelForStatus para null retorna 'Não verificado'", () => {
    expect(labelForStatus(null)).toBe(BLOCK_STATUS_LABEL.nao_verificado);
    expect(labelForStatus(undefined)).toBe(BLOCK_STATUS_LABEL.nao_verificado);
    expect(labelForStatus("")).toBe(BLOCK_STATUS_LABEL.nao_verificado);
  });
  test("percent seguro", () => {
    expect(percent(null, 10)).toBeNull();
    expect(percent(0, 0)).toBeNull();
    expect(percent(5, 10)).toBe(50);
  });
});

describe("Fase 3.7 · (7) Falha parcial isolada", () => {
  test("página não usa useFiscalReadiness().* como Promise.all no render", () => {
    // useQueries/useQuery independentes garantem estados isolados.
    expect(hookSrc).toMatch(/useQuery\(/);
    // Não deve haver await de Promise.all no render/página.
    expect(pageSrc).not.toMatch(/await\s+Promise\.all/);
  });
  test("cada bloco possui suporte a loading/error/empty independente", () => {
    expect(pageSrc).toMatch(/BlockShell/);
    // Estados presentes na página: loading, error, empty.
    expect(pageSrc).toMatch(/isLoading/);
    expect(pageSrc).toMatch(/\.error/);
  });
});

describe("Fase 3.7 · (8) Queries limitadas", () => {
  test("empresa usa limit(1) + colunas explícitas", () => {
    expect(hookSrc).toMatch(/\.limit\(1\)/);
    expect(hookSrc).toMatch(/configuration_status.*fiscal_environment/s);
  });
  test("agregados usam count: 'exact', head: true", () => {
    const matches = hookSrc.match(/count:\s*["']exact["']\s*,\s*head:\s*true/g);
    expect(matches, "esperado ao menos 3 contagens HEAD-only").toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });
  test("nenhum select('*') sem HEAD (retornando payload)", () => {
    // .select("*", { head: true }) é aceito; .select("*") sozinho não.
    const bareSelectAll = hookSrc.match(/\.select\(\s*["']\*["']\s*\)/g);
    expect(bareSelectAll).toBeNull();
    expect(pageSrc).not.toMatch(/\.select\(\s*["']\*/);
  });
  test("hook consulta apenas as 5 views canônicas", () => {
    const allowed = [
      "v_fiscal_company_readiness",
      "v_product_fiscal_readiness",
      "v_service_fiscal_readiness",
      "v_customer_fiscal_readiness",
      "v_fiscal_document_reconciliation_pending",
    ];
    const fromMatches = [...hookSrc.matchAll(/\.from\(\s*["']([^"']+)["']\s*\)/g)]
      .map((m) => m[1]);
    for (const src of fromMatches) {
      expect(allowed).toContain(src);
    }
  });
});

describe("Fase 3.7 · (9) Privacidade", () => {
  test("nenhuma renderização crua de CNPJ/CPF/access_key/payload", () => {
    for (const src of phaseSources) {
      expect(src).not.toMatch(/document_?number|company_cnpj|customer_cpf|access_key|xml_document/i);
    }
  });
  test("gates não expõem detalhes de secrets/certificados no clear", () => {
    for (const g of EXTERNAL_GATES) {
      expect(g.detail).not.toMatch(/\b[A-Z0-9]{20,}\b/); // sem tokens/valores parecidos com credencial
    }
  });
});

describe("Fase 3.7 · (10) Sem provedor/certificado/token/webhook/emissão", () => {
  const banned = [
    "focusnfe", "webmania", "nfe.io",
    "SERVICE_ROLE", "service_role", "process.env.",
  ];
  test.each(banned)("token %s ausente do hook e da página", (t) => {
    expect(hookSrc.toLowerCase()).not.toContain(t.toLowerCase());
    expect(pageSrc.toLowerCase()).not.toContain(t.toLowerCase());
  });
  // H7f — a página passou a exibir o painel SOMENTE-LEITURA de transporte
  // SEFAZ. A referência permitida é exclusivamente o componente; nenhuma ação
  // de emissão/transmissão pode existir aqui.
  test("hook permanece sem qualquer referência a SEFAZ", () => {
    expect(hookSrc.toLowerCase()).not.toContain("sefaz");
  });
  test("página só referencia SEFAZ pelo painel de leitura", () => {
    const refs = pageSrc.match(/[^\n]*sefaz[^\n]*/gi) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    for (const line of refs) expect(line).toContain("TransporteSefazSecao");
    expect(pageSrc).not.toMatch(/transmit_|functions\.invoke|rpc_fiscal_sefaz_transmit/i);
  });
  test("hook não chama endpoints de emissão/integração", () => {
    expect(hookSrc).not.toMatch(/certificad|webhook|functions\.invoke/i);
    expect(hookSrc).not.toMatch(/rpc_fiscal_event_manual|emit_|transmit_|cancel_|inutiliza/i);
  });
});

describe("Fase 3.7 · Preservação das fases anteriores e do sistema", () => {
  test.each([
    "src/pages/configuracoes/FiscalEmpresa.tsx",
    "src/pages/configuracoes/FiscalProdutos.tsx",
    "src/pages/configuracoes/FiscalServicos.tsx",
    "src/pages/configuracoes/FiscalClientes.tsx",
    "src/pages/fiscal/FiscalDocumentos.tsx",
    "src/pages/fiscal/FiscalReconciliacao.tsx",
  ])("arquivo %s continua existindo", (rel) => {
    expect(existsSync(resolve(__dirname, "../../../", rel))).toBe(true);
  });
  test("rotas fiscais anteriores continuam registradas", () => {
    expect(appSrc).toMatch(/\/fiscal\/documentos/);
    expect(appSrc).toMatch(/\/fiscal\/reconciliacao/);
    expect(appSrc).toMatch(/\/configuracoes\/fiscal\/empresa/);
    expect(appSrc).toMatch(/\/configuracoes\/fiscal\/produtos/);
    expect(appSrc).toMatch(/\/configuracoes\/fiscal\/servicos/);
    expect(appSrc).toMatch(/\/configuracoes\/fiscal\/clientes/);
  });
  test("rota /fiscal/prontidao registrada sob RoleGuard", () => {
    expect(appSrc).toMatch(/\/fiscal\/prontidao/);
    expect(appSrc).toMatch(/<Route path="\/fiscal\/prontidao"[^>]*<RoleGuard>/);
  });
  test("status canônicos preservados", () => {
    expect([...BLOCK_STATUS_VALUES].sort()).toEqual(
      ["atencao", "bloqueado", "nao_verificado", "pronto"],
    );
    expect(DOCUMENT_MODELS.length).toBe(3);
  });
  test("prioritização não inventa itens", () => {
    const sorted = prioritizeBlockers([
      { block: "produtos", severity: "atencao", message: "a" },
      { block: "empresa", severity: "bloqueado", message: "b" },
      { block: "clientes", severity: "nao_verificado", message: "c" },
    ]);
    expect(sorted.map((i) => i.severity)).toEqual([
      "bloqueado", "atencao", "nao_verificado",
    ]);
    expect(sorted.length).toBe(3);
  });
});

/**
 * Fase Fiscal 3.17 / 3.17.1 — Testes estáticos.
 *
 * Cobrem: migration canônica read-only, ausência de emissão na tela nova,
 * gate por papel, contrato de tipos estreito, guards das fixtures e as
 * incompatibilidades de schema corrigidas na auditoria 3.17.1.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseReadinessResult,
  READINESS_ITEM_STATUS,
  READINESS_OVERALL_STATUS,
  STATUS_LABEL_PTBR,
  OVERALL_STATUS_LABEL_PTBR,
} from "@/lib/fiscal/homologationReadiness";

const ROOT = resolve(__dirname, "../../..");
const p = (...a: string[]) => resolve(ROOT, ...a);

const MIG      = p("supabase/migrations/20260725000000_fiscal_fase3_17_homologation_readiness.sql");
const STUB     = p("restoration/migrations/20260725000000_fiscal_fase3_17_homologation_readiness.sql");
const SECAO    = p("src/components/fiscal/homologacao/HomologacaoSecao.tsx");
const TYPES    = p("src/lib/fiscal/homologationReadiness.ts");
const HOOK     = p("src/hooks/useFiscalHomologationReadiness.ts");
const EMPRESA  = p("src/pages/configuracoes/FiscalEmpresa.tsx");
const FX_DIR   = p("restoration/fiscal-homologation-fixtures");
const FX_PRE   = p("restoration/fiscal-homologation-fixtures/01-preflight.sql");
const FX_SEED  = p("restoration/fiscal-homologation-fixtures/02-seed.sql");
const FX_VER   = p("restoration/fiscal-homologation-fixtures/03-verify.sql");
const FX_CLEAN = p("restoration/fiscal-homologation-fixtures/04-cleanup.sql");
const FX_README= p("restoration/fiscal-homologation-fixtures/README.md");

const migSql   = () => readFileSync(MIG, "utf8");
const stubSql  = () => readFileSync(STUB, "utf8");
const secaoTsx = () => readFileSync(SECAO, "utf8");
const typesTs  = () => readFileSync(TYPES, "utf8");
const hookTs   = () => readFileSync(HOOK, "utf8");
const empresaTsx = () => readFileSync(EMPRESA, "utf8");
const stripSql = (s: string) => s.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("Fase 3.17 — arquivos presentes", () => {
  test("migration canônica em supabase/migrations", () => {
    expect(existsSync(MIG)).toBe(true);
    expect(statSync(MIG).size).toBeGreaterThan(1000);
  });
  test("stub documental sem SQL executável", () => {
    expect(existsSync(STUB)).toBe(true);
    const s = stubSql();
    expect(/^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE)\s/im.test(s)).toBe(false);
  });
});

describe("Fase 3.17 — migration segura e read-only", () => {
  test("RPC declarada com search_path fixo", () => {
    const s = migSql();
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.rpc_fiscal_homologation_readiness\s*\(\s*\)/);
    expect(s).toMatch(/SECURITY DEFINER/);
    expect(s).toMatch(/SET search_path = public, pg_temp/);
    expect(s).toMatch(/\bSTABLE\b/);
  });
  test("gate por has_role para papéis autorizados", () => {
    const s = migSql();
    expect(s).toMatch(/has_role\(v_uid,\s*'administrador'/);
    expect(s).toMatch(/has_role\(v_uid,\s*'gestor'/);
    expect(s).toMatch(/has_role\(v_uid,\s*'financeiro'/);
    expect(s).toMatch(/FISCAL_FORBIDDEN/);
  });
  test("REVOKE de PUBLIC/anon e GRANT restrito a authenticated", () => {
    const s = migSql();
    expect(s).toMatch(/REVOKE ALL ON FUNCTION public\.rpc_fiscal_homologation_readiness\(\) FROM PUBLIC/);
    expect(s).toMatch(/REVOKE ALL ON FUNCTION public\.rpc_fiscal_homologation_readiness\(\) FROM anon/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.rpc_fiscal_homologation_readiness\(\) TO authenticated/);
  });
  test("sem escrita, HTTP ou material sensível projetado", () => {
    const s = stripSql(migSql());
    expect(/\bhttp[_.]/i.test(s)).toBe(false);
    expect(/\bpg_net\b/i.test(s)).toBe(false);
    expect(/\bINSERT\s+INTO\b/i.test(s)).toBe(false);
    expect(/\bUPDATE\s+public\./i.test(s)).toBe(false);
    expect(/\bDELETE\s+FROM\b/i.test(s)).toBe(false);
    expect(/\bALTER\s+TABLE\b/i.test(s)).toBe(false);
    expect(/fingerprint_sha256\s*(,|\))/i.test(s)).toBe(false);
    expect(/object_path/i.test(s)).toBe(false);
  });
});

describe("Fase 3.17.1 — nomes canônicos de schema", () => {
  test("migration usa municipality_ibge_code (nunca municipality_code)", () => {
    const s = stripSql(migSql());
    expect(s).toMatch(/municipality_ibge_code/);
    expect(/\bmunicipality_code\b/.test(s)).toBe(false);
  });
  test("migration usa document_origin em fiscal_invoices (nunca `origin`)", () => {
    const s = stripSql(migSql());
    expect(s).toMatch(/document_origin\s*=\s*'MANUAL_RECORD'/);
    // Sem `origin` como coluna de fiscal_invoices.
    expect(/\borigin\s*=\s*'MANUAL_RECORD'/.test(s)).toBe(false);
    expect(/\bfiscal_invoices\s+WHERE[^;]*\borigin\b/i.test(s)).toBe(false);
  });
  test("EXCEPTION handlers marcam flag de disponibilidade", () => {
    const s = stripSql(migSql());
    // Cada bloco EXCEPTION deve sinalizar UNAVAILABLE por flag `_available := false`.
    expect(s).toMatch(/v_products_available\s*:=\s*false/);
    expect(s).toMatch(/v_services_available\s*:=\s*false/);
    expect(s).toMatch(/v_customers_available\s*:=\s*false/);
    expect(s).toMatch(/v_drafts_available\s*:=\s*false/);
  });
  test("checklist projeta UNAVAILABLE quando flag negativa", () => {
    const s = stripSql(migSql());
    expect(s).toMatch(/NOT v_products_available[^,]+UNAVAILABLE/);
    expect(s).toMatch(/NOT v_services_available[^,]+UNAVAILABLE/);
    expect(s).toMatch(/NOT v_customers_available[^,]+UNAVAILABLE/);
    // Status geral: UNAVAILABLE trava READY.
    expect(s).toMatch(/v_has_unavailable/);
    expect(s).toMatch(/ELSIF v_has_unavailable/);
  });
});

describe("Fase 3.17 — UI Homologação", () => {
  test("componente existe e tem título pt-BR", () => {
    const s = secaoTsx();
    expect(s).toMatch(/Homologação fiscal|Estado da homologação/);
  });
  test("não expõe botões proibidos de emissão/transmissão", () => {
    const s = secaoTsx();
    expect(/>\s*Emitir\s*</i.test(s)).toBe(false);
    expect(/>\s*Transmitir\s*</i.test(s)).toBe(false);
    expect(/>\s*Autorizar\s*</i.test(s)).toBe(false);
    expect(/>\s*Habilitar produção\s*</i.test(s)).toBe(false);
  });
  test("aba restrita a administrador, gestor e financeiro", () => {
    const s = secaoTsx();
    expect(s).toMatch(/administrador/);
    expect(s).toMatch(/gestor/);
    expect(s).toMatch(/financeiro/);
    expect(s).toMatch(/ALLOWED_ROLES/);
  });
  test("estados pt-BR renderizados via mapa canônico", () => {
    const s = secaoTsx();
    expect(s).toMatch(/STATUS_LABEL_PTBR/);
    expect(s).toMatch(/OVERALL_STATUS_LABEL_PTBR/);
  });
  test("deep-link ?aba=certificado é aceito pela FiscalEmpresa", () => {
    const s = empresaTsx();
    expect(s).toMatch(/useSearchParams/);
    expect(s).toMatch(/searchParams\.get\(["']aba["']\)/);
    // O componente Certificado é montado dentro de uma TabsContent 'certificado'.
    expect(s).toMatch(/TabsContent value="certificado"/);
  });
});

describe("Fase 3.17 — tipos estreitos sem any", () => {
  test("nenhum `any` ou cast global no módulo de tipos", () => {
    const s = typesTs();
    expect(/\bany\b/.test(s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""))).toBe(false);
  });
  test("statuses canônicos completos", () => {
    for (const st of READINESS_ITEM_STATUS) {
      expect(STATUS_LABEL_PTBR[st]).toMatch(/[A-Za-zÁ-ÿ]/);
    }
    expect(READINESS_OVERALL_STATUS).toContain("READY");
    expect(READINESS_OVERALL_STATUS).toContain("BLOCKED");
    expect(READINESS_OVERALL_STATUS).toContain("UNAVAILABLE");
    expect(OVERALL_STATUS_LABEL_PTBR.UNAVAILABLE).toMatch(/Indisponível/);
  });
  test("parseReadinessResult é defensivo com payload arbitrário", () => {
    const out = parseReadinessResult({ status: "READY", checklist: [{ key: "k", label: "l", status: "READY" }] });
    expect(out.status).toBe("READY");
    expect(out.checklist).toHaveLength(1);
    const empty = parseReadinessResult(null);
    expect(empty.status).toBe("UNAVAILABLE");
    expect(empty.checklist).toEqual([]);
  });
  test("parseReadinessResult aceita status UNAVAILABLE agregado", () => {
    const out = parseReadinessResult({
      status: "UNAVAILABLE",
      checklist: [{ key: "k", label: "l", status: "UNAVAILABLE" }],
    });
    expect(out.status).toBe("UNAVAILABLE");
    expect(out.checklist[0].status).toBe("UNAVAILABLE");
  });
  test("hook não usa `any` cru e trata RPC ausente", () => {
    const s = hookTs();
    expect(/:\s*any\b/.test(s)).toBe(false);
    expect(s).toMatch(/PGRST202|does not exist/);
  });
});

describe("Fase 3.17.1 — fixtures de staging seguras", () => {
  test("pacote completo presente", () => {
    for (const f of [FX_DIR, FX_PRE, FX_SEED, FX_VER, FX_CLEAN, FX_README]) {
      expect(existsSync(f), `ausente: ${f}`).toBe(true);
    }
  });
  test("preflight exige marker STAGING, GUC de sessão e migrations canônicas", () => {
    const s = readFileSync(FX_PRE, "utf8");
    expect(s).toMatch(/_fiscal_staging_marker/);
    expect(s).toMatch(/'STAGING'/);
    expect(s).toMatch(/app\.fiscal_test_project_ref/);
    expect(s).toMatch(/20260724000000/);
    expect(s).toMatch(/20260725000000/);
    expect(s).toMatch(/production_enabled\s*=\s*true/);
    expect(s).toMatch(/FISCAL_HML_ABORT/);
    // Preflight NÃO cria o marker.
    expect(/INSERT\s+INTO\s+public\._fiscal_staging_marker/i.test(s)).toBe(false);
  });
  test("seed usa colunas canônicas e proíbe as inexistentes", () => {
    const raw = readFileSync(FX_SEED, "utf8");
    const s = stripSql(raw);
    // Prefixo aplicado.
    expect(raw).toMatch(/FISCAL_HML_/);
    // Colunas obrigatórias reais nos INSERT de fiscal_invoices.
    expect(s).toMatch(/document_origin/);
    expect(s).toMatch(/created_by/);
    expect(s).toMatch(/invoice_type/);
    // Cliente com codigo_cliente obrigatório.
    expect(s).toMatch(/codigo_cliente/);
    // Itens usando a coluna real.
    expect(s).toMatch(/fiscal_invoice_id/);
    expect(s).toMatch(/item_kind/);
    // Nenhum status proibido.
    expect(/'(AUTHORIZED|ISSUED|TRANSMITTED)'/i.test(s)).toBe(false);
    // Nenhum certificado real.
    expect(/\bfiscal_certificates\b|\bfiscal_certificate_material\b/i.test(s)).toBe(false);
    // Nomes proibidos: coluna `origin` de invoice, `invoice_id` do item,
    // `internal_reference` inexistente.
    expect(/\borigin\s*[,)]/i.test(s)).toBe(false);
    expect(/\borigin\s*=\s*'MANUAL_RECORD'/i.test(s)).toBe(false);
    expect(/\binvoice_id\b(?!\w)/i.test(s.replace(/fiscal_invoice_id/g, ""))).toBe(false);
    expect(/internal_reference/i.test(s)).toBe(false);
    // Usuário: não pode ler auth.users como fallback.
    expect(/\bauth\.users\b/i.test(s)).toBe(false);
    // Contexto sintético obrigatório.
    expect(s).toMatch(/_fiscal_hml_context/);
    expect(s).toMatch(/HML_USER/);
    // Preflight reafirmado.
    expect(s).toMatch(/_fiscal_staging_marker/);
    // Insere itens reais em fiscal_invoice_items.
    expect(s).toMatch(/INSERT\s+INTO\s+public\.fiscal_invoice_items/i);
  });
  test("verify prova ausência de produção e status proibidos", () => {
    const s = stripSql(readFileSync(FX_VER, "utf8"));
    expect(s).toMatch(/environment\s*<>\s*'HOMOLOGATION'/);
    expect(s).toMatch(/AUTHORIZED/);
    expect(s).toMatch(/ISSUED/);
    expect(s).toMatch(/document_origin/);
    expect(s).toMatch(/_fiscal_hml_inventory/);
    expect(s).toMatch(/production_enabled/);
    expect(/\borigin\s*<>/i.test(s)).toBe(false);
  });
  test("cleanup é limitado ao inventário e ao prefixo, sem CASCADE amplo", () => {
    const raw = readFileSync(FX_CLEAN, "utf8");
    const s = stripSql(raw);
    expect(raw).toMatch(/FISCAL_HML_/);
    expect(/\bTRUNCATE\b/i.test(s)).toBe(false);
    expect(/\bDROP\s+/i.test(s)).toBe(false);
    expect(/\bCASCADE\b/i.test(s)).toBe(false);
    // Usa a coluna real do schema, nunca a inexistente.
    expect(s).toMatch(/fiscal_invoice_id/);
    expect(/\binvoice_id\b(?!\w)/i.test(s.replace(/fiscal_invoice_id/g, ""))).toBe(false);
    // Cada DELETE referencia o inventário OU o prefixo canônico.
    const deletes = s.match(/DELETE\s+FROM[\s\S]+?;/gi) ?? [];
    expect(deletes.length).toBeGreaterThan(0);
    for (const d of deletes) {
      expect(/_fiscal_hml_inventory|FISCAL_HML_/i.test(d)).toBe(true);
    }
  });
  test("nenhum segredo, URL ou project ref presente", () => {
    for (const f of [FX_PRE, FX_SEED, FX_VER, FX_CLEAN, FX_README]) {
      const s = readFileSync(f, "utf8");
      expect(/https?:\/\/[^\s`]+\.supabase\.co/i.test(s)).toBe(false);
      expect(/eyJ[A-Za-z0-9_\-]{20,}/.test(s)).toBe(false); // JWT
      expect(/service_role|SUPABASE_ANON_KEY|SUPABASE_URL/i.test(s)).toBe(false);
    }
  });
});

describe("Fase 3.17.2 — microcorreções auditadas", () => {
  test("seed não usa coluna inexistente clientes.ativo", () => {
    const s = stripSql(readFileSync(FX_SEED, "utf8"));
    // Não pode aparecer 'ativo' na lista de colunas nem no VALUES.
    const insertCli = s.match(/INSERT\s+INTO\s+public\.clientes[\s\S]+?;/i)?.[0] ?? "";
    expect(insertCli).not.toMatch(/\bativo\b/i);
    // Sanidade: colunas mínimas presentes.
    expect(insertCli).toMatch(/\bnome\b/);
    expect(insertCli).toMatch(/\bcpf_cnpj\b/);
    expect(insertCli).toMatch(/\bcodigo_cliente\b/);
  });
  test("seed valida usuário sintético em auth.users com e-mail canônico", () => {
    const s = readFileSync(FX_SEED, "utf8");
    expect(s).toMatch(/FROM\s+auth\.users/i);
    expect(s).toMatch(/lower\(\s*u\.email\s*\)\s+LIKE\s+'fiscal-hml-%@example\.invalid'/i);
    expect(s).toMatch(/não é sintético/);
  });
  test("cleanup remove HML_USER do contexto após inventário vazio", () => {
    const s = readFileSync(FX_CLEAN, "utf8");
    expect(s).toMatch(/DELETE\s+FROM\s+public\._fiscal_hml_inventory/i);
    expect(s).toMatch(/inventário não esvaziou/i);
    expect(s).toMatch(/DELETE\s+FROM\s+public\._fiscal_hml_context\s+WHERE\s+marker\s*=\s*'HML_USER'/i);
    // Nunca apagar contextos alheios.
    expect(/DELETE\s+FROM\s+public\._fiscal_hml_context\s*;/i.test(s)).toBe(false);
  });
});


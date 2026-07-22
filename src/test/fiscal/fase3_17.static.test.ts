/**
 * Fase Fiscal 3.17 — Testes estáticos.
 *
 * Cobrem: migration canônica read-only, ausência de emissão na tela nova,
 * gate por papel, contrato de tipos estreito, guards das fixtures.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseReadinessResult,
  READINESS_ITEM_STATUS,
  READINESS_OVERALL_STATUS,
  STATUS_LABEL_PTBR,
} from "@/lib/fiscal/homologationReadiness";

const ROOT = resolve(__dirname, "../../..");
const p = (...a: string[]) => resolve(ROOT, ...a);

const MIG      = p("supabase/migrations/20260725000000_fiscal_fase3_17_homologation_readiness.sql");
const STUB     = p("restoration/migrations/20260725000000_fiscal_fase3_17_homologation_readiness.sql");
const SECAO    = p("src/components/fiscal/homologacao/HomologacaoSecao.tsx");
const TYPES    = p("src/lib/fiscal/homologationReadiness.ts");
const HOOK     = p("src/hooks/useFiscalHomologationReadiness.ts");
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
    const s = migSql();
    // Corpo do plpgsql não deve conter statements de escrita nem HTTP.
    // Ignoramos strings de label pt-BR que porventura contenham palavras.
    expect(/\bhttp[_\.]/i.test(s)).toBe(false);
    expect(/\bpg_net\b/i.test(s)).toBe(false);
    expect(/\bINSERT\s+INTO\b/i.test(s)).toBe(false);
    expect(/\bUPDATE\s+public\./i.test(s)).toBe(false);
    expect(/\bDELETE\s+FROM\b/i.test(s)).toBe(false);
    expect(/\bALTER\s+TABLE\b/i.test(s)).toBe(false);
    // Nunca retornar material sensível.
    expect(/fingerprint_sha256\s*(,|\))/i.test(s.replace(/--.*$/gm, ""))).toBe(false);
    expect(/object_path/i.test(s)).toBe(false);
  });
});

describe("Fase 3.17 — UI Homologação", () => {
  test("componente existe e tem título pt-BR", () => {
    const s = secaoTsx();
    expect(s).toMatch(/Homologação fiscal|Estado da homologação/);
  });
  test("não expõe botões proibidos de emissão/transmissão", () => {
    const s = secaoTsx();
    // Não devem existir botões/links de Emitir, Transmitir, Autorizar
    // ou "Produção" como ação. As strings podem aparecer como rótulos
    // informativos (ex.: "Produção: Desabilitada"), então checamos
    // padrões de ação em JSX.
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
  });
  test("parseReadinessResult é defensivo com payload arbitrário", () => {
    const out = parseReadinessResult({ status: "READY", checklist: [{ key: "k", label: "l", status: "READY" }] });
    expect(out.status).toBe("READY");
    expect(out.checklist).toHaveLength(1);
    const empty = parseReadinessResult(null);
    expect(empty.status).toBe("UNAVAILABLE");
    expect(empty.checklist).toEqual([]);
  });
  test("hook não usa `any` cru e trata RPC ausente", () => {
    const s = hookTs();
    expect(/:\s*any\b/.test(s)).toBe(false);
    expect(s).toMatch(/PGRST202|does not exist/);
  });
});

describe("Fase 3.17 — fixtures de staging seguras", () => {
  test("pacote completo presente", () => {
    for (const f of [FX_DIR, FX_PRE, FX_SEED, FX_VER, FX_CLEAN, FX_README]) {
      expect(existsSync(f), `ausente: ${f}`).toBe(true);
    }
  });
  test("preflight exige marker STAGING", () => {
    const s = readFileSync(FX_PRE, "utf8");
    expect(s).toMatch(/_fiscal_staging_marker/);
    expect(s).toMatch(/'STAGING'/);
    expect(s).toMatch(/FISCAL_HML_ABORT/);
    // Preflight NÃO cria o marker.
    expect(/INSERT\s+INTO\s+public\._fiscal_staging_marker/i.test(s)).toBe(false);
  });
  test("seed usa prefixo FISCAL_HML_ e não cria emissão real", () => {
    const s = readFileSync(FX_SEED, "utf8");
    expect(s).toMatch(/FISCAL_HML_/);
    expect(/AUTHORIZED|ISSUED|TRANSMITTED/i.test(s)).toBe(false);
    // Nenhum certificado real.
    expect(/fiscal_certificates|fiscal_certificate_material/i.test(s)).toBe(false);
    // Preflight repetido.
    expect(s).toMatch(/_fiscal_staging_marker/);
  });
  test("verify prova ausência de produção e status proibidos", () => {
    const s = readFileSync(FX_VER, "utf8");
    expect(s).toMatch(/environment <> 'HOMOLOGATION'/);
    expect(s).toMatch(/AUTHORIZED/);
    expect(s).toMatch(/ISSUED/);
  });
  test("cleanup é limitado ao prefixo e não usa CASCADE amplo", () => {
    const s = readFileSync(FX_CLEAN, "utf8");
    expect(s).toMatch(/FISCAL_HML_/);
    expect(/TRUNCATE/i.test(s)).toBe(false);
    expect(/DROP\s+/i.test(s)).toBe(false);
    // DELETEs devem SEMPRE possuir WHERE com prefixo.
    const deletes = s.match(/DELETE\s+FROM[\s\S]+?;/gi) ?? [];
    expect(deletes.length).toBeGreaterThan(0);
    for (const d of deletes) {
      expect(d).toMatch(/FISCAL_HML_/);
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

/**
 * Fase Fiscal 3.19.2 + 3.19.3 — Auditoria estática:
 *  - RPCs canônicas presentes, com assinatura de revisão otimista.
 *  - Ausência de `as any` nos artefatos RTC do frontend.
 *  - Readiness aditiva via v2, sem sobrescrever a canônica.
 *  - Validador server-side de payload cobrindo enums/percentuais/códigos.
 *  - CNPJ alfanumérico preservado.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
const canonical = read("supabase/migrations/20260727000000_fiscal_fase3_19_rtc_2026.sql");

describe("Fase 3.19.3 — Estrutura da migration", () => {
  test("uma única transação BEGIN/COMMIT", () => {
    const begins = (canonical.match(/^BEGIN;\s*$/gm) ?? []).length;
    const commits = (canonical.match(/^COMMIT;\s*$/gm) ?? []).length;
    expect(begins).toBe(1);
    expect(commits).toBe(1);
  });

  test("não referencia homologation_readiness_snapshot", () => {
    // A única ocorrência aceita é dentro de um comentário `--`.
    const lines = canonical.split("\n").filter(
      (ln) => ln.includes("homologation_readiness_snapshot") && !ln.trim().startsWith("--"),
    );
    expect(lines).toEqual([]);
  });

  test("não usa EXCEPTION WHEN OTHERS silenciador", () => {
    expect(canonical).not.toMatch(/EXCEPTION\s+WHEN\s+OTHERS/i);
  });

  test("não edita rpc_fiscal_homologation_readiness canônica", () => {
    // v2 é aditiva; a base preserva assinatura ().
    expect(canonical).toContain("rpc_fiscal_homologation_readiness_v2()");
    expect(canonical).not.toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.rpc_fiscal_homologation_readiness\s*\(\s*\)/,
    );
  });

  test("v2 chama a base e injeta rtc_configured", () => {
    expect(canonical).toContain("v_base := public.rpc_fiscal_homologation_readiness()");
    expect(canonical).toContain("'rtc_configured'");
  });

  test("apenas colunas reais são atualizadas (updated_at existe)", () => {
    // Se algum dia updated_at faltar em qualquer tabela alvo, migration aborta.
    expect(canonical).toMatch(/updated_at ausente/);
    // updated_at é usado apenas em tabelas onde os tipos canônicos confirmam existência.
    const types = read("src/integrations/supabase/cultivofarm.types.ts");
    for (const t of ["company_fiscal_settings", "product_fiscal_profiles", "service_fiscal_profiles"]) {
      const block = types.substring(types.indexOf(`${t}: {`));
      expect(block.substring(0, 4000)).toMatch(/updated_at\s*:/);
    }
  });
});

describe("Fase 3.19.3 — Validação server-side", () => {
  test("valida schema_version, enums, percentuais, códigos, datas e tamanhos", () => {
    for (const marker of [
      "FISCAL_RTC_INVALID_PAYLOAD",
      "FISCAL_RTC_SENSITIVE_KEY",
      "FISCAL_RTC_PAYLOAD_TOO_LARGE",
      "FISCAL_RTC_SCHEMA_VERSION_UNSUPPORTED",
      "FISCAL_RTC_UNKNOWN_FIELD",
      "FISCAL_RTC_INVALID_ADDITIONAL_FIELDS",
      "FISCAL_RTC_INVALID_ENVIRONMENT",
      "FISCAL_RTC_INVALID_REVIEW_STATUS",
      "FISCAL_RTC_INVALID_PERCENT",
      "FISCAL_RTC_INVALID_CODE",
      "FISCAL_RTC_INVALID_DATE",
      "FISCAL_RTC_STRING_TOO_LONG",
    ]) {
      expect(canonical).toContain(marker);
    }
  });

  test("scanner recursivo bloqueia production_enabled em qualquer profundidade", () => {
    expect(canonical).toMatch(/'production_enabled'/);
    // Faz parte do array `needles` do scanner recursivo.
    const scannerBlock = canonical.substring(canonical.indexOf("fiscal_rtc_has_sensitive_key"));
    expect(scannerBlock).toMatch(/needles\s+text\[\]\s*:=\s*ARRAY\[[\s\S]*production_enabled/);
  });
});

describe("Fase 3.19.3 — RPCs e autorização", () => {
  test.each([
    "rpc_fiscal_company_rtc_get()",
    "rpc_fiscal_company_rtc_save(jsonb,text)",
    "rpc_fiscal_product_ibs_cbs_get(uuid)",
    "rpc_fiscal_product_ibs_cbs_save(uuid,jsonb,text)",
    "rpc_fiscal_service_ibs_cbs_get(uuid)",
    "rpc_fiscal_service_ibs_cbs_save(uuid,jsonb,text)",
  ])("GRANT/REVOKE canônico para %s", (sig) => {
    expect(canonical).toContain(sig);
  });

  test("saves de item exigem admin OU financeiro", () => {
    for (const fn of ["rpc_fiscal_product_ibs_cbs_save", "rpc_fiscal_service_ibs_cbs_save"]) {
      const idx = canonical.indexOf(`FUNCTION public.${fn}(`);
      const body = canonical.substring(idx, idx + 1500);
      expect(body).toMatch(/administrador/);
      expect(body).toMatch(/financeiro/);
    }
  });

  test("nenhuma RPC concede EXECUTE a anon", () => {
    for (const g of canonical.match(/GRANT EXECUTE[^\n]*/g) ?? []) {
      expect(g).not.toMatch(/\banon\b/);
    }
    expect(canonical).toMatch(/REVOKE ALL[^\n]*FROM PUBLIC, anon/);
  });
});

describe("Fase 3.19.3 — Concorrência otimista", () => {
  test("saves aceitam expected_revision e emitem FISCAL_CONFLICT", () => {
    for (const fn of [
      "rpc_fiscal_company_rtc_save",
      "rpc_fiscal_product_ibs_cbs_save",
      "rpc_fiscal_service_ibs_cbs_save",
    ]) {
      const idx = canonical.indexOf(`FUNCTION public.${fn}(`);
      const body = canonical.substring(idx, idx + 2500);
      expect(body).toMatch(/expected_revision text DEFAULT NULL/);
      expect(body).toMatch(/FISCAL_CONFLICT/);
      expect(body).toMatch(/updated_at::text/);
    }
  });

  test("hook mapeia FISCAL_CONFLICT para mensagem pt-BR", () => {
    const src = read("src/hooks/useFiscalRtc.ts");
    expect(src).toMatch(/FISCAL_CONFLICT/);
    expect(src).toMatch(/alterados por outra pessoa/);
    expect(src).toMatch(/expected_revision:/);
  });
});

describe("Fase 3.19.3 — Frontend sem any, com parse defensivo", () => {
  test.each([
    "src/hooks/useFiscalRtc.ts",
    "src/components/fiscal/IbsCbsItemCard.tsx",
    "src/components/fiscal/RtcCompanyCard.tsx",
  ])("%s não usa `as any`", (path) => {
    const src = read(path);
    expect(src).not.toMatch(/\bas\s+any\b/);
  });

  test("hook usa safeParse para leitura e retorno de save", () => {
    const src = read("src/hooks/useFiscalRtc.ts");
    expect((src.match(/safeParse/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/parseEnvelope/);
  });

  test("cards e schema mantêm campos NFS-e e IBS/CBS obrigatórios", () => {
    const card = read("src/components/fiscal/IbsCbsItemCard.tsx");
    for (const k of ["finNFSe", "tpNFSeDebito", "tpNFSeCredito", "gIBSCBSAjuste", "vAjusteBC"]) {
      expect(card).toContain(k);
    }
    for (const k of ["c_ind_op", "cst_ibs_cbs", "aliquota_cbs", "aliquota_ibs_uf", "aliquota_ibs_municipio"]) {
      expect(card).toContain(k);
    }
  });
});

describe("Fase 3.19.3 — Integração de páginas", () => {
  test("FiscalEmpresa mantém aba/painel RTC", () => {
    const src = read("src/pages/configuracoes/FiscalEmpresa.tsx");
    expect(src).toContain('value="rtc"');
    expect(src).toContain("RtcCompanyCard");
  });

  test("FiscalProdutos e FiscalServicos incluem IbsCbsItemCard", () => {
    expect(read("src/pages/configuracoes/FiscalProdutos.tsx")).toContain('kind="product"');
    // Bloco 5: FiscalServicos passa a identidade estável do perfil
    // (service_fiscal_profiles.id) via kind="service_profile", permitindo
    // editar IBS/CBS de perfis que existem só por source_reference.
    expect(read("src/pages/configuracoes/FiscalServicos.tsx")).toContain('kind="service_profile"');
    expect(read("src/pages/configuracoes/FiscalServicos.tsx")).toContain("IbsCbsItemCard");
  });
});

describe("Fase 3.19.3 — Migration/stub", () => {
  test("restoration/migrations tem apenas stub documental (sem SQL executável)", () => {
    const stub = read("restoration/migrations/20260727000000_fiscal_fase3_19_rtc_2026.sql");
    expect(stub).toMatch(/STUB/i);
    // Nenhum statement SQL executável: sem BEGIN, CREATE, ALTER, DO $$, GRANT, REVOKE.
    const noComments = stub
      .split("\n")
      .filter((ln) => !ln.trim().startsWith("--"))
      .join("\n");
    expect(noComments).not.toMatch(/\b(BEGIN|COMMIT|CREATE|ALTER|GRANT|REVOKE|DROP|INSERT|UPDATE|DELETE|DO\s+\$\$)\b/i);
    // Nenhum SQL executável em fiscal-fase3-19/.
    let hasExec = false;
    try {
      readFileSync(resolve(ROOT, "restoration/fiscal-fase3-19/20260727000000_fiscal_fase3_19_rtc_2026.sql"));
      hasExec = true;
    } catch { /* esperado ausente */ }
    expect(hasExec).toBe(false);
  });
});


describe("Fase 3.19.3 — CNPJ alfanumérico preservado", () => {
  test("masks delega para cnpjAlpha e FiscalEmpresa aceita alfa", () => {
    const masks = read("src/lib/masks.ts");
    expect(masks).toMatch(/from\s+["']\.\/fiscal\/cnpjAlpha["']|cnpjAlpha/);
    const empresa = read("src/pages/configuracoes/FiscalEmpresa.tsx");
    // Aceita unmaskCnpj (delegado) ou unmaskCnpjAlpha diretamente.
    expect(empresa).toMatch(/unmaskCnpj(Alpha)?/);
    // Campo CNPJ deve usar inputMode text (não numeric) para permitir letras.
    expect(empresa).not.toMatch(/inputMode=["']numeric["'][^>]*"cnpj"/i);
  });
});


import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-D — gate estático do inventário de funções `SECURITY DEFINER` executáveis por
 * `authenticated` na homologação, e do dossiê do lote H9-D-L1.
 *
 * Aritmética obrigatória:
 *   universo bruto            = 376
 *   fora do escopo profundo   =  84 (herdadas da H9-C, com referência explícita)
 *   escopo profundo H9-D      = 292
 *
 * Regras de prova:
 *   - regex/posição é apenas TRIAGEM e nunca promove uma assinatura;
 *   - AUTH_COMPROVADA/NAO_APLICAVEL exigem evidência específica (dossiê ou decisão
 *     manual) chaveada pela ASSINATURA CANÔNICA COMPLETA, nunca pelo nome;
 *   - evidência vaga ("delegação a função guardada", frases genéricas de regex)
 *     é proibida;
 *   - o lote H9-D-L1 tem exatamente 30 assinaturas, únicas e sem colisão por
 *     sobrecarga.
 */
const ROOT = resolve(__dirname, "../../..");
const DIR = resolve(ROOT, "restoration/homologacao-h9/h9d-inventario");

const resumo = JSON.parse(readFileSync(resolve(DIR, "resumo-h9d.json"), "utf8")) as {
  total_bruto: number;
  fora_escopo_h9d: number;
  escopo_h9d: number;
  ledger: number;
  ambiente: string;
  lotes_auditados: string[];
  por_classificacao: Record<string, number>;
};

const dossie = JSON.parse(readFileSync(resolve(DIR, "dossie-l1.json"), "utf8")) as {
  ambiente: string;
  ledger: number;
  lote: string;
  total: number;
  fonte_hash_sql: string;
  assinaturas: Record<
    string,
    {
      acl: string;
      proconfig: string;
      definition_md5: string;
      definition_len: number;
      guarda_textual: string;
      cadeia_transitiva: string;
      null_fail_closed: string;
      tenant_bola_idor: string;
      sql_dinamico: string;
      callsites: string;
      classificacao: string;
    }
  >;
};

const tsv = readFileSync(resolve(DIR, "secdef-authenticated-inventory-h9d.tsv"), "utf8").trim().split("\n");
const header = tsv[0].split("\t");
const rows = tsv.slice(1).map((l) => Object.fromEntries(l.split("\t").map((v, i) => [header[i], v])));

const ESCOPO = new Set([
  "AUTH_COMPROVADA",
  "NAO_APLICAVEL",
  "EXPOSICAO_COMPROVADA_CORRIGIDA",
  "PENDENTE_EVIDENCIA",
]);


const L1_ESPERADAS: readonly string[] = [
  "approve_microorganism_profile_with_audit(uuid,jsonb,boolean)",
  "approve_product_profile_with_audit(uuid,jsonb,boolean)",
  "check_cliente_dependencies(uuid)",
  "create_technical_visit_secure(uuid,uuid,uuid,uuid,timestamp with time zone,tipo_visita,urgencia_consultor,text,uuid)",
  "finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid)",
  "fn_fin_cashflow(date,date,text,text)",
  "fn_fin_dashboard_kpis(date,date)",
  "fn_fin_dre_summary(date,date,text)",
  "fn_fin_expense_by_category(date,date,text,integer)",
  "fn_fin_inadimplencia()",
  "fn_fin_revenue_by_category(date,date,text,integer)",
  "fn_fin_revenue_by_customer(date,date,text,integer)",
  "fn_financial_inconsistencies()",
  "fn_generate_recurring_title(uuid,date,boolean)",
  "fn_mark_entrega_not_billable(uuid,text)",
  "fn_revert_recurring_generation(uuid)",
  "get_b2b_technician_client_detail_secure(uuid)",
  "get_b2b_technician_clients_secure(uuid,uuid)",
  "get_b2b_user_client_detail_secure(uuid,text)",
  "get_financial_alerts(date)",
  "get_financial_cashflow(date,date,text,text)",
  "get_financial_dashboard_summary(date,date,uuid,uuid,uuid)",
  "get_financial_dre_summary(date,date,text,uuid)",
  "get_financial_report_data(text,date,date,uuid,uuid,uuid,text,text)",
  "get_partner_catalog_secure(uuid)",
  "get_partner_catalog_tecnico_secure()",
  "get_production_planning_detail(uuid)",
  "get_report_customer_statement(uuid,date,date)",
  "get_report_delinquency(date)",
  "get_report_deliveries_billing_status(date,date)",
] as const;

const GENERICA = [
  "delegação a função guardada",
  "guarda de identidade/papel precede o primeiro acesso sensivel",
  "guarda de identidade/papel precede o primeiro acesso sensível",
];

describe("H9-D — inventário de SECURITY DEFINER por authenticated", () => {
  it("declara homologação e o ledger corrente", () => {
    expect(resumo.ambiente).toContain("ikaauvsflpmamgxmkhoq");
    expect(resumo.ledger).toBe(663);
  });

  it("separa universo bruto, herança da H9-C e escopo profundo", () => {
    expect(resumo.total_bruto).toBe(376);
    expect(rows).toHaveLength(376);
    expect(resumo.fora_escopo_h9d).toBe(84);
    expect(resumo.escopo_h9d).toBe(292);
    expect(resumo.fora_escopo_h9d + resumo.escopo_h9d).toBe(resumo.total_bruto);
  });

  it("a soma das classificações do escopo fecha exatamente em 292", () => {
    const soma = Object.values(resumo.por_classificacao).reduce((a, b) => a + b, 0);
    expect(soma).toBe(292);
    for (const k of Object.keys(resumo.por_classificacao)) expect(ESCOPO.has(k)).toBe(true);
  });

  it("as 84 herdadas citam a H9-C e não são recontadas como prova nova", () => {
    const herdadas = rows.filter((r) => r.escopo_h9d === "FORA_ESCOPO_H9D_HERDADO_H9C");
    expect(herdadas).toHaveLength(84);
    for (const r of herdadas) {
      expect(r.classificacao_h9d).toBe("HERDADA_H9C");
      expect(r.evidencia).toContain("03-h9c-secdef-authenticated.md");
    }
  });

  it("nenhuma classificação conclusiva usa evidência genérica ou vaga", () => {
    const conclusivas = rows.filter(
      (r) => r.classificacao_h9d === "AUTH_COMPROVADA" || r.classificacao_h9d === "NAO_APLICAVEL",
    );
    expect(conclusivas.length).toBeGreaterThan(0);
    for (const r of conclusivas) {
      expect(r.evidencia.length).toBeGreaterThan(60);
      for (const g of GENERICA) expect(r.evidencia.includes(g), `evidência vaga em ${r.signature}`).toBe(false);
      expect(/dossi|Corpo lido|corpo lido|teste|Primitivo/.test(r.evidencia), r.signature).toBe(true);
    }
  });

  it("as pendentes declaram lote determinístico e não afirmam segurança", () => {
    const pend = rows.filter((r) => r.classificacao_h9d === "PENDENTE_EVIDENCIA");
    expect(pend.length).toBe(resumo.por_classificacao.PENDENTE_EVIDENCIA);
    for (const r of pend) {
      expect(/Lote determinístico H9-D-L\d+/.test(r.evidencia), r.signature).toBe(true);
      // nenhuma pendente pode ser rotulada como já auditada no L1
      expect(r.evidencia).not.toContain("Lote determinístico H9-D-L1.");
    }
  });

  it("registra as duas exposições comprovadas e corrigidas (H9-D1 e H9-D-L1)", () => {
    const exp = rows.filter((r) => r.classificacao_h9d === "EXPOSICAO_COMPROVADA_CORRIGIDA");
    expect(exp).toHaveLength(2);
    const d1 = exp.find((r) => r.signature.startsWith("fn_run_recurring_generation("))!;
    expect(d1.evidencia).toContain("20261006000000");
    const l1 = exp.find((r) => r.signature.startsWith("create_technical_visit_secure("))!;
    expect(l1.evidencia).toContain("20261007000000");
    expect(l1.evidencia).toContain("IDOR");
  });

  it("assinaturas são únicas e ordenadas de forma determinística", () => {
    const sigs = rows.map((r) => r.signature);
    expect(new Set(sigs).size).toBe(sigs.length);
    expect([...sigs].sort()).toEqual(sigs);
  });
});

describe("H9-D — dossiê do lote L1", () => {
  const chaves = Object.keys(dossie.assinaturas);
  const inventario = new Map(rows.map((r) => [r.signature, r]));

  it("declara homologação, ledger e lote", () => {
    expect(dossie.ambiente).toBe("ikaauvsflpmamgxmkhoq");
    expect(dossie.ledger).toBe(663);
    expect(dossie.lote).toBe("H9-D-L1");
    expect(resumo.lotes_auditados).toContain("H9-D-L1");
  });

  it("contém exatamente 30 assinaturas únicas", () => {
    expect(dossie.total).toBe(30);
    expect(chaves).toHaveLength(30);
    expect(new Set(chaves).size).toBe(30);
  });

  it("toda chave é assinatura canônica completa e existe no inventário", () => {
    for (const k of chaves) {
      expect(k, `chave sem lista de argumentos: ${k}`).toMatch(/^[a-z0-9_]+\(.*\)$/);
      expect(inventario.has(k), `assinatura ausente do inventário: ${k}`).toBe(true);
      expect(inventario.get(k)!.escopo_h9d).toBe("ESCOPO_PROFUNDO_H9D");
    }
  });

  it("não há promoção por nome: cada nome sobrecarregado é tratado por assinatura", () => {
    for (const k of chaves) {
      const nome = k.slice(0, k.indexOf("("));
      const mesmasBases = rows.filter((r) => r.signature.startsWith(`${nome}(`));
      for (const r of mesmasBases) {
        if (r.signature === k) continue;
        // Uma sobrecarga não coberta pelo dossiê nunca pode herdar a evidência do L1.
        expect(r.evidencia.includes("Lote H9-D-L1"), `colisão por overload em ${r.signature}`).toBe(false);
      }
    }
  });

  it("as chaves do L1 são exatamente as 30 assinaturas canônicas esperadas", () => {
    expect([...chaves].sort()).toEqual([...L1_ESPERADAS].sort());
  });

  it("declara a consulta SQL reprodutível dos fingerprints do catálogo vivo", () => {
    expect(dossie.fonte_hash_sql).toContain("md5(pg_get_functiondef(p.oid))");
    expect(dossie.fonte_hash_sql).toContain("oidvectortypes(p.proargtypes)");
  });

  it("cada assinatura do L1 tem evidência específica e completa", () => {
    for (const [k, d] of Object.entries(dossie.assinaturas)) {
      expect(["AUTH_COMPROVADA", "EXPOSICAO_COMPROVADA_CORRIGIDA"]).toContain(d.classificacao);
      expect(d.definition_md5).toMatch(/^[0-9a-f]{32}$/);
      expect(d.definition_len).toBeGreaterThan(100);
      expect(d.acl).toContain("authenticated");
      expect(d.proconfig).toContain("search_path");
      expect(d.guarda_textual.length).toBeGreaterThan(20);
      expect(d.cadeia_transitiva.length).toBeGreaterThan(20);
      expect(d.null_fail_closed.length).toBeGreaterThan(3);
      expect(d.tenant_bola_idor.length).toBeGreaterThan(10);
      expect(d.sql_dinamico.length).toBeGreaterThan(3);
      expect(d.callsites.length).toBeGreaterThan(10);
      for (const g of GENERICA) expect(d.guarda_textual.includes(g), k).toBe(false);
    }
  });

  it("o inventário reflete o dossiê nas 30 assinaturas do L1", () => {
    for (const k of chaves) {
      const r = inventario.get(k)!;
      expect(r.classificacao_h9d).toBe(dossie.assinaturas[k].classificacao);
      expect(r.evidencia).toContain("Lote H9-D-L1");
      expect(r.evidencia).toContain(dossie.assinaturas[k].definition_md5);
    }
  });
});

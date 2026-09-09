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
  forwards_aplicados?: string[];
  total_bruto: number;
  fora_escopo_h9d: number;
  escopo_h9d: number;
  ledger: number;
  ambiente: string;
  lotes_auditados: string[];
  por_classificacao: Record<string, number>;
};

type Dossie = {
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

const dossie = JSON.parse(readFileSync(resolve(DIR, "dossie-l1.json"), "utf8")) as Dossie;
const dossieL2 = JSON.parse(readFileSync(resolve(DIR, "dossie-l2.json"), "utf8")) as Dossie;
const dossieL3 = JSON.parse(readFileSync(resolve(DIR, "dossie-l3.json"), "utf8")) as Dossie;

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
    expect(resumo.ledger).toBe(665);
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

  it("registra as exposições comprovadas e corrigidas (H9-D1, H9-D-L1 e H9-D-L2)", () => {
    const exp = rows.filter((r) => r.classificacao_h9d === "EXPOSICAO_COMPROVADA_CORRIGIDA");
    expect(exp).toHaveLength(14);
    expect(exp.filter((r) => r.evidencia.includes("20261008000000"))).toHaveLength(12);
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

const L2_ESPERADAS: readonly string[] = [
  "can_manage_catalog_tecnico(uuid)",
  "can_manage_technical_visit(uuid,uuid)",
  "can_user_access_aplicacao(uuid)",
  "can_user_access_arquivo(text,uuid)",
  "can_user_access_cliente(uuid)",
  "can_user_access_estoque_embalagem(uuid)",
  "can_user_access_fazenda(uuid)",
  "can_user_access_registro_consultor(uuid)",
  "can_user_access_solicitacao(uuid)",
  "can_user_manage_aplicacao(uuid)",
  "can_user_manage_estoque_embalagem(uuid)",
  "can_view_catalog_internal(uuid)",
  "can_view_technical_visit(uuid,uuid)",
  "fn_catalogo_preco_canonico(uuid,uuid,text,numeric)",
  "fn_fiscal_can_operate(uuid)",
  "fn_fiscal_can_read_internal(uuid)",
  "fn_fiscal_company_crt()",
  "fn_microorganism_regulatory_facts(uuid)",
  "fn_onfarm_scope_cliente(uuid)",
  "fn_onfarm_scope_lote(uuid)",
  "fn_regulatory_can_approve(text,uuid)",
  "fn_regulatory_can_prepare(uuid)",
  "fn_regulatory_can_read(uuid)",
  "fn_regulatory_storage_can_delete(text)",
  "fn_regulatory_storage_can_read(text)",
  "fn_regulatory_storage_can_write(text)",
  "get_b2b_partner_clients_for_assignment_secure(text)",
  "get_b2b_user_client_simulations_secure(uuid)",
  "get_b2b_user_clients_secure(uuid,text)",
  "get_cliente_id_for_user(uuid)",
] as const;

describe("H9-D — dossiê do lote L2", () => {
  const chaves = Object.keys(dossieL2.assinaturas);
  const inventario = new Map(rows.map((r) => [r.signature, r]));

  it("declara homologação, ledger 664 e o lote L2", () => {
    expect(dossieL2.ambiente).toBe("ikaauvsflpmamgxmkhoq");
    expect(dossieL2.ledger).toBe(664);
    expect(dossieL2.lote).toBe("H9-D-L2");
    expect(resumo.lotes_auditados).toContain("H9-D-L2");
    expect(resumo.forwards_aplicados ?? []).toContain("20261008000000");
  });

  it("contém exatamente as 30 assinaturas canônicas do lote, sem overload nem herança", () => {
    expect(dossieL2.total).toBe(30);
    expect(chaves).toHaveLength(30);
    expect([...chaves].sort()).toEqual([...L2_ESPERADAS].sort());
    for (const k of chaves) {
      expect(k).toMatch(/^[a-z0-9_]+\(.*\)$/);
      expect(inventario.has(k), `assinatura ausente do inventário: ${k}`).toBe(true);
      expect(inventario.get(k)!.escopo_h9d).toBe("ESCOPO_PROFUNDO_H9D");
      const nome = k.slice(0, k.indexOf("("));
      for (const r of rows.filter((x) => x.signature.startsWith(`${nome}(`) && x.signature !== k)) {
        expect(r.evidencia.includes("Lote H9-D-L2"), `colisão por overload em ${r.signature}`).toBe(false);
      }
    }
  });

  it("não há interseção com o lote L1", () => {
    for (const k of chaves) expect(Object.keys(dossie.assinaturas)).not.toContain(k);
  });

  it("cada assinatura tem evidência específica e fingerprint vivo", () => {
    for (const [k, d] of Object.entries(dossieL2.assinaturas)) {
      expect(["AUTH_COMPROVADA", "EXPOSICAO_COMPROVADA_CORRIGIDA", "PENDENTE_EVIDENCIA"]).toContain(d.classificacao);
      expect(d.definition_md5, k).toMatch(/^[0-9a-f]{32}$/);
      expect(d.definition_len).toBeGreaterThan(100);
      expect(d.acl).toContain("authenticated");
      expect(d.proconfig).toContain("search_path");
      expect(d.guarda_textual.length).toBeGreaterThan(20);
      expect(d.cadeia_transitiva.length).toBeGreaterThan(20);
      expect(d.tenant_bola_idor.length).toBeGreaterThan(10);
      expect(d.callsites.length).toBeGreaterThan(10);
      for (const g of GENERICA) expect(d.guarda_textual.includes(g), k).toBe(false);
    }
  });

  it("as 12 exposições do L2 citam o forward reversível aplicado na homologação", () => {
    const corrigidas = Object.entries(dossieL2.assinaturas).filter(
      ([, d]) => d.classificacao === "EXPOSICAO_COMPROVADA_CORRIGIDA",
    );
    expect(corrigidas).toHaveLength(12);
    for (const [k, d] of corrigidas) {
      expect((d as unknown as { observacao: string }).observacao, k).toContain("20261008000000");
    }
  });

  it("o inventário reflete o dossiê L2", () => {
    for (const k of chaves) {
      // Reauditada no L3, que prevalece no inventário (ver bloco do lote L3).
      if (REAUDITADAS_L2_L3.has(k)) continue;
      const r = inventario.get(k)!;
      expect(r.classificacao_h9d).toBe(dossieL2.assinaturas[k].classificacao);
      if (dossieL2.assinaturas[k].classificacao !== "PENDENTE_EVIDENCIA") {
        expect(r.evidencia).toContain("Lote H9-D-L2");
        expect(r.evidencia).toContain(dossieL2.assinaturas[k].definition_md5);
      }
    }
  });
});

const L3_ESPERADAS: readonly string[] = [
  "fn_catalogo_preco_canonico(uuid,uuid,text,numeric)",
  "get_cliente_ids_for_user(uuid)",
  "get_my_available_portal_contexts()",
  "get_report_monthly_financial(date,date,uuid,text)",
  "get_report_nfe_pending(jsonb)",
  "get_report_payables(jsonb)",
  "get_report_receivables(jsonb)",
  "get_top_financial_rankings(date,date,integer)",
  "get_user_partner_id()",
  "has_active_user_cliente_access(uuid,uuid,text[])",
  "is_delivery_staff(uuid)",
  "is_financial_staff(uuid)",
  "lab_request_replanning(uuid,text)",
  "log_my_access_denied_secure(text,text)",
  "log_report_export(text,jsonb,text,text,text,text,text,integer)",
  "pode_acessar_recomendacao(uuid,uuid)",
  "publish_planning_to_lab(uuid)",
  "return_catalog_profile_to_review(text,uuid,text)",
  "rpc_activate_communication_template(uuid)",
  "rpc_admin_communication_health_snapshot()",
  "rpc_admin_communication_outbox_metrics()",
  "rpc_admin_list_communication_dead_letter(integer,integer)",
  "rpc_anexar_comprovante_entrega(uuid,jsonb)",
  "rpc_archive_communication_template(uuid)",
  "rpc_assign_visit_technician(uuid,uuid,text)",
  "rpc_atualizar_checklist_entrega(uuid,boolean,text)",
  "rpc_avancar_esteira_laboratorio(uuid,text,text,uuid)",
  "rpc_b2b_capacity_kpis()",
  "rpc_b2b_credit_exposure(uuid,numeric,uuid)",
  "rpc_b2b_executive_alerts()",
] as const;

/**
 * Exceção única e explícita: `fn_catalogo_preco_canonico` ficou PENDENTE_EVIDENCIA
 * no L2 (decisão de contrato comercial em aberto) e foi reauditada e resolvida no
 * L3, que prevalece no inventário.
 */
const REAUDITADAS_L2_L3 = new Set(["fn_catalogo_preco_canonico(uuid,uuid,text,numeric)"]);

describe("H9-D — dossiê do lote L3", () => {
  const chaves = Object.keys(dossieL3.assinaturas);
  const inventario = new Map(rows.map((r) => [r.signature, r]));

  it("declara homologação, ledger 665 e o lote L3", () => {
    expect(dossieL3.ambiente).toBe("ikaauvsflpmamgxmkhoq");
    expect(dossieL3.ledger).toBe(665);
    expect(dossieL3.lote).toBe("H9-D-L3");
    expect(resumo.lotes_auditados).toContain("H9-D-L3");
    expect(resumo.forwards_aplicados ?? []).toContain("20261009000000");
  });

  it("contém exatamente as 30 assinaturas canônicas do lote, sem overload nem herança", () => {
    expect(dossieL3.total).toBe(30);
    expect(chaves).toHaveLength(30);
    expect([...chaves].sort()).toEqual([...L3_ESPERADAS].sort());
    expect(new Set(chaves).size).toBe(30);
    for (const k of chaves) {
      expect(k).toMatch(/^[a-z0-9_]+\(.*\)$/);
      expect(inventario.has(k), `assinatura ausente do inventário: ${k}`).toBe(true);
      expect(inventario.get(k)!.escopo_h9d).toBe("ESCOPO_PROFUNDO_H9D");
      const nome = k.slice(0, k.indexOf("("));
      for (const r of rows.filter((x) => x.signature.startsWith(`${nome}(`) && x.signature !== k)) {
        expect(r.evidencia.includes("Lote H9-D-L3"), `colisão por overload em ${r.signature}`).toBe(false);
      }
    }
  });

  it("não há interseção com L1 e a única reauditagem do L2 é declarada", () => {
    for (const k of chaves) expect(Object.keys(dossie.assinaturas)).not.toContain(k);
    const inter = chaves.filter((k) => Object.keys(dossieL2.assinaturas).includes(k));
    for (const k of inter) {
      expect(REAUDITADAS_L2_L3.has(k), `interseção não declarada: ${k}`).toBe(true);
      expect(dossieL2.assinaturas[k].classificacao).toBe("PENDENTE_EVIDENCIA");
    }
  });

  it("cada assinatura tem evidência específica e fingerprint vivo", () => {
    for (const [k, d] of Object.entries(dossieL3.assinaturas)) {
      expect(["AUTH_COMPROVADA", "EXPOSICAO_COMPROVADA_CORRIGIDA"], k).toContain(d.classificacao);
      expect(d.definition_md5, k).toMatch(/^[0-9a-f]{32}$/);
      expect(d.definition_len).toBeGreaterThan(100);
      expect(d.proconfig).toContain("search_path");
      expect(d.guarda_textual.length).toBeGreaterThan(20);
      expect(d.cadeia_transitiva.length).toBeGreaterThan(20);
      expect(d.null_fail_closed.length).toBeGreaterThan(3);
      expect(d.tenant_bola_idor.length).toBeGreaterThan(10);
      expect(d.sql_dinamico.length).toBeGreaterThan(3);
      expect(d.callsites.length).toBeGreaterThan(10);
      for (const g of GENERICA) expect(d.guarda_textual.includes(g), k).toBe(false);
      // ACL viva: `authenticated` mantém EXECUTE, exceto onde a correção revogou.
      if (k === "fn_catalogo_preco_canonico(uuid,uuid,text,numeric)") {
        expect(d.acl.includes("authenticated")).toBe(false);
      } else {
        expect(d.acl).toContain("authenticated");
      }
    }
  });

  it("as 6 exposições do L3 citam o forward reversível aplicado na homologação", () => {
    const corrigidas = Object.entries(dossieL3.assinaturas).filter(
      ([, d]) => d.classificacao === "EXPOSICAO_COMPROVADA_CORRIGIDA",
    );
    expect(corrigidas).toHaveLength(6);
    for (const [k, d] of corrigidas) {
      expect((d as unknown as { observacao: string }).observacao, k).toContain("20261009000000");
    }
  });

  it("o inventário reflete o dossiê L3", () => {
    for (const k of chaves) {
      const r = inventario.get(k)!;
      expect(r.classificacao_h9d).toBe(dossieL3.assinaturas[k].classificacao);
      expect(r.evidencia).toContain("Lote H9-D-L3");
      expect(r.evidencia).toContain(dossieL3.assinaturas[k].definition_md5);
    }
  });
});

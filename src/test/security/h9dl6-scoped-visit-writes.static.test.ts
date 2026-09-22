import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-D-L6 — gate estático do lote de 30 assinaturas SECURITY DEFINER e do forward
 * reversível 20261017000000 (homologação `ikaauvsflpmamgxmkhoq`, ledger 672 -> 673).
 *
 * Produção `navfzbwgwzruipouyfnk` nunca é alvo: nenhum artefato do lote pode citá-la
 * como ambiente de execução.
 *
 * O gate cobre: a lista exata das 30 assinaturas, a coerência dossiê <-> inventário,
 * a presença de fingerprints vivos, a simetria forward/rollback com hash no manifesto,
 * a autorização escopada antes de qualquer leitura nas 4 funções corrigidas, o
 * search_path fixo, a ausência de GRANT para PUBLIC/anon e a ausência de mensagens
 * distintas que funcionem como oráculo de existência.
 */
const ROOT = resolve(__dirname, "../../..");
const DIR = resolve(ROOT, "restoration/homologacao-h9/h9d-inventario");
const FW_PATH = "restoration/homologacao-h9/h9d-forwards/20261017000000_h9dl6_authz_scoped_visit_writes_no_oracle_v1.sql";
const RB_PATH =
  "restoration/homologacao-h9/h9d-rollbacks/20261017000000_h9dl6_authz_scoped_visit_writes_no_oracle_v1_rollback.sql";

const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const sha256 = (p: string) => createHash("sha256").update(readFileSync(resolve(ROOT, p))).digest("hex");

interface Entrada {
  classificacao: string;
  guarda_textual: string;
  cadeia_transitiva: string;
  callsites: string;
  prova_individual: string;
  fingerprint_vivo?: {
    definition_md5: string;
    definition_len: number;
    proconfig: string;
    acl: string;
    owner: string;
    security_definer: boolean;
  };
}

const dossie = JSON.parse(readFileSync(resolve(DIR, "dossie-l6.json"), "utf8")) as {
  ambiente: string;
  producao_proibida: string;
  ledger: number;
  ultima_migration: string;
  lote: string;
  total: number;
  forward_sha256: string;
  rollback_sha256: string;
  forward_l6r_path: string;
  forward_l6r_sha256: string;
  rollback_l6r_path: string;
  rollback_l6r_sha256: string;
  incidente_rastreabilidade: string;
  assinaturas: Record<string, Entrada>;
};
const decisoes = JSON.parse(readFileSync(resolve(DIR, "decisoes-l6.json"), "utf8")) as {
  lote: string;
  assinaturas: Record<string, Entrada>;
};
const resumo = JSON.parse(readFileSync(resolve(DIR, "resumo-h9d.json"), "utf8")) as {
  ledger: number;
  escopo_h9d: number;
  por_classificacao: Record<string, number>;
  lotes_auditados: string[];
  forwards_aplicados: string[];
};
const manifest = JSON.parse(
  readFileSync(resolve(ROOT, "restoration/homologacao-h9/h9c-applied-forwards.json"), "utf8"),
) as { ledger_versoes: number; total_applied_forwards: number; entries: Record<string, unknown>[] };

const inv = read("restoration/homologacao-h9/h9d-inventario/secdef-authenticated-inventory-h9d.tsv")
  .trim()
  .split("\n");
const header = inv[0].split("\t");
const rows = inv.slice(1).map((l) => {
  const c = l.split("\t");
  return Object.fromEntries(header.map((h, i) => [h, c[i]])) as Record<string, string>;
});

const ESCOPO_L6 = [
  "rpc_listar_visitas_tecnicas_v1(text,text[],date,date,uuid,uuid,integer,integer)",
  "rpc_marcar_etiqueta_impressa(uuid,text)",
  "rpc_message_set_status(uuid,text)",
  "rpc_notificar_gestor(text,text,text)",
  "rpc_partner_commercial_history(uuid,date,date)",
  "rpc_partner_dashboard(uuid)",
  "rpc_partner_message_counters(uuid)",
  "rpc_portal_partner_financial()",
  "rpc_portal_partner_financial(uuid)",
  "rpc_preparar_notificacoes_alertas()",
  "rpc_preview_administrative_broadcast_count(app_role)",
  "rpc_programar_os_v1(uuid,text,date)",
  "rpc_publish_communication_event(text,text,uuid,jsonb,text)",
  "rpc_publish_communication_event_v2(text,text,uuid,jsonb,text)",
  "rpc_rastreio_produto_interno(uuid)",
  "rpc_reabrir_visita(uuid,integer,text)",
  "rpc_realizar_checkin_visita(uuid,uuid,tipo_checkin,numeric,numeric,numeric,text,text,timestamp with time zone,uuid,uuid,uuid,uuid,text)",
  "rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamp with time zone,text)",
  "rpc_registrar_ocorrencia_entrega(uuid,jsonb)",
  "rpc_remove_visit_technician(uuid,uuid,text)",
  "rpc_resolve_commercial_prices(jsonb,uuid,date,jsonb)",
  "rpc_resumo_atendimentos_tecnicos_v1()",
  "rpc_salvar_campo_visita(uuid,uuid,jsonb,integer)",
  "rpc_set_communication_template_metadata(uuid,text,text,jsonb,text)",
  "rpc_update_communication_template(uuid,text,text,text,jsonb)",
  "rpc_upsert_communication_rule(uuid,text,app_role,text,comunicacao_canal,text,integer,jsonb,integer,boolean,integer)",
  "rpc_upsert_diagnostico_visita(uuid,uuid,jsonb,integer)",
  "rpc_upsert_recomendacao_visita(uuid,uuid,jsonb,integer)",
  "rpc_verify_communication_channel(uuid,uuid,comunicacao_canal,boolean,boolean)",
  "simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)",
] as const;

const CORRIGIDAS = [
  "rpc_realizar_checkin_visita",
  "rpc_realizar_checkout_visita",
  "rpc_upsert_diagnostico_visita",
  "rpc_salvar_campo_visita",
] as const;

describe("H9-D-L6 — escopo e dossiê", () => {
  it("declara homologação, ledger 679 no resumo e a última migration do lote", () => {
    expect(dossie.ambiente).toBe("ikaauvsflpmamgxmkhoq");
    expect(dossie.producao_proibida).toBe("navfzbwgwzruipouyfnk");
    expect(dossie.ledger).toBe(674);
    expect(dossie.ultima_migration).toBe("20261018000000");
    expect(dossie.lote).toBe("H9-D-L6");
    expect(resumo.ledger).toBe(679);
    expect(resumo.lotes_auditados).toContain("H9-D-L6");
    expect(resumo.forwards_aplicados).toContain("20261017000000");
  });

  it("cobre exatamente as 30 assinaturas canônicas do lote", () => {
    expect(Object.keys(dossie.assinaturas).sort()).toEqual([...ESCOPO_L6].sort());
    expect(Object.keys(decisoes.assinaturas).sort()).toEqual([...ESCOPO_L6].sort());
    expect(dossie.total).toBe(30);
  });

  it("cada assinatura tem guarda, cadeia, callsites, prova e fingerprint vivo", () => {
    for (const sig of ESCOPO_L6) {
      const e = dossie.assinaturas[sig];
      expect(e, sig).toBeTruthy();
      expect(e.guarda_textual.length, sig).toBeGreaterThan(60);
      expect(e.cadeia_transitiva.length, sig).toBeGreaterThan(40);
      expect(e.callsites.length, sig).toBeGreaterThan(10);
      expect(e.prova_individual.length, sig).toBeGreaterThan(40);
      expect(e.fingerprint_vivo!.security_definer, sig).toBe(true);
      expect(e.fingerprint_vivo!.definition_md5, sig).toMatch(/^[0-9a-f]{32}$/);
      expect(e.fingerprint_vivo!.definition_len, sig).toBeGreaterThan(100);
      expect(e.fingerprint_vivo!.owner, sig).toBe("postgres");
      expect(e.fingerprint_vivo!.proconfig, sig).toContain("search_path=public");
      expect(e.fingerprint_vivo!.acl, sig).not.toContain("anon=");
      expect(decisoes.assinaturas[sig].classificacao, sig).toBe(e.classificacao);
    }
  });

  it("classifica 26 AUTH_COMPROVADA e 4 EXPOSICAO_COMPROVADA_CORRIGIDA", () => {
    const vals = Object.values(dossie.assinaturas).map((e) => e.classificacao);
    expect(vals.filter((v) => v === "AUTH_COMPROVADA")).toHaveLength(26);
    expect(vals.filter((v) => v === "EXPOSICAO_COMPROVADA_CORRIGIDA")).toHaveLength(4);
    for (const fn of CORRIGIDAS) {
      const sig = ESCOPO_L6.find((s) => s.startsWith(`${fn}(`))!;
      expect(dossie.assinaturas[sig].classificacao, sig).toBe("EXPOSICAO_COMPROVADA_CORRIGIDA");
      expect(dossie.assinaturas[sig].prova_individual, sig).toMatch(/[Ii]ndistinguíveis/);
      expect(dossie.assinaturas[sig].prova_individual, sig).toContain("Resíduo zero");
    }
  });

  it("dossiê e inventário concordam assinatura por assinatura", () => {
    const mapa = new Map(rows.map((r) => [r.signature, r]));
    for (const sig of ESCOPO_L6) {
      const r = mapa.get(sig);
      expect(r, `ausente no inventário: ${sig}`).toBeTruthy();
      expect(r!.classificacao_h9d, sig).toBe(dossie.assinaturas[sig].classificacao);
      expect(r!.body_md5, sig).toBe(dossie.assinaturas[sig].fingerprint_vivo!.definition_md5);
      expect(r!.evidencia, sig).toContain("H9-D-L6");
      if (r!.classificacao_h9d === "EXPOSICAO_COMPROVADA_CORRIGIDA") {
        expect(r!.evidencia, sig).toContain("20261017000000");
      }
    }
  });

  it("o resumo derivado fecha em 292 sem nenhuma pendência após a L7", () => {
    const soma = Object.values(resumo.por_classificacao).reduce((a, b) => a + b, 0);
    expect(soma).toBe(292);
    expect(resumo.escopo_h9d).toBe(292);
    expect(resumo.por_classificacao.AUTH_COMPROVADA).toBe(256);
    expect(resumo.por_classificacao.EXPOSICAO_COMPROVADA_CORRIGIDA).toBe(32);
    expect(resumo.por_classificacao.NAO_APLICAVEL).toBe(4);
    expect(resumo.por_classificacao.PENDENTE_EVIDENCIA).toBe(0);
  });
});

describe("H9-D-L6 — forward e rollback", () => {
  const fw = read(FW_PATH);
  const rb = read(RB_PATH);

  it("o forward vive fora de supabase/migrations e está rastreado com hash", () => {
    expect(FW_PATH.startsWith("restoration/")).toBe(true);
    const entry = manifest.entries.find((e) => e.version === "20261017000000") as
      | Record<string, string | boolean>
      | undefined;
    expect(entry, "forward não rastreado no manifesto").toBeTruthy();
    expect(entry!.sha256).toBe(sha256(FW_PATH));
    expect(entry!.rollback_sha256).toBe(sha256(RB_PATH));
    expect(entry!.applied_to_staging).toBe(true);
    expect(entry!.registered_in_ledger).toBe(true);
    expect(entry!.repo_only_quarantined).toBe(false);
    expect(manifest.ledger_versoes).toBe(684);
    expect(manifest.total_applied_forwards).toBe(manifest.entries.length);
    expect(dossie.forward_sha256).toBe(sha256(FW_PATH));
    expect(dossie.rollback_sha256).toBe(sha256(RB_PATH));
  });

  it("forward e rollback são simétricos nas 4 funções corrigidas", () => {
    for (const fn of CORRIGIDAS) {
      expect(fw).toContain(`CREATE OR REPLACE FUNCTION public.${fn}(`);
      expect(rb).toContain(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    }
    expect(fw).toContain("CREATE OR REPLACE FUNCTION public._visita_scope_ok(p_user_id uuid, p_registro_id uuid)");
    expect(rb).toContain("DROP FUNCTION IF EXISTS public._visita_scope_ok(uuid,uuid)");
    expect(fw.trim().startsWith("--")).toBe(true);
    expect(fw).toContain("BEGIN;");
    expect(fw.trim().endsWith("COMMIT;")).toBe(true);
    expect(rb.trim().endsWith("COMMIT;")).toBe(true);
  });

  it("o forward autoriza o escopo antes de qualquer leitura da visita", () => {
    // o gate precede a chamada que hoje revela existência/estado do registro
    const gates = fw.split("public._assert_visita_editavel(p_registro_id)");
    expect(gates.length).toBeGreaterThan(1);
    for (const antes of gates.slice(0, -1)) {
      expect(antes).toContain("public._visita_scope_ok(v_uid, p_registro_id)");
      const gateIdx = antes.lastIndexOf("public._visita_scope_ok(v_uid, p_registro_id)");
      const leituraIdx = antes.lastIndexOf("FROM public.registros_consultor");
      expect(leituraIdx, "leitura do registro antes do gate").toBeLessThan(gateIdx);
    }
    // rpc_salvar_campo_visita: a autorização precede a revelação de inexistência
    const salvar = fw.slice(fw.indexOf("FUNCTION public.rpc_salvar_campo_visita("));
    const permIdx = salvar.indexOf("RAISE EXCEPTION 'sem_permissao'");
    const notFoundIdx = salvar.indexOf("RAISE EXCEPTION 'registro_nao_encontrado'");
    expect(permIdx).toBeGreaterThan(-1);
    expect(notFoundIdx).toBeGreaterThan(permIdx);
  });

  it("o rollback restaura o padrão anterior (leitura/assert antes da autorização)", () => {
    expect(rb).toContain("_assert_visita_editavel");
    expect(rb).not.toContain("_visita_scope_ok(v_uid");
    const salvar = rb.slice(rb.indexOf("FUNCTION public.rpc_salvar_campo_visita("));
    expect(salvar.indexOf("RAISE EXCEPTION 'registro_nao_encontrado'")).toBeLessThan(
      salvar.indexOf("RAISE EXCEPTION 'sem_permissao'"),
    );
  });

  it("mantém search_path fixo e menor privilégio, sem PUBLIC/anon", () => {
    for (const sql of [fw, rb]) {
      expect(sql).toContain("SET search_path TO 'public'");
      expect(sql).not.toMatch(/GRANT[^;]*\b(PUBLIC|anon)\b/);
    }
    expect(fw).toContain("REVOKE ALL ON FUNCTION public._visita_scope_ok(uuid,uuid) FROM PUBLIC");
    expect(fw).toContain("GRANT EXECUTE ON FUNCTION public._visita_scope_ok(uuid,uuid) TO service_role");
    expect(fw).not.toContain("GRANT EXECUTE ON FUNCTION public._visita_scope_ok(uuid,uuid) TO authenticated");
    // Default privileges do schema public concedem EXECUTE a anon/authenticated. A revogação
    // explícita NÃO pertence a este artefato histórico: ela foi aplicada como hotfix não
    // versionado sob a mesma versão e só foi regularizada, de forma versionada, pela
    // 20261018000000 (ver bloco H9-D-L6R abaixo).
    expect(fw).not.toContain("public._visita_scope_ok(uuid,uuid) FROM anon");
    expect(fw).not.toContain("public._visita_scope_ok(uuid,uuid) FROM authenticated");
  });

  it("não introduz mensagens novas que sirvam de oráculo de existência", () => {
    const novas = ["nao_encontrada", "not_found", "inexistente"];
    const gateBlocks = fw.split("_visita_scope_ok(v_uid, p_registro_id) THEN")[1] ?? "";
    for (const n of novas) expect(gateBlocks.slice(0, 200)).not.toContain(n);
    expect(fw).toContain("RAISE EXCEPTION 'forbidden_visita_nao_atribuido' USING ERRCODE = '42501'");
    expect(fw).toContain("RAISE EXCEPTION 'forbidden_visita' USING ERRCODE = '42501'");
  });

  it("nenhum artefato do lote cita produção como alvo de execução", () => {
    for (const p of [
      FW_PATH,
      RB_PATH,
      "restoration/homologacao-h9/h9d-inventario/dossie-l6.json",
      "restoration/homologacao-h9/h9d-inventario/decisoes-l6.json",
    ]) {
      const txt = read(p);
      expect(txt).toContain("ikaauvsflpmamgxmkhoq");
      const prod = txt.split("navfzbwgwzruipouyfnk");
      // só pode aparecer como declaração de proibição, nunca como alvo
      for (let i = 1; i < prod.length; i++) {
        expect(prod[i - 1].toLowerCase()).toMatch(/proibid|proibida|nunca/);
      }
    }
  });
});

/**
 * H9-D-L6R — retificação obrigatória:
 *  1) a 20261017000000 permanece imutável, com o conteúdo histórico da PRIMEIRA aplicação
 *     (sem o REVOKE explícito de anon/authenticated acrescentado depois como hotfix);
 *  2) a 20261018000000 regulariza esse REVOKE de forma versionada e corrige o defeito
 *     funcional vivo do checkout (`client_uuid = p_client_uuid::text` contra coluna uuid).
 */
const FW_L6R =
  "restoration/homologacao-h9/h9d-forwards/20261018000000_h9dl6r_acl_and_checkout_uuid_fix_v1.sql";
const RB_L6R =
  "restoration/homologacao-h9/h9d-rollbacks/20261018000000_h9dl6r_acl_and_checkout_uuid_fix_v1_rollback.sql";
const CHECKOUT_SIG =
  "public.rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamp with time zone,text)";

describe("H9-D-L6R — cadeia 20261017000000 histórica + 20261018000000 retificadora", () => {
  const fw170 = read(FW_PATH);
  const fw180 = read(FW_L6R);
  const rb180 = read(RB_L6R);

  it("a sequência de forwards aplicados é 170 e depois 180, sem reaplicação", () => {
    const versions = manifest.entries.map((e) => e.version);
    expect(versions.filter((v) => v === "20261017000000")).toHaveLength(1);
    expect(versions.filter((v) => v === "20261018000000")).toHaveLength(1);
    expect(versions.indexOf("20261018000000")).toBe(versions.indexOf("20261017000000") + 1);
    expect(versions.indexOf("20261018000000")).toBe(versions.indexOf("20261019000000") - 1);
    expect(manifest.ledger_versoes).toBe(684);
    expect(manifest.total_applied_forwards).toBe(19);
    expect(resumo.forwards_aplicados).toContain("20261018000000");
    expect(resumo.lotes_auditados).toContain("H9-D-L6R");
  });

  it("a 170 é o artefato histórico: sem REVOKE explícito de anon/authenticated no helper", () => {
    expect(fw170).toContain("REVOKE ALL ON FUNCTION public._visita_scope_ok(uuid,uuid) FROM PUBLIC;");
    expect(fw170).not.toContain("public._visita_scope_ok(uuid,uuid) FROM anon");
    expect(fw170).not.toContain("public._visita_scope_ok(uuid,uuid) FROM authenticated");
    expect(fw170).toContain("GRANT EXECUTE ON FUNCTION public._visita_scope_ok(uuid,uuid) TO service_role;");
  });

  it("o incidente de hotfix não versionado está documentado, não escondido", () => {
    const entry170 = manifest.entries.find((e) => e.version === "20261017000000") as
      | Record<string, string>
      | undefined;
    expect(entry170!.incidente_rastreabilidade).toMatch(/MESMA versao|MESMA versão/);
    expect(entry170!.incidente_rastreabilidade).toContain("20261018000000");
    expect(String(dossie.incidente_rastreabilidade)).toContain("20261018000000");
  });

  it("a 180 regulariza a ACL do helper com revogação explícita e grant mínimo", () => {
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(fw180).toContain(`REVOKE ALL ON FUNCTION public._visita_scope_ok(uuid,uuid) FROM ${role};`);
    }
    expect(fw180).toContain("GRANT EXECUTE ON FUNCTION public._visita_scope_ok(uuid,uuid) TO service_role;");
    expect(fw180).not.toMatch(/GRANT[^;]*_visita_scope_ok[^;]*\b(PUBLIC|anon|authenticated)\b/);
  });

  it("a 180 corrige a comparação do checkout para uuid = uuid", () => {
    const body = fw180.slice(fw180.indexOf("CREATE OR REPLACE FUNCTION public.rpc_realizar_checkout_visita("));
    expect(body).not.toContain("client_uuid = p_client_uuid::text");
    expect(body).toContain("WHERE client_uuid = p_client_uuid LIMIT 1");
    // gate de escopo antes da leitura da visita é preservado
    const gateIdx = body.indexOf("public._visita_scope_ok(v_uid, p_registro_id)");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(body.indexOf("public._assert_visita_editavel(p_registro_id)"));
    // assinatura, retorno e search_path preservados
    expect(fw180).toContain("SET search_path TO 'public'");
    expect(fw180).toContain("RETURNS jsonb");
    expect(fw180).toContain(`GRANT EXECUTE ON FUNCTION ${CHECKOUT_SIG} TO authenticated, service_role;`);
  });

  it("o rollback da 180 é fiel ao pré-180 e não reintroduz privilégio inseguro", () => {
    // volta ao defeito conhecido, sem inventar estado novo
    expect(rb180).toContain("client_uuid = p_client_uuid::text");
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(rb180).toContain(`REVOKE ALL ON FUNCTION public._visita_scope_ok(uuid,uuid) FROM ${role};`);
    }
    expect(rb180).not.toMatch(/GRANT[^;]*_visita_scope_ok[^;]*\b(PUBLIC|anon|authenticated)\b/);
    expect(rb180).not.toMatch(/GRANT[^;]*\b(PUBLIC|anon)\b/);
    expect(rb180.trim().endsWith("COMMIT;")).toBe(true);
  });

  it("hashes reais da 170 histórica e da 180 batem com o manifesto e o dossiê", () => {
    const e170 = manifest.entries.find((e) => e.version === "20261017000000")!;
    const e180 = manifest.entries.find((e) => e.version === "20261018000000")!;
    expect(e170.sha256).toBe(sha256(FW_PATH));
    expect(e180.sha256).toBe(sha256(FW_L6R));
    expect(e180.rollback_sha256).toBe(sha256(RB_L6R));
    expect(String(dossie.forward_l6r_sha256)).toBe(sha256(FW_L6R));
    expect(String(dossie.rollback_l6r_sha256)).toBe(sha256(RB_L6R));
    expect(e170.applied_at).toBe("2026-09-09");
    expect(e180.applied_at).toBe("2026-09-09");
  });
});

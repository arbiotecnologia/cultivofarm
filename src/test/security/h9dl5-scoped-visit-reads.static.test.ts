import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-D-L5 — gate estático do lote de 30 assinaturas `SECURITY DEFINER` e da correção
 * reversível 20261016000000 (homologação `ikaauvsflpmamgxmkhoq`, ledger 671 -> 672).
 *
 * O gate cobre:
 *   - a lista exata das 30 assinaturas canônicas do lote, sem substituição/omissão;
 *   - coerência dossiê <-> inventário (classificação, md5 vivo, evidência do lote);
 *   - fingerprints vivos e SHA256 do forward/rollback contra o manifesto de applied-forwards;
 *   - consulta escopada ANTES da leitura nas três funções corrigidas;
 *   - ACL sem PUBLIC/anon e `search_path` fixo no forward;
 *   - ausência de mensagens distintas entre recurso inexistente e recurso alheio.
 */
const ROOT = resolve(__dirname, "../../..");
const DIR = resolve(ROOT, "restoration/homologacao-h9/h9d-inventario");
const FORWARD = resolve(
  ROOT,
  "restoration/homologacao-h9/h9d-forwards/20261016000000_h9dl5_authz_scoped_visit_reads_no_oracle_v1.sql",
);
const ROLLBACK = resolve(
  ROOT,
  "restoration/homologacao-h9/h9d-rollbacks/20261016000000_h9dl5_authz_scoped_visit_reads_no_oracle_v1_rollback.sql",
);

type Assinatura = {
  definition_md5: string;
  definition_len: number;
  acl: string;
  proconfig: string;
  volatilidade: string;
  guarda_textual: string;
  cadeia_transitiva: string;
  null_fail_closed: string;
  tenant_bola_idor: string;
  sql_dinamico: string;
  callsites: string;
  classificacao: string;
  observacao?: string;
};

const dossie = JSON.parse(readFileSync(resolve(DIR, "dossie-l5.json"), "utf8")) as {
  ambiente: string;
  ledger: number;
  ultima_migration: string;
  lote: string;
  total: number;
  fingerprint_forward: string;
  fingerprint_rollback: string;
  fonte_hash_sql: string;
  resumo_classificacao: Record<string, number>;
  assinaturas: Record<string, Assinatura>;
};

const resumo = JSON.parse(readFileSync(resolve(DIR, "resumo-h9d.json"), "utf8")) as {
  ledger: number;
  lotes_auditados: string[];
  forwards_aplicados: string[];
  por_classificacao: Record<string, number>;
};

const manifest = JSON.parse(
  readFileSync(resolve(ROOT, "restoration/homologacao-h9/h9c-applied-forwards.json"), "utf8"),
) as {
  ledger_versoes: number;
  total_applied_forwards: number;
  entries: { version: string; sha256: string; rollback_sha256: string; registered_in_ledger: boolean }[];
};

const tsv = readFileSync(resolve(DIR, "secdef-authenticated-inventory-h9d.tsv"), "utf8").trim().split("\n");
const header = tsv[0].split("\t");
const rows = tsv.slice(1).map((l) => Object.fromEntries(l.split("\t").map((v, i) => [header[i], v])));

const forwardSql = readFileSync(FORWARD, "utf8");
const rollbackSql = readFileSync(ROLLBACK, "utf8");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const L5_ESPERADAS: readonly string[] = [
  "rpc_entrega_gerar_termo_v1(uuid,text)",
  "rpc_entrega_reconciliar_v1(uuid,text)",
  "rpc_entrega_reentrega_saldo_v1(uuid,text)",
  "rpc_enviar_visita_aprovacao(uuid,integer)",
  "rpc_estoque_operar_v1(text,uuid,numeric,text,jsonb)",
  "rpc_executivo_alertas_prioridades(jsonb,integer)",
  "rpc_executivo_alertas_resumo(jsonb)",
  "rpc_executivo_cliente_detalhe(uuid,jsonb)",
  "rpc_executivo_clientes_ranking(jsonb,integer)",
  "rpc_executivo_clientes_resumo(jsonb)",
  "rpc_executivo_fazenda_detalhe(uuid,jsonb)",
  "rpc_executivo_financeiro_ranking_clientes(jsonb,integer)",
  "rpc_executivo_financeiro_resumo(jsonb)",
  "rpc_executivo_gargalos(jsonb,integer)",
  "rpc_executivo_listar_relatorios(jsonb)",
  "rpc_executivo_plano_acao(jsonb,integer)",
  "rpc_executivo_responsaveis_pendencias(jsonb,integer)",
  "rpc_executivo_resumo_geral(jsonb)",
  "rpc_executivo_timeline_operacional(jsonb,integer)",
  "rpc_fiscal_homologation_readiness()",
  "rpc_fiscal_item_readiness(text,uuid)",
  "rpc_fiscal_sefaz_transmission_status_v1(uuid)",
  "rpc_fiscal_xml_status_v1(uuid)",
  "rpc_force_checkout_visita(uuid,uuid,text)",
  "rpc_gerar_etiqueta_produto(jsonb)",
  "rpc_gerar_formulario_entrega(uuid)",
  "rpc_get_comprovante_entrega_data(uuid,boolean)",
  "rpc_get_my_visit_by_client_uuid(uuid)",
  "rpc_get_visita_workspace(uuid)",
  "rpc_listar_atendimentos_tecnicos_v1(text,text,integer,integer)",
] as const;

const CORRIGIDAS = [
  "rpc_enviar_visita_aprovacao(uuid,integer)",
  "rpc_get_visita_workspace(uuid)",
  "rpc_get_my_visit_by_client_uuid(uuid)",
] as const;

describe("H9-D-L5 — dossiê do lote de 30 assinaturas", () => {
  const chaves = Object.keys(dossie.assinaturas);
  const inventario = new Map(rows.map((r) => [r.signature, r]));

  it("declara homologação, ledger 679 no resumo e a última migration do lote", () => {
    expect(dossie.ambiente).toBe("ikaauvsflpmamgxmkhoq");
    expect(dossie.ledger).toBe(672);
    expect(dossie.ultima_migration).toBe("20261016000000");
    expect(dossie.lote).toBe("H9-D-L5");
    expect(resumo.ledger).toBe(679);
    expect(resumo.lotes_auditados).toContain("H9-D-L5");
    expect(resumo.forwards_aplicados).toContain("20261016000000");
  });

  it("contém exatamente as 30 assinaturas canônicas do lote, sem substituição nem omissão", () => {
    expect(dossie.total).toBe(30);
    expect(chaves).toHaveLength(30);
    expect(new Set(chaves).size).toBe(30);
    expect([...chaves].sort()).toEqual([...L5_ESPERADAS].sort());
  });

  it("toda chave é assinatura canônica completa, existe no inventário e está no escopo profundo", () => {
    for (const k of chaves) {
      expect(k, `chave sem lista de argumentos: ${k}`).toMatch(/^[a-z0-9_]+\(.*\)$/);
      expect(inventario.has(k), `assinatura ausente do inventário: ${k}`).toBe(true);
      expect(inventario.get(k)!.escopo_h9d).toBe("ESCOPO_PROFUNDO_H9D");
    }
  });

  it("não há promoção por nome: sobrecargas fora do lote não herdam a evidência do L5", () => {
    for (const k of chaves) {
      const nome = k.slice(0, k.indexOf("("));
      for (const r of rows.filter((x) => x.signature.startsWith(`${nome}(`) && x.signature !== k)) {
        expect(r.evidencia.includes("Lote H9-D-L5"), `colisão por overload em ${r.signature}`).toBe(false);
      }
    }
  });

  it("cada assinatura tem fingerprint vivo, ACL sem anon e search_path fixo", () => {
    for (const [k, d] of Object.entries(dossie.assinaturas)) {
      expect(d.definition_md5, k).toMatch(/^[0-9a-f]{32}$/);
      expect(d.definition_len, k).toBeGreaterThan(100);
      expect(d.acl, k).toContain("authenticated");
      expect(d.acl, k).not.toContain("anon=");
      expect(d.proconfig, k).toContain("search_path");
      expect(["STABLE", "VOLATILE", "IMMUTABLE"]).toContain(d.volatilidade);
    }
  });

  it("cada assinatura tem evidência específica de guarda, cadeia, escopo e callsites", () => {
    for (const [k, d] of Object.entries(dossie.assinaturas)) {
      expect(["AUTH_COMPROVADA", "EXPOSICAO_COMPROVADA_CORRIGIDA"], k).toContain(d.classificacao);
      expect(d.guarda_textual.length, k).toBeGreaterThan(40);
      expect(d.cadeia_transitiva.length, k).toBeGreaterThan(40);
      expect(d.null_fail_closed.length, k).toBeGreaterThan(20);
      expect(d.tenant_bola_idor.length, k).toBeGreaterThan(40);
      expect(d.sql_dinamico.length, k).toBeGreaterThan(10);
      expect(d.callsites.length, k).toBeGreaterThan(20);
      expect(d.guarda_textual.includes("delegação a função guardada"), k).toBe(false);
    }
  });

  it("o resumo do dossiê é derivado e fecha em 27 AUTH + 3 corrigidas", () => {
    const derivado = chaves.reduce<Record<string, number>>((acc, k) => {
      const c = dossie.assinaturas[k].classificacao;
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {});
    expect(derivado).toEqual(dossie.resumo_classificacao);
    expect(derivado.AUTH_COMPROVADA).toBe(27);
    expect(derivado.EXPOSICAO_COMPROVADA_CORRIGIDA).toBe(3);
  });

  it("o inventário reflete o dossiê nas 30 assinaturas", () => {
    for (const k of chaves) {
      const r = inventario.get(k)!;
      expect(r.classificacao_h9d, k).toBe(dossie.assinaturas[k].classificacao);
      expect(r.evidencia, k).toContain("Lote H9-D-L5");
      expect(r.evidencia, k).toContain(dossie.assinaturas[k].definition_md5);
      expect(r.body_md5, k).toBe(dossie.assinaturas[k].definition_md5);
      expect(Number(r.body_len), k).toBe(dossie.assinaturas[k].definition_len);
    }
  });

  it("os totais do inventário permanecem derivados de 376 linhas", () => {
    expect(rows).toHaveLength(376);
    const cont = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.classificacao_h9d] = (acc[r.classificacao_h9d] ?? 0) + 1;
      return acc;
    }, {});
    expect(cont.HERDADA_H9C).toBe(84);
    // totais acumulados após a retificação H9-E1R (a L5 encerrou em 231/26/4/31)
    expect(cont.AUTH_COMPROVADA).toBe(256);
    expect(cont.EXPOSICAO_COMPROVADA_CORRIGIDA).toBe(32);
    expect(cont.NAO_APLICAVEL).toBe(4);
    expect(cont.PENDENTE_EVIDENCIA ?? 0).toBe(0);
    expect(resumo.por_classificacao).toEqual({
      AUTH_COMPROVADA: 256,
      EXPOSICAO_COMPROVADA_CORRIGIDA: 32,
      NAO_APLICAVEL: 4,
      PENDENTE_EVIDENCIA: 0,
    });
  });
});

describe("H9-D-L5 — forward reversível 20261016000000", () => {
  const entry = manifest.entries.find((e) => e.version === "20261016000000");

  it("está rastreado no manifesto de applied-forwards com ledger 679", () => {
    expect(manifest.ledger_versoes).toBe(683);
    expect(manifest.total_applied_forwards).toBe(19);
    expect(manifest.entries).toHaveLength(manifest.total_applied_forwards);
    expect(entry).toBeTruthy();
    expect(entry!.registered_in_ledger).toBe(true);
  });

  it("o SHA256 do forward e do rollback confere com o manifesto", () => {
    expect(sha256(forwardSql)).toBe(entry!.sha256);
    expect(sha256(rollbackSql)).toBe(entry!.rollback_sha256);
  });

  it("declara os fingerprints vivos do conjunto corrigido", () => {
    expect(dossie.fingerprint_forward).toMatch(/^[0-9a-f]{32}$/);
    expect(dossie.fingerprint_rollback).toMatch(/^[0-9a-f]{32}$/);
    expect(dossie.fingerprint_forward).not.toBe(dossie.fingerprint_rollback);
    expect(dossie.fonte_hash_sql).toContain("md5(pg_get_functiondef(p.oid))");
  });

  it("recria as três funções com search_path fixo e sem GRANT a PUBLIC/anon", () => {
    for (const fn of ["rpc_enviar_visita_aprovacao", "rpc_get_visita_workspace", "rpc_get_my_visit_by_client_uuid"]) {
      expect(forwardSql).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`);
      expect(rollbackSql).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`);
    }
    expect(forwardSql).toContain("SET search_path TO 'public'");
    expect(forwardSql).not.toMatch(/GRANT[^;]*\b(PUBLIC|anon)\b/);
    expect(forwardSql).toMatch(/REVOKE[^;]*\bPUBLIC\b/);
  });

  it("autoriza em consulta escopada antes da leitura do recurso, em cada função", () => {
    expect(forwardSql).toContain("has_active_user_cliente_access");
    expect(forwardSql).toContain("can_view_technical_visit");
    expect(forwardSql).toContain("auth.uid()");

    const blocos = forwardSql
      .split(/CREATE OR REPLACE FUNCTION /)
      .slice(1)
      .filter((b) => /^public\.rpc_(enviar_visita_aprovacao|get_visita_workspace|get_my_visit_by_client_uuid)\b/.test(b));
    expect(blocos).toHaveLength(3);

    const AUTORIZACAO = [
      "can_view_technical_visit",
      "has_active_user_cliente_access",
      "consultor_responsavel = v_uid",
      "created_by = v_uid",
      "v_is_admin",
    ];
    for (const bloco of blocos) {
      const idx = bloco.search(/FROM\s+public\.registros_consultor/i);
      expect(idx, "nenhuma leitura do recurso encontrada no bloco").toBeGreaterThan(0);
      const fimStatement = bloco.indexOf(";", idx);
      // tudo o que precede a leitura + o próprio statement de leitura (predicado escopado)
      const trecho = bloco.slice(0, fimStatement > 0 ? fimStatement : idx);
      expect(
        AUTORIZACAO.some((m) => trecho.includes(m)),
        "leitura de registros_consultor sem autorização prévia nem predicado escopado",
      ).toBe(true);
      // a guarda de sessão sempre precede a leitura
      expect(trecho).toContain("auth.uid()");
    }
  });

  it("elimina as mensagens que revelavam existência do recurso", () => {
    for (const msg of ["registro_nao_encontrado", "registro_inexistente"]) {
      expect(forwardSql.includes(msg), `mensagem de oráculo presente no forward: ${msg}`).toBe(false);
      expect(rollbackSql.includes(msg), `rollback deve preservar o estado anterior: ${msg}`).toBe(true);
    }
    // o rollback restaura o par distinguível 'forbidden' vs 'not_found'
    expect(rollbackSql).toContain("'forbidden'");
    expect(forwardSql).not.toContain("'forbidden'");
  });

  it("o dossiê registra prova antes/depois indistinguível para as três funções", () => {
    for (const k of CORRIGIDAS) {
      const d = dossie.assinaturas[k];
      expect(d.classificacao).toBe("EXPOSICAO_COMPROVADA_CORRIGIDA");
      expect(d.observacao ?? "").toContain("20261016000000");
      expect(d.tenant_bola_idor).toContain("Sem oraculo de existencia");
      expect(d.tenant_bola_idor).toContain("identico");
    }
  });
});

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-D-L7 — gate estático do fechamento da última assinatura pendente do H9-D:
 * public.start_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,text,uuid).
 *
 * Homologação `ikaauvsflpmamgxmkhoq`, ledger 674 -> 675 pelo forward reversível
 * 20261019000000. Produção `navfzbwgwzruipouyfnk` nunca é alvo.
 *
 * Cobre: dossiê/decisões com exatamente 1 assinatura, fingerprint vivo, autorização
 * antes de qualquer leitura, idempotência escopada, ausência de oráculo de existência,
 * rollback fiel ao pré-L7, ACL sem PUBLIC/anon, search_path fixo, manifesto/hashes/ledger
 * coerentes e inventário H9-D fechado sem pendências.
 */
const ROOT = resolve(__dirname, "../../..");
const DIR = resolve(ROOT, "restoration/homologacao-h9/h9d-inventario");
const SIG = "start_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,text,uuid)";
const FW_PATH =
  "restoration/homologacao-h9/h9d-forwards/20261019000000_h9dl7_start_visit_scope_and_idempotency_v1.sql";
const RB_PATH =
  "restoration/homologacao-h9/h9d-rollbacks/20261019000000_h9dl7_start_visit_scope_and_idempotency_v1_rollback.sql";

const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const sha256 = (p: string) => createHash("sha256").update(readFileSync(resolve(ROOT, p))).digest("hex");

const dossie = JSON.parse(readFileSync(resolve(DIR, "dossie-l7.json"), "utf8")) as Record<string, any>;
const decisoes = JSON.parse(readFileSync(resolve(DIR, "decisoes-l7.json"), "utf8")) as Record<string, any>;
const resumo = JSON.parse(readFileSync(resolve(DIR, "resumo-h9d.json"), "utf8")) as {
  ledger: number;
  total_bruto: number;
  fora_escopo_h9d: number;
  escopo_h9d: number;
  por_classificacao: Record<string, number>;
  lotes_auditados: string[];
  forwards_aplicados: string[];
};
const manifest = JSON.parse(
  readFileSync(resolve(ROOT, "restoration/homologacao-h9/h9c-applied-forwards.json"), "utf8"),
) as { ledger_versoes: number; total_applied_forwards: number; entries: Record<string, any>[] };
const h7p = JSON.parse(
  readFileSync(resolve(ROOT, "restoration/homologacao-h7/h7p-repo-only-manifest.json"), "utf8"),
) as { ledger_versoes: number; total_repo_only: number };

const invLines = read("restoration/homologacao-h9/h9d-inventario/secdef-authenticated-inventory-h9d.tsv")
  .trim()
  .split("\n");
const invHeader = invLines[0].split("\t");
const invRows = invLines.slice(1).map((l) => {
  const c = l.split("\t");
  return Object.fromEntries(invHeader.map((h, i) => [h, c[i]])) as Record<string, string>;
});
const clsRows = read("restoration/homologacao-h9/h9d-inventario/classificacao-h9d.tsv")
  .trim()
  .split("\n")
  .slice(1)
  .map((l) => l.split("\t"));

describe("H9-D-L7 — dossiê da assinatura única", () => {
  it("declara homologação, ledger 679 e a migration do lote", () => {
    for (const d of [dossie, decisoes]) {
      expect(d.ambiente).toBe("ikaauvsflpmamgxmkhoq");
      expect(d.producao_proibida).toBe("navfzbwgwzruipouyfnk");
      expect(d.lote).toBe("H9-D-L7");
      expect(d.ledger).toBe(675);
      expect(d.ultima_migration).toBe("20261019000000");
      expect(d.total).toBe(1);
    }
  });

  it("cobre exatamente uma assinatura canônica, classificada por evidência", () => {
    expect(Object.keys(dossie.assinaturas)).toEqual([SIG]);
    expect(Object.keys(decisoes.assinaturas)).toEqual([SIG]);
    const e = dossie.assinaturas[SIG];
    expect(e.classificacao).toBe("EXPOSICAO_COMPROVADA_CORRIGIDA");
    expect(e.guarda_textual.length).toBeGreaterThan(60);
    expect(e.cadeia_transitiva).toContain("_visita_scope_ok");
    expect(e.callsites.length).toBeGreaterThan(10);
    expect(e.prova_individual).toMatch(/indistinguiveis|indistinguíveis/i);
    expect(e.prova_individual).toMatch(/[Rr]es[ií]duo zero/);
  });

  it("registra fingerprint vivo, ACL mínima e search_path fixo", () => {
    const f = dossie.assinaturas[SIG].fingerprint_vivo;
    expect(f.definition_md5).toMatch(/^[0-9a-f]{32}$/);
    expect(f.functiondef_md5).toMatch(/^[0-9a-f]{32}$/);
    expect(f.functiondef_md5).not.toBe(f.functiondef_md5_pre_l7);
    expect(f.definition_len).toBeGreaterThan(100);
    expect(f.security_definer).toBe(true);
    expect(f.owner).toBe("postgres");
    expect(f.overloads).toBe(1);
    expect(f.proconfig).toContain("search_path=public");
    expect(f.acl).not.toContain("anon=");
    expect(f.acl).toContain("authenticated=X/postgres");
    expect(f.acl).toContain("service_role=X/postgres");
  });

  it("documenta o incidente de preflight sem esconder o ocorrido", () => {
    expect(String(dossie.incidente_preflight)).toMatch(/BEGIN\/COMMIT/);
    expect(String(dossie.incidente_preflight)).toMatch(/ledger/i);
  });
});

describe("H9-D-L7 — forward e rollback", () => {
  const fw = read(FW_PATH);
  const rb = read(RB_PATH);

  it("o forward autoriza antes de qualquer leitura e escopa a idempotência", () => {
    expect(fw).toContain("CREATE OR REPLACE FUNCTION public.start_technical_visit_secure");
    expect(fw).toContain("SET search_path TO 'public'");
    expect(fw).toContain("SECURITY DEFINER");
    expect(fw).toContain("public._visita_scope_ok(v_uid, p_registro_id)");
    expect(fw).toContain("consultor_id = v_uid");
    // autorização precede a leitura de idempotência e a leitura de registros_consultor
    const iScope = fw.indexOf("_visita_scope_ok(v_uid, p_registro_id)");
    const iIdem = fw.indexOf("FROM public.visitas_checkin");
    const iReg = fw.indexOf("FROM public.registros_consultor");
    expect(iScope).toBeGreaterThan(0);
    expect(iScope).toBeLessThan(iIdem);
    expect(iScope).toBeLessThan(iReg);
    // idempotência nunca mais é global por client_uuid
    expect(fw).not.toMatch(/WHERE client_uuid = p_client_uuid LIMIT 1/);
  });

  it("o forward mantém ACL mínima na assinatura completa de 9 argumentos", () => {
    const full = "public.start_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,text,uuid)";
    expect(fw).toContain(`REVOKE ALL ON FUNCTION ${full} FROM PUBLIC;`);
    expect(fw).toContain(`REVOKE ALL ON FUNCTION ${full} FROM anon;`);
    expect(fw).toContain(`GRANT EXECUTE ON FUNCTION ${full} TO authenticated, service_role;`);
    expect(fw).not.toMatch(/GRANT[^;]*TO[^;]*\banon\b/);
    expect(fw).not.toMatch(/GRANT[^;]*TO[^;]*PUBLIC/);
  });

  it("o rollback é exato para o estado pré-L7 e não afrouxa ACL nem ledger", () => {
    expect(rb).toContain("CREATE OR REPLACE FUNCTION public.start_technical_visit_secure");
    // restaura a definição anterior, com os defeitos documentados
    expect(rb).toContain("WHERE client_uuid = p_client_uuid LIMIT 1");
    expect(rb).toContain("registro_not_found");
    expect(rb).not.toContain("_visita_scope_ok");
    expect(rb).not.toMatch(/GRANT[^;]*TO[^;]*\banon\b/);
    expect(rb).not.toMatch(/GRANT[^;]*TO[^;]*PUBLIC/);
    for (const sql of [fw, rb]) {
      expect(sql).not.toMatch(/supabase_migrations\.schema_migrations/);
      expect(sql).not.toContain("navfzbwgwzruipouyfnk");
      expect(sql).not.toContain("yzszlzjpovmcteuxjznj");
    }
  });

  it("está rastreado no manifesto com hashes reais e ledger 679", () => {
    const entry = manifest.entries.find((e) => e.version === "20261019000000");
    expect(entry, "forward não rastreado no manifesto").toBeTruthy();
    expect(entry!.sha256).toBe(sha256(FW_PATH));
    expect(entry!.rollback_sha256).toBe(sha256(RB_PATH));
    expect(entry!.applied_to_staging).toBe(true);
    expect(entry!.registered_in_ledger).toBe(true);
    expect(entry!.repo_only_quarantined).toBe(false);
    expect(entry!.reversible).toBe(true);
    expect(entry!.destructive).toBe(false);
    expect(entry!.applied_at).toBe("2026-09-09");
    expect(dossie.forward_sha256).toBe(sha256(FW_PATH));
    expect(dossie.rollback_sha256).toBe(sha256(RB_PATH));
    expect(manifest.ledger_versoes).toBe(683);
    expect(manifest.total_applied_forwards).toBe(manifest.entries.length);
    expect(manifest.total_applied_forwards).toBe(19);
    expect(h7p.ledger_versoes).toBe(683);
    expect(h7p.total_repo_only).toBe(59);
  });

  it("as migrations 170 e 180 permanecem fechadas e intocadas", () => {
    for (const v of ["20261017000000", "20261018000000"]) {
      const es = manifest.entries.filter((e) => e.version === v);
      expect(es, v).toHaveLength(1);
      expect(es[0].registered_in_ledger).toBe(true);
    }
    const versions = manifest.entries.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.filter((v) => v > "20261019000000")).toEqual([
      "20261020000000",
      "20261021000000",
      "20261022000000",
      // H9-E2: forward posterior, monotônico, sem reabrir 170/180.
      "20261023000000",
    ]);
  });
});

describe("H9-D — fechamento sem pendências", () => {
  it("o inventário concorda com o dossiê na assinatura da L7", () => {
    const row = invRows.find((r) => r.signature === SIG);
    expect(row, "assinatura ausente no inventário").toBeTruthy();
    expect(row!.classificacao_h9d).toBe("EXPOSICAO_COMPROVADA_CORRIGIDA");
    expect(row!.body_md5).toBe(dossie.assinaturas[SIG].fingerprint_vivo.definition_md5);
    expect(row!.evidencia).toContain("H9-D-L7");
    expect(row!.evidencia).toContain("20261019000000");
    const cls = clsRows.find((c) => c[0] === SIG);
    expect(cls, "assinatura ausente na classificação").toBeTruthy();
    expect(cls![2]).toBe("EXPOSICAO_COMPROVADA_CORRIGIDA");
  });

  it("nenhuma assinatura permanece PENDENTE_EVIDENCIA", () => {
    expect(invRows.filter((r) => r.classificacao_h9d === "PENDENTE_EVIDENCIA")).toHaveLength(0);
    expect(clsRows.filter((c) => c[2] === "PENDENTE_EVIDENCIA")).toHaveLength(0);
    expect(resumo.por_classificacao.PENDENTE_EVIDENCIA).toBe(0);
  });

  it("o inventário fecha por derivação em 376 = 84 herdadas + 292 do escopo profundo", () => {
    expect(invRows).toHaveLength(376);
    expect(clsRows).toHaveLength(376);
    expect(resumo.total_bruto).toBe(376);
    expect(resumo.fora_escopo_h9d).toBe(84);
    expect(resumo.escopo_h9d).toBe(292);
    expect(clsRows.filter((c) => c[2] === "HERDADA_H9C")).toHaveLength(84);
    const soma = Object.values(resumo.por_classificacao).reduce((a, b) => a + b, 0);
    expect(soma).toBe(292);
    expect(resumo.ledger).toBe(679);
    expect(resumo.lotes_auditados).toContain("H9-D-L7");
    expect(resumo.forwards_aplicados).toContain("20261019000000");
  });

  it("as assinaturas canônicas do inventário são únicas", () => {
    const sigs = invRows.map((r) => r.signature);
    expect(new Set(sigs).size).toBe(sigs.length);
  });
});

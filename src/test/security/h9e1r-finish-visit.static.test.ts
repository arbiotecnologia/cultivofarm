import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-E1R — gate estático da retificação de
 * `public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid)`.
 *
 * O dossiê H9-E1 afirmou que registro alheio e UUID inexistente eram indistinguíveis
 * nessa RPC, e o inventário H9-D a classificava como AUTH_COMPROVADA. Ambas as
 * afirmações eram falsas: o `SELECT` em `registros_consultor` precedia a prova de
 * escopo (oráculo de existência), o encerramento gravava `tipo_checkin='inicio_visita'`
 * e não havia idempotência por `client_uuid`.
 *
 * O forward `20261022000000` corrige os três pontos e foi aplicado uma única vez em
 * homologação (ledger 677 -> 678). Este gate trava o conteúdo do forward, do rollback,
 * do manifesto e da retificação do inventário.
 */

const ROOT = resolve(__dirname, "../../..");
const H9 = resolve(ROOT, "restoration/homologacao-h9");
const VERSION = "20261022000000";
const NAME = "h9e1r_finish_visit_scope_checkout_idempotency_v1";
const FORWARD = `restoration/homologacao-h9/h9e-forwards/${VERSION}_${NAME}.sql`;
const ROLLBACK = `restoration/homologacao-h9/h9e-rollbacks/${VERSION}_${NAME}_rollback.sql`;
const PROVA = `restoration/homologacao-h9/h9e-provas/h9e1r-prova-finish-visit.sql`;
const SIGNATURE =
  "finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid)";

const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const sha256 = (p: string) =>
  createHash("sha256").update(readFileSync(resolve(ROOT, p))).digest("hex");

const forward = read(FORWARD);
const rollback = read(ROLLBACK);
const prova = read(PROVA);

interface AppliedForward {
  version: string;
  name: string;
  path: string;
  sha256: string;
  rollback_path: string;
  rollback_sha256: string;
  applied_to_staging: boolean;
  registered_in_ledger: boolean;
  repo_only_quarantined: boolean;
  evidence_refs: Record<string, string>;
}
const manifest = JSON.parse(
  readFileSync(resolve(H9, "h9c-applied-forwards.json"), "utf8"),
) as { ledger_versoes: number; total_applied_forwards: number; entries: AppliedForward[] };

const inventario = readFileSync(
  resolve(H9, "h9d-inventario/secdef-authenticated-inventory-h9d.tsv"),
  "utf8",
)
  .trim()
  .split("\n");
const invHeader = inventario[0].split("\t");
const invRows = inventario.slice(1).map((l) =>
  Object.fromEntries(l.split("\t").map((v, i) => [invHeader[i], v])),
);

const resumo = JSON.parse(
  readFileSync(resolve(H9, "h9d-inventario/resumo-h9d.json"), "utf8"),
) as {
  ledger: number;
  por_classificacao: Record<string, number>;
  retificacoes: { assinatura: string; de: string; para: string; forward: string }[];
};

describe("H9-E1R — autorização antes da leitura no encerramento da visita", () => {
  it("o forward prova o escopo antes de qualquer leitura sensível", () => {
    const gate = forward.indexOf("_visita_scope_ok(v_uid, p_registro_id)");
    const leituraRegistro = forward.indexOf("FROM public.registros_consultor r\n   WHERE r.id = p_registro_id");
    const leituraClientUuid = forward.indexOf("WHERE client_uuid = p_client_uuid");
    expect(gate).toBeGreaterThan(0);
    expect(leituraRegistro).toBeGreaterThan(gate);
    expect(leituraClientUuid).toBeGreaterThan(gate);
  });

  it("não sobrou nenhuma superfície que revele existência de registro alheio", () => {
    const corpo = forward.slice(forward.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(corpo).not.toContain("registro_not_found");
    // As três negativas convergem para a mesma mensagem e o mesmo SQLSTATE.
    const ocorrencias = forward.match(/RAISE EXCEPTION 'not_visit_owner' USING ERRCODE = '42501'/g);
    expect(ocorrencias?.length).toBe(2);
  });

  it("o encerramento grava o tipo canônico de check-out", () => {
    expect(forward).toContain("'checkout'::public.tipo_checkin, 'realizado', p_client_uuid");
    expect(forward).not.toContain("'inicio_visita', 'realizado'");
  });

  it("a idempotência por client_uuid é fail-closed e vem depois do gate", () => {
    expect(forward).toContain("RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22023'");
    expect(forward).toContain("EXCEPTION WHEN unique_violation THEN");
    expect(forward).toContain("FOR UPDATE");
  });

  it("preserva assinatura, retorno, SECURITY DEFINER, search_path e ACL mínima", () => {
    expect(forward).toContain(
      "RETURNS TABLE(registro_id uuid, checkout_id uuid, finalized_at timestamp with time zone)",
    );
    expect(forward).toContain("SECURITY DEFINER");
    expect(forward).toContain("SET search_path TO 'public'");
    expect(forward).toContain("REVOKE ALL ON FUNCTION public.finish_technical_visit_secure");
    expect(forward).toContain("FROM PUBLIC;");
    expect(forward).toContain("FROM anon;");
    expect(forward).toContain("TO authenticated, service_role;");
  });

  it("forward e rollback não controlam transação (o executor externo controla)", () => {
    for (const [nome, sql] of [["forward", forward], ["rollback", rollback]] as const) {
      expect(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/mi.test(sql), `${nome} controla transação`).toBe(false);
    }
  });

  it("o rollback declara o fingerprint alvo e os impactos de reverter", () => {
    expect(rollback).toContain("1a23e69ad1909af5b6021d81fb9ed918");
    expect(rollback).toContain("IMPACTO DE EXECUTAR ESTE ROLLBACK");
    expect(rollback).toContain("registro_not_found");
    expect(rollback).toContain("'inicio_visita'");
  });

  it("a prova cobre os casos adversariais exigidos", () => {
    for (const caso of [
      "01-nao-autenticado",
      "02-uuid-inexistente",
      "03-registro-alheio",
      "04-dono-legitimo",
      "05-duplo-clique",
      "06-reuso-conflitante",
      "07-estado-incompativel",
      "08-sem-diagnostico",
      "09-sem-problema-principal",
      "10-administrador",
      "11-tipos-gravados",
      "12-checkout-do-encerramento",
      "13-ciclo-fechado-consumidores",
      "14-anon",
    ]) {
      expect(prova, `caso ausente: ${caso}`).toContain(caso);
    }
    expect(/^\s*(BEGIN|COMMIT)\s*;/mi.test(prova)).toBe(false);
  });
});

describe("H9-E1R — rastreabilidade no manifesto e no ledger", () => {
  const entry = manifest.entries.find((e) => e.version === VERSION)!;

  it("o manifesto registra a versão exatamente uma vez, no ledger 679", () => {
    expect(manifest.ledger_versoes).toBe(684);
    expect(manifest.entries.filter((e) => e.version === VERSION)).toHaveLength(1);
    expect(manifest.entries).toHaveLength(manifest.total_applied_forwards);
    expect(entry.name).toBe(NAME);
  });

  it("os hashes do manifesto conferem com os arquivos em disco", () => {
    expect(entry.path).toBe(FORWARD);
    expect(entry.rollback_path).toBe(ROLLBACK);
    expect(entry.sha256).toBe(sha256(FORWARD));
    expect(entry.rollback_sha256).toBe(sha256(ROLLBACK));
  });

  it("está aplicada em homologação e nunca em quarentena repo-only", () => {
    expect(entry.applied_to_staging).toBe(true);
    expect(entry.registered_in_ledger).toBe(true);
    expect(entry.repo_only_quarantined).toBe(false);
  });

  it("a evidência declara fingerprints, ledger e ausência de correção histórica", () => {
    expect(entry.evidence_refs.fingerprint).toContain("1a23e69ad1909af5b6021d81fb9ed918");
    expect(entry.evidence_refs.fingerprint).toContain("20515c14cf017e68bebc8f99ba3cd00a");
    expect(entry.evidence_refs.ledger).toContain("677 -> 678");
    expect(entry.evidence_refs.dados_historicos).toContain("nenhuma correcao historica aplicada");
  });
});

describe("H9-E1R — retificação do inventário H9-D", () => {
  const row = invRows.find((r) => r.signature === SIGNATURE)!;

  it("a assinatura deixa de ser AUTH_COMPROVADA e passa a corrigida", () => {
    expect(row).toBeTruthy();
    expect(row.classificacao_h9d).toBe("EXPOSICAO_COMPROVADA_CORRIGIDA");
    expect(row.evidencia).toContain("RETIFICACAO DE FALSO POSITIVO");
    expect(row.evidencia).toContain(VERSION);
  });

  it("os agregados refletem a retificação sem apagar o histórico", () => {
    expect(resumo.ledger).toBe(679);
    expect(resumo.por_classificacao.AUTH_COMPROVADA).toBe(256);
    expect(resumo.por_classificacao.EXPOSICAO_COMPROVADA_CORRIGIDA).toBe(32);
    expect(resumo.por_classificacao.NAO_APLICAVEL).toBe(4);
    expect(resumo.por_classificacao.PENDENTE_EVIDENCIA).toBe(0);
    const soma = Object.values(resumo.por_classificacao).reduce((a, b) => a + b, 0);
    expect(soma).toBe(292);

    const ret = resumo.retificacoes.find((r) => r.assinatura === SIGNATURE)!;
    expect(ret.de).toBe("AUTH_COMPROVADA");
    expect(ret.para).toBe("EXPOSICAO_COMPROVADA_CORRIGIDA");
    expect(ret.forward).toContain(VERSION);
  });

  it("o dossiê H9-E1 recebeu adendo corrigindo a conclusão falsa", () => {
    const dossie = read("restoration/homologacao-h9/06-h9e1-convergencia-fluxo-visita.md");
    expect(dossie).toContain("ADENDO H9-E1R");
    expect(dossie).toContain("07-h9e1r-retificacao-finish-visit.md");
  });
});

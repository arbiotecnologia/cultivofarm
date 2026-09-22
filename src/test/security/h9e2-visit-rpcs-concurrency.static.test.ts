import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * H9-E2 — gate estático da convergência de autorização e idempotência
 * concorrente das três RPCs de visita.
 *
 * O GO da H9-E1R era provisório: nas RPCs canônicas o lookup por `client_uuid`
 * ainda precedia o gate `_visita_scope_ok` (oráculo) e, no encerramento, a
 * busca idempotente precedia o `FOR UPDATE`, de modo que a segunda sessão
 * concorrente recebia `visit_not_in_progress`. O forward `20261023000000`
 * corrige os três corpos e foi aplicado uma única vez (ledger 678 -> 679).
 */

const ROOT = resolve(__dirname, "../../..");
const H9 = resolve(ROOT, "restoration/homologacao-h9");
const VERSION = "20261023000000";
const NAME = "h9e2_visit_rpcs_authz_and_concurrent_idempotency_v1";
const FORWARD = `restoration/homologacao-h9/h9e-forwards/${VERSION}_${NAME}.sql`;
const ROLLBACK = `restoration/homologacao-h9/h9e-rollbacks/${VERSION}_${NAME}_rollback.sql`;
const PROVA_CONC = `restoration/homologacao-h9/h9e-provas/h9e2-prova-concorrencia-multisessao.py`;
const PROVA_AUTHZ = `restoration/homologacao-h9/h9e-provas/h9e2-prova-authz-sem-oraculo.sql`;
const DOSSIE = `restoration/homologacao-h9/08-h9e2-authz-e-idempotencia-concorrente.md`;

const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const sha256 = (p: string) =>
  createHash("sha256").update(readFileSync(resolve(ROOT, p))).digest("hex");

const forward = read(FORWARD);
const rollback = read(ROLLBACK);
const provaConc = read(PROVA_CONC);
const provaAuthz = read(PROVA_AUTHZ);
const dossie = read(DOSSIE);

const manifest = JSON.parse(
  readFileSync(resolve(H9, "h9c-applied-forwards.json"), "utf8"),
) as {
  ledger_versoes: number;
  total_applied_forwards: number;
  entries: {
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
  }[];
};

/** Corpo de cada função dentro do forward, do CREATE ao fechamento $function$. */
function corpo(fn: string): string {
  const inicio = forward.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  expect(inicio, `${fn} ausente no forward`).toBeGreaterThan(0);
  const fim = forward.indexOf("$function$;", inicio);
  expect(fim, `${fn} sem fim de corpo`).toBeGreaterThan(inicio);
  return forward.slice(inicio, fim);
}

const FUNCOES = [
  "finish_technical_visit_secure",
  "rpc_realizar_checkin_visita",
  "rpc_realizar_checkout_visita",
] as const;

describe("H9-E2 — autorização antes de qualquer lookup de idempotência", () => {
  it.each(FUNCOES)("%s prova o escopo antes do primeiro SELECT sensível", (fn) => {
    const src = corpo(fn);
    const gate = src.indexOf("_visita_scope_ok(v_uid, p_registro_id)");
    const lookup = src.indexOf("WHERE client_uuid = p_client_uuid");
    const registro = src.indexOf("FROM public.registros_consultor");
    expect(gate).toBeGreaterThan(0);
    expect(lookup).toBeGreaterThan(gate);
    expect(registro).toBeGreaterThan(gate);
  });

  it.each(FUNCOES)("%s trava o registro antes da busca idempotente", (fn) => {
    const src = corpo(fn);
    const lock = src.indexOf("FOR UPDATE");
    const lookup = src.indexOf("WHERE client_uuid = p_client_uuid");
    expect(lock).toBeGreaterThan(0);
    expect(lookup).toBeGreaterThan(lock);
  });

  it.each(FUNCOES)("%s busca o vencedor antes de rejeitar por estado/ciclo", (fn) => {
    const src = corpo(fn);
    const lookup = src.indexOf("WHERE client_uuid = p_client_uuid");
    for (const erro of [
      "visit_not_in_progress",
      "checkout_duplicado",
      "checkin_duplicado_para_tipo_no_ciclo",
    ]) {
      const pos = src.indexOf(erro);
      if (pos > 0) expect(pos).toBeGreaterThan(lookup);
    }
  });

  it("as canônicas exigem client_uuid e o encerramento documenta a exceção", () => {
    for (const fn of ["rpc_realizar_checkin_visita", "rpc_realizar_checkout_visita"]) {
      expect(corpo(fn)).toContain("client_uuid_obrigatorio");
    }
    expect(corpo("finish_technical_visit_secure")).toContain(
      "nao existe chave de idempotencia",
    );
  });

  it("o encerramento grava o tipo canônico checkout", () => {
    const src = corpo("finish_technical_visit_secure");
    expect(src).toContain("'checkout'::public.tipo_checkin");
    expect(src).not.toContain("'inicio_visita', 'realizado'");
  });
});

describe("H9-E2 — guardas, contratos e ACL do forward", () => {
  it("valida os três baselines remotos antes de alterar qualquer coisa", () => {
    for (const md5 of [
      "20515c14cf017e68bebc8f99ba3cd00a",
      "e7e8720effb4341d8960d865503aedb8",
      "2b2cc2d7d51a37a515ef79823c28f690",
      "a68dc37ed14aadd2349415e5a52f2f4a",
      "3aa7f5ef96de3e4c4e3b1d5aa73ca16c",
      "d049e983b610f0c7423b12247cdffaf7",
    ]) {
      expect(forward).toContain(md5);
    }
    expect(forward).toContain("ledger esperado 678");
    expect(forward).toContain("ikaauvsflpmamgxmkhoq");
  });

  it("é forward-only, monotônico e sem transação interna", () => {
    expect(forward).not.toMatch(/^\s*BEGIN;/m);
    expect(forward).not.toMatch(/^\s*COMMIT;/m);
    expect(forward).not.toMatch(/DROP\s+FUNCTION/i);
    expect(VERSION > "20261022000000").toBe(true);
  });

  it("mantém ACL mínima, sem PUBLIC e sem anon", () => {
    for (const arquivo of [forward, rollback]) {
      expect(arquivo).toContain("REVOKE ALL ON FUNCTION");
      expect(arquivo).toContain("FROM anon;");
      expect(arquivo).toContain("TO authenticated, service_role;");
      expect(arquivo).not.toMatch(/GRANT EXECUTE[^\n]*TO anon/);
      expect(arquivo).not.toMatch(/GRANT EXECUTE[^\n]*TO PUBLIC/);
    }
  });

  it("a guarda pós exige a ordem canônica e os contratos preservados", () => {
    expect(forward).toContain("rejeita estado/ciclo antes da busca idempotente");
    expect(forward).toContain("com ordem invalida");
    expect(forward).toContain(
      "TABLE(registro_id uuid, checkout_id uuid, finalized_at timestamp with time zone)",
    );
  });

  it("o rollback restaura as três definições anteriores e não é executado", () => {
    for (const fn of FUNCOES) {
      expect(rollback).toContain(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    }
    expect(rollback).toContain("NAO executar agora");
    expect(rollback).toContain("append-only");
  });
});

describe("H9-E2 — provas de concorrência real e de autorização", () => {
  it("o harness usa duas conexões independentes, não Promise.all", () => {
    expect(provaConc).toContain("subprocess.Popen");
    expect(provaConc).toContain("Session(\"A\")");
    expect(provaConc).toContain("Session(\"B\")");
    expect(provaConc).toContain("bloqueou durante a retencao");
    expect(provaConc).toContain("MESMO resultado vencedor");
  });

  it("o harness limpa em finally, por UUID, sem desabilitar trigger ou RLS", () => {
    expect(provaConc).toContain("finally:");
    expect(provaConc).toContain("residuo zero apos limpeza");
    expect(provaConc).not.toMatch(/DISABLE\s+TRIGGER/i);
    expect(provaConc).not.toMatch(/session_replication_role/i);
    expect(provaConc).not.toMatch(/DELETE FROM public\.\w+;\s/);
  });

  it("cobre as três RPCs e registra a fixture determinística", () => {
    for (const fn of FUNCOES) expect(provaConc).toContain(fn);
    expect(provaConc).toContain("9e200001-0000-4000-8000-000000000001");
    expect(dossie).toContain("9e2c0001-0000-4000-8000-00000000000{1,2,3}");
  });

  it("a prova de autorização cobre as quatro combinações por RPC", () => {
    expect(provaAuthz).toContain("ghost:existente");
    expect(provaAuthz).toContain("alheio:aleatorio");
    expect(provaAuthz).toContain("4 combinacoes indistinguiveis");
    for (const caso of [
      "unauthenticated",
      "idempotency_conflict",
      "gps_ou_justificativa_obrigatorio",
      "client_uuid_obrigatorio",
      "visit_not_in_progress",
    ]) {
      expect(provaAuthz).toContain(caso);
    }
  });
});

describe("H9-E2 — rastreabilidade no manifesto e no ledger", () => {
  const entry = manifest.entries.filter((e) => e.version === VERSION);

  it("o manifesto registra a versão exatamente uma vez, no ledger 679", () => {
    expect(manifest.ledger_versoes).toBe(683);
    expect(entry).toHaveLength(1);
    expect(manifest.total_applied_forwards).toBe(manifest.entries.length);
  });

  it("os hashes do manifesto batem com os arquivos versionados", () => {
    const e = entry[0];
    expect(e.path).toBe(FORWARD);
    expect(e.sha256).toBe(sha256(FORWARD));
    expect(e.rollback_path).toBe(ROLLBACK);
    expect(e.rollback_sha256).toBe(sha256(ROLLBACK));
    expect(e.applied_to_staging).toBe(true);
    expect(e.registered_in_ledger).toBe(true);
    expect(e.repo_only_quarantined).toBe(false);
  });

  it("a evidência declara os fingerprints, o ledger e a prova multi-sessão", () => {
    const ev = entry[0].evidence_refs;
    expect(ev.ledger).toContain("678 -> 679");
    expect(ev.fingerprint).toContain("b007454aa21a70aa545ee0a5a100e22f");
    expect(ev.fingerprint).toContain("d929e5dc354f3a802b8ab2d41c3b466e");
    expect(ev.fingerprint).toContain("735ebbfad7106dac1f5e77218ed21f70");
    expect(ev.prova_antes).toContain("multi-sessao");
    expect(ev.prova_depois).toContain("13/13");
    expect(ev.acl).toContain("sem PUBLIC e sem anon");
  });

  it("o dossiê 07 anota que seu GO foi provisório e o 08 assume a fase", () => {
    const d07 = read("restoration/homologacao-h9/07-h9e1r-retificacao-finish-visit.md");
    expect(d07).toContain("ADENDO H9-E2");
    expect(d07).toContain("provisório");
    expect(dossie).toContain("GO em homologação");
    expect(dossie).toContain("Promoção para produção: NO-GO");
    expect(dossie).toContain("678 → **679**");
  });
});

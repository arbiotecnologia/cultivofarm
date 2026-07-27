// Testes contratuais Fase 3 — kit de implantação do Módulo de Comunicação.
// Somente leitura de arquivos; nenhum script é executado.
import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const KIT = resolve(__dirname, "../../../restoration/comunicacao-deploy");

function read(name: string): string {
  return readFileSync(resolve(KIT, name), "utf8");
}

const SHELLS = [
  "validate-staging.sh",
  "apply-staging.sh",
  "deploy-functions-staging.sh",
  "verify-staging.sh",
  "rollback-staging.sh",
];

describe("Fase 3 — kit de implantação (contratos)", () => {
  it("todos os scripts existem, são executáveis e usam bash estrito", () => {
    for (const f of SHELLS) {
      const s = read(f);
      expect(s.startsWith("#!/usr/bin/env bash"), `${f} shebang`).toBe(true);
      expect(s.includes("set -Eeuo pipefail"), `${f} strict mode`).toBe(true);
      // Sem set -x, eval, source arbitrário
      expect(/^\s*set\s+-x/m.test(s), `${f} sem set -x`).toBe(false);
      expect(/\beval\b/.test(s), `${f} sem eval`).toBe(false);
      expect(/^\s*(source|\.)\s+["$]/m.test(s), `${f} sem source arbitrário`).toBe(false);
      const mode = statSync(resolve(KIT, f)).mode & 0o111;
      expect(mode, `${f} executável`).toBeGreaterThan(0);
    }
  });

  it("validate-staging recusa o ref configurado por padrão", () => {
    const s = read("validate-staging.sh");
    expect(s).toMatch(/CONFIGURED_REF="navfzbwgwzruipouyfnk"/);
    expect(s).toMatch(/I_UNDERSTAND_CONFIGURED_REF_IS_STAGING/);
    expect(s).toMatch(/STAGING_PROJECT_REF.*!=.*STAGING_CONFIRM_REF/);
  });

  it("apply-staging chama validate antes de qualquer psql e roda ordem correta", () => {
    const s = read("apply-staging.sh");
    const idxValidate = s.indexOf("validate-staging.sh");
    const idxFirstPsql = s.indexOf("psql \"${STAGING_DB_URL}\"");
    expect(idxValidate).toBeGreaterThan(0);
    expect(idxFirstPsql).toBeGreaterThan(idxValidate);
    // Ordem: fase1/postcheck → fase2/precheck → migration → postcheck → harness
    const order = ["fase1/postcheck", "fase2/precheck", "fase2/migration", "fase2/postcheck", "fase2/harness"];
    let last = -1;
    for (const step of order) {
      const i = s.indexOf(step);
      expect(i, `passo ${step}`).toBeGreaterThan(last);
      last = i;
    }
    expect(s).toMatch(/APPLY_COMMUNICATION_SEEDS/);
    expect(s).toMatch(/ON_ERROR_STOP=1/);
    expect(s).toMatch(/--single-transaction/);
  });

  it("deploy-functions-staging publica apenas as duas funções autorizadas", () => {
    const s = read("deploy-functions-staging.sh");
    expect(s).toMatch(/readonly FUNCTIONS=\("communication-health" "process-communication-outbox"\)/);
    // Sem set-secrets nem override por env
    expect(/set-secrets/.test(s)).toBe(false);
    expect(/\$\{?FUNCTIONS_OVERRIDE/.test(s)).toBe(false);
    expect(s).toMatch(/validate-staging\.sh/);
  });

  it("rollback-staging exige ROLLBACK_COMMUNICATION=true e só roda Fase 2", () => {
    const s = read("rollback-staging.sh");
    expect(s).toMatch(/ROLLBACK_COMMUNICATION.*!=.*"true"/);
    expect(s).toMatch(/comunicacao-fase2/);
    expect(s).toMatch(/rollback\.sql/);
    expect(/comunicacao-fase1/.test(s)).toBe(false);
  });

  it("verify-staging faz SKIP explícito quando credencial de teste ausente", () => {
    const s = read("verify-staging.sh");
    expect(s).toMatch(/STAGING_TEST_USER_EMAIL/);
    expect(s).toMatch(/SKIP:/);
    expect(s).toMatch(/flags OFF/);
  });

  it("nenhum script imprime DSN, tokens ou senhas", () => {
    for (const f of SHELLS) {
      const s = read(f);
      expect(/echo\s+["'].*\$\{?STAGING_DB_URL/.test(s), `${f} não ecoa DSN`).toBe(false);
      expect(/echo\s+["'].*\$\{?INTERNAL_FUNCTION_SECRET/.test(s), `${f} não ecoa secret`).toBe(false);
      expect(/printf.*\$\{?STAGING_DB_URL/.test(s), `${f} não printfa DSN`).toBe(false);
    }
  });

  it("env.example lista apenas nomes/valores fictícios", () => {
    const s = read("env.example");
    expect(s).toMatch(/STAGING_PROJECT_REF=example-staging-ref/);
    expect(s).toMatch(/STAGING_CONFIRM_REF=example-staging-ref/);
    expect(s).toMatch(/I_UNDERSTAND_CONFIGURED_REF_IS_STAGING=false/);
    expect(s).toMatch(/ROLLBACK_COMMUNICATION=false/);
  });

  it("smoke-staging.sql roda em transação com ROLLBACK e não desabilita RLS", () => {
    const s = read("smoke-staging.sql");
    expect(s).toMatch(/BEGIN;/);
    expect(s).toMatch(/ROLLBACK;\s*$/);
    expect(/DISABLE ROW LEVEL SECURITY/i.test(s)).toBe(false);
    expect(/set_config\('request\.jwt/i.test(s)).toBe(false);
    expect(s).toMatch(/rpc_publish_communication_event_v2/);
    expect(s).toMatch(/rpc_set_communication_template_metadata/);
  });

  it("scheduling.md documenta as duas opções POST-only sem secret em SQL", () => {
    const s = read("scheduling.md");
    expect(s).toMatch(/Opção A/);
    expect(s).toMatch(/Opção B/);
    expect(s).toMatch(/POST-only|POST\b/);
    expect(s).toMatch(/INTERNAL_FUNCTION_SECRET/);
    expect(s).toMatch(/pausa/i);
    expect(s).toMatch(/rollback/i);
  });

  it("checklist manual cobre health, WA zero/N vars, opt-in, evento OS, worker, idempotência, dead-letter e in-app", () => {
    const s = read("checklist-manual.md");
    for (const kw of [
      "Saúde dos canais", "sem variáveis", "N variáveis",
      "verificação", "pronto_entrega", "Worker",
      "Idempotência", "dead_letter", "In-App", "advisory",
    ]) {
      expect(s.toLowerCase(), kw).toContain(kw.toLowerCase());
    }
  });

  it("runbook Fase 2.4/2.5 usa data real do projeto (2026-07-27)", () => {
    const s = readFileSync(
      resolve(__dirname, "../../../restoration/comunicacao-fase2/runbook.md"),
      "utf8",
    );
    expect(s).toMatch(/Fase 2\.4 — Hardening operacional \(2026-07-27\)/);
    expect(s).toMatch(/Fase 2\.5 — Correção pontual \(2026-07-27\)/);
    expect(/2026-08-11/.test(s)).toBe(false);
  });
});

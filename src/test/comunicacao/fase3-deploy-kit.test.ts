// Testes contratuais Fase 3 (v2) — kit de implantação do Módulo de Comunicação.
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

describe("Fase 3 v2 — kit de implantação (contratos)", () => {
  it("scripts existem, executáveis, bash estrito, sem set -x/eval/source arbitrário", () => {
    for (const f of SHELLS) {
      const s = read(f);
      expect(s.startsWith("#!/usr/bin/env bash"), `${f} shebang`).toBe(true);
      expect(s.includes("set -Eeuo pipefail"), `${f} strict mode`).toBe(true);
      expect(/^\s*set\s+-x/m.test(s), `${f} sem set -x`).toBe(false);
      expect(/\beval\b/.test(s), `${f} sem eval`).toBe(false);
      expect(/^\s*(source|\.)\s+["$]/m.test(s), `${f} sem source arbitrário`).toBe(false);
      const mode = statSync(resolve(KIT, f)).mode & 0o111;
      expect(mode, `${f} executável`).toBeGreaterThan(0);
    }
  });

  it("validate-staging: dependências condicionais (supabase só sob REQUIRE_SUPABASE_CLI)", () => {
    const s = read("validate-staging.sh");
    expect(s).toMatch(/CONFIGURED_REF="navfzbwgwzruipouyfnk"/);
    expect(s).toMatch(/I_UNDERSTAND_CONFIGURED_REF_IS_STAGING/);
    expect(s).toMatch(/STAGING_PROJECT_REF.*!=.*STAGING_CONFIRM_REF/);
    // psql sempre; supabase apenas se REQUIRE_SUPABASE_CLI=true
    expect(s).toMatch(/command -v psql[^\n]*\n[\s\S]*REQUIRE_SUPABASE_CLI/);
    expect(s).toMatch(/REQUIRE_SUPABASE_CLI:-false.*==.*"true"/s);
  });

  it("apply-staging: F1 postcheck; F2 precheck+migration+postcheck em transação única; harness depois; seeds SÓ Fase 2 e SÓ após harness", () => {
    const s = read("apply-staging.sh");

    // Ordem obrigatória
    const idxValidate  = s.indexOf("validate-staging.sh");
    const idxF1Post    = s.indexOf('fase1/postcheck');
    const idxAtomic    = s.indexOf('fase2/precheck+migration+postcheck');
    const idxHarness   = s.indexOf('fase2/harness');
    const idxSeeds     = s.indexOf('fase2/seeds');
    expect(idxValidate).toBeGreaterThan(0);
    expect(idxF1Post).toBeGreaterThan(idxValidate);
    expect(idxAtomic).toBeGreaterThan(idxF1Post);
    expect(idxHarness).toBeGreaterThan(idxAtomic);
    expect(idxSeeds).toBeGreaterThan(idxHarness);

    // Transação única para Fase 2: precheck+migration+postcheck no mesmo psql
    // (uma linha psql seguida de -f para cada). Detectamos pelos 3 -f consecutivos.
    expect(s).toMatch(
      /psql[^\n]*--single-transaction[\s\S]{0,200}precheck\.sql[\s\S]{0,200}migration\.sql[\s\S]{0,200}postcheck\.sql/,
    );

    // Proibições explícitas
    expect(/fase1\/seeds/.test(s), "não pode rodar seeds da Fase 1").toBe(false);
    expect(/F1.*seeds\.sql|comunicacao-fase1\/seeds\.sql/.test(s)).toBe(false);

    // Flags e psql seguros
    expect(s).toMatch(/APPLY_COMMUNICATION_SEEDS/);
    expect(s).toMatch(/ON_ERROR_STOP=1/);
    expect(s).toMatch(/--single-transaction/);
  });

  it("deploy-functions-staging publica apenas as duas funções e exige supabase CLI", () => {
    const s = read("deploy-functions-staging.sh");
    expect(s).toMatch(/readonly FUNCTIONS=\("communication-health" "process-communication-outbox"\)/);
    expect(s).toMatch(/REQUIRE_SUPABASE_CLI=true[\s\S]{0,60}validate-staging\.sh/);
    // Sem override por env/args; sem configuração de secrets
    expect(/\$\{?FUNCTIONS_OVERRIDE/.test(s)).toBe(false);
    expect(/supabase secrets set/.test(s)).toBe(false);
    expect(/--set-secrets/.test(s)).toBe(false);
  });

  it("rollback-staging: exige ROLLBACK_COMMUNICATION=true, só Fase 2, não menciona seeds Fase 1", () => {
    const s = read("rollback-staging.sh");
    expect(s).toMatch(/ROLLBACK_COMMUNICATION.*!=.*"true"/);
    expect(s).toMatch(/comunicacao-fase2/);
    expect(s).toMatch(/rollback\.sql/);
    expect(/comunicacao-fase1/.test(s)).toBe(false);
  });

  it("verify-staging: SEM tabela feature_flags; SEM STAGING_TEST_USER_*; usa STAGING_TEST_ADMIN_JWT", () => {
    const s = read("verify-staging.sh");
    // BUG antigo eliminado
    expect(/feature_flags/.test(s), "não deve consultar public.feature_flags").toBe(false);
    expect(/STAGING_TEST_USER_EMAIL/.test(s)).toBe(false);
    expect(/STAGING_TEST_USER_PASSWORD/.test(s)).toBe(false);

    // Novo fluxo real
    expect(s).toMatch(/STAGING_TEST_ADMIN_JWT/);
    expect(s).toMatch(/SKIP:.*communication-health/);
    expect(s).toMatch(/command -v curl/);
    expect(s).toMatch(/command -v jq/);
    expect(s).toMatch(/communication-health/);
    expect(s).toMatch(/Authorization: Bearer \$\{STAGING_TEST_ADMIN_JWT\}/);
    expect(s).toMatch(/-X POST/);
    expect(s).toMatch(/https:\/\/\$\{STAGING_PROJECT_REF\}\.functions\.supabase\.co/);
    // Validação estrita das flags OFF via jq
    expect(s).toMatch(/\.ok == true/);
    expect(s).toMatch(/\.delivery_enabled == false/);
    expect(s).toMatch(/\.email\.enabled == false/);
    expect(s).toMatch(/\.whatsapp\.enabled == false/);
    expect(s).toMatch(/\.in_app\.enabled == false/);
    // Nunca imprime JWT/body
    expect(/echo.*STAGING_TEST_ADMIN_JWT/.test(s)).toBe(false);
    expect(/printf.*STAGING_TEST_ADMIN_JWT/.test(s)).toBe(false);
    expect(/cat +"\$tmp_body"/.test(s)).toBe(false);
  });

  it("env.example: sem credenciais email/password; apenas STAGING_TEST_ADMIN_JWT vazio", () => {
    const s = read("env.example");
    expect(s).toMatch(/STAGING_PROJECT_REF=example-staging-ref/);
    expect(s).toMatch(/STAGING_CONFIRM_REF=example-staging-ref/);
    expect(s).toMatch(/I_UNDERSTAND_CONFIGURED_REF_IS_STAGING=false/);
    expect(s).toMatch(/ROLLBACK_COMMUNICATION=false/);
    expect(s).toMatch(/^STAGING_TEST_ADMIN_JWT=\s*$/m);
    expect(/STAGING_TEST_USER_EMAIL/.test(s)).toBe(false);
    expect(/STAGING_TEST_USER_PASSWORD/.test(s)).toBe(false);
  });

  it("smoke-staging.sql: read-only puro; sem WHEN OTHERS, sem os_pronto_entrega, sem RPCs admin", () => {
    const s = read("smoke-staging.sql");
    expect(s).toMatch(/BEGIN;/);
    expect(s).toMatch(/ROLLBACK;\s*$/);
    expect(/DISABLE ROW LEVEL SECURITY/i.test(s)).toBe(false);
    expect(/set_config\('request\.jwt/i.test(s)).toBe(false);

    // Proibições dos bugs anteriores
    expect(/WHEN OTHERS/i.test(s), "não pode capturar WHEN OTHERS").toBe(false);
    expect(/os_pronto_entrega/.test(s), "event key inexistente proibido").toBe(false);
    expect(/PERFORM +public\.rpc_publish_communication_event_v2/.test(s)).toBe(false);
    expect(/PERFORM +public\.rpc_set_communication_template_metadata/.test(s)).toBe(false);

    // Contratos exigidos
    expect(s).toMatch(/to_regprocedure/);
    expect(s).toMatch(/pg_proc/);
    expect(s).toMatch(/routine_privileges/);
    expect(s).toMatch(/grantee='authenticated'/);
    expect(s).toMatch(/grantee='service_role'/);
    expect(s).toMatch(/grantee='anon'/);
    expect(s).toMatch(/relrowsecurity/);
    expect(s).toMatch(/pg_trigger/);
    expect(s).toMatch(/pg_constraint/);
    expect(s).toMatch(/pg_get_functiondef/);
    expect(s).toMatch(/idempotency_key/);
    expect(s).toMatch(/parameter_mapping/);
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

  it("checklist manual cobre health, WA zero/N vars, opt-in, evento OS, worker, idempotência, dead-letter, in-app", () => {
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

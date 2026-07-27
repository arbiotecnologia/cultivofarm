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

  it("validate-staging: regex fechada de PROJECT_REF; DB e Supabase CLI condicionais", () => {
    const s = read("validate-staging.sh");
    expect(s).toMatch(/CONFIGURED_REF="navfzbwgwzruipouyfnk"/);
    expect(s).toMatch(/I_UNDERSTAND_CONFIGURED_REF_IS_STAGING/);
    expect(s).toMatch(/STAGING_PROJECT_REF.*!=.*STAGING_CONFIRM_REF/);
    // Regex fechada Supabase ref (20 chars lowercase alfanumérico), aplicada a AMBOS.
    expect(s).toMatch(/STAGING_PROJECT_REF.*=~.*\^\[a-z0-9\]\{20\}\$/);
    expect(s).toMatch(/STAGING_CONFIRM_REF.*=~.*\^\[a-z0-9\]\{20\}\$/);
    // Dependências condicionais
    expect(s).toMatch(/REQUIRE_DATABASE:-true.*==.*"true"/s);
    expect(s).toMatch(/REQUIRE_SUPABASE_CLI:-false.*==.*"true"/s);
    // psql e STAGING_DB_URL só aparecem dentro do bloco REQUIRE_DATABASE
    const dbBlock = s.split(/REQUIRE_DATABASE:-true/)[1]?.split(/REQUIRE_SUPABASE_CLI/)[0] ?? "";
    expect(dbBlock).toMatch(/command -v psql/);
    expect(dbBlock).toMatch(/STAGING_DB_URL/);
  });

  it("apply-staging: passa REQUIRE_DATABASE=true; F1 postcheck; F2 tx única; harness; seeds só Fase 2 após harness", () => {
    const s = read("apply-staging.sh");
    expect(s).toMatch(/REQUIRE_DATABASE=true\s+bash\s+"\$\{HERE\}\/validate-staging\.sh"/);

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

    expect(s).toMatch(
      /run_files_atomic\s+"fase2\/precheck\+migration\+postcheck"\s+\\\s*\n\s*"\$\{F2\}\/precheck\.sql"\s+"\$\{F2\}\/migration\.sql"\s+"\$\{F2\}\/postcheck\.sql"/,
    );
    expect(s).toMatch(/psql[^\n]*--single-transaction[\s\S]{0,120}"\$\{args\[@\]\}"/);

    expect(/fase1\/seeds/.test(s), "não pode rodar seeds da Fase 1").toBe(false);
    expect(/F1.*seeds\.sql|comunicacao-fase1\/seeds\.sql/.test(s)).toBe(false);

    expect(s).toMatch(/APPLY_COMMUNICATION_SEEDS/);
    expect(s).toMatch(/ON_ERROR_STOP=1/);
    expect(s).toMatch(/--single-transaction/);
  });

  it("deploy-functions-staging publica as três funções (Fase 4 incluída), exige CLI e NÃO exige DB", () => {
    const s = read("deploy-functions-staging.sh");
    expect(s).toMatch(/readonly FUNCTIONS=\("communication-health" "process-communication-outbox" "whatsapp-status-webhook"\)/);
    // CLI obrigatória e DB desligado — deploy não precisa de DSN Postgres.
    expect(s).toMatch(/REQUIRE_SUPABASE_CLI=true\s+REQUIRE_DATABASE=false\s+bash[^\n]*validate-staging\.sh/);
    expect(/\$\{?FUNCTIONS_OVERRIDE/.test(s)).toBe(false);
    expect(/supabase secrets set/.test(s)).toBe(false);
    expect(/--set-secrets/.test(s)).toBe(false);
  });

  it("rollback-staging: exige DB (REQUIRE_DATABASE=true), ROLLBACK_COMMUNICATION=true, só Fase 2", () => {
    const s = read("rollback-staging.sh");
    expect(s).toMatch(/REQUIRE_DATABASE=true\s+bash\s+"\$\{HERE\}\/validate-staging\.sh"/);
    expect(s).toMatch(/ROLLBACK_COMMUNICATION.*!=.*"true"/);
    expect(s).toMatch(/comunicacao-fase2/);
    expect(s).toMatch(/rollback\.sql/);
    expect(/comunicacao-fase1/.test(s)).toBe(false);
  });

  it("verify-staging: exige DB; roda smoke sempre; health opcional; endpoint OFICIAL e SEM STAGING_API_URL", () => {
    const s = read("verify-staging.sh");
    // DB obrigatório na validação
    expect(s).toMatch(/REQUIRE_DATABASE=true\s+bash\s+"\$\{HERE\}\/validate-staging\.sh"/);

    // Bugs antigos eliminados
    expect(/feature_flags/.test(s), "não deve consultar public.feature_flags").toBe(false);
    expect(/STAGING_TEST_USER_EMAIL/.test(s)).toBe(false);
    expect(/STAGING_TEST_USER_PASSWORD/.test(s)).toBe(false);
    // Endpoint incorreto e variável exfiltrável — PROIBIDOS.
    expect(/functions\.supabase\.co/.test(s), "domínio functions.supabase.co é incorreto").toBe(false);
    expect(/STAGING_API_URL/.test(s), "STAGING_API_URL permite exfiltração").toBe(false);

    // Endpoint OFICIAL derivado internamente do ref já validado.
    expect(s).toMatch(
      /API_URL="https:\/\/\$\{STAGING_PROJECT_REF\}\.supabase\.co\/functions\/v1"/,
    );
    expect(s).toMatch(/"\$\{API_URL\}\/communication-health"/);

    // Smoke read-only obrigatório (mesmo sem JWT): rodado após o harness
    // e antes do gate de STAGING_TEST_ADMIN_JWT.
    expect(s).toMatch(/smoke-staging\.sql/);
    expect(s).toMatch(/run_file\s+"smoke-staging"/);
    const idxHarness = s.indexOf('run_file "fase2/harness"');
    const idxSmoke   = s.indexOf('run_file "smoke-staging"');
    const idxJwtGate = s.search(/STAGING_TEST_ADMIN_JWT:-/);
    expect(idxHarness).toBeGreaterThan(0);
    expect(idxSmoke).toBeGreaterThan(idxHarness);
    expect(idxJwtGate).toBeGreaterThan(idxSmoke);

    // Fluxo real do health
    expect(s).toMatch(/STAGING_TEST_ADMIN_JWT/);
    expect(s).toMatch(/SKIP:.*communication-health/);
    expect(s).toMatch(/command -v curl/);
    expect(s).toMatch(/command -v jq/);
    expect(s).toMatch(/Authorization: Bearer \$\{STAGING_TEST_ADMIN_JWT\}/);
    expect(s).toMatch(/-X POST/);
    // Validação estrita das flags OFF via jq
    expect(s).toMatch(/\.ok == true/);
    expect(s).toMatch(/\.delivery_enabled == false/);
    expect(s).toMatch(/\.email\.enabled == false/);
    expect(s).toMatch(/\.whatsapp\.enabled == false/);
    expect(s).toMatch(/\.in_app\.enabled == false/);
    // Mensagens finais indicam completo/parcial
    expect(s).toMatch(/verify concluído \(parcial/);
    expect(s).toMatch(/verify concluído \(completo/);
    // Nunca imprime JWT/body
    expect(/echo.*STAGING_TEST_ADMIN_JWT/.test(s)).toBe(false);
    expect(/printf.*STAGING_TEST_ADMIN_JWT/.test(s)).toBe(false);
    expect(/cat +"\$tmp_body"/.test(s)).toBe(false);
  });

  it("env.example: sem STAGING_API_URL nem credenciais email/password; JWT vazio", () => {
    const s = read("env.example");
    expect(s).toMatch(/STAGING_PROJECT_REF=example-staging-ref/);
    expect(s).toMatch(/STAGING_CONFIRM_REF=example-staging-ref/);
    expect(s).toMatch(/I_UNDERSTAND_CONFIGURED_REF_IS_STAGING=false/);
    expect(s).toMatch(/ROLLBACK_COMMUNICATION=false/);
    expect(s).toMatch(/^STAGING_TEST_ADMIN_JWT=\s*$/m);
    expect(/STAGING_TEST_USER_EMAIL/.test(s)).toBe(false);
    expect(/STAGING_TEST_USER_PASSWORD/.test(s)).toBe(false);
    expect(/STAGING_API_URL/.test(s), "STAGING_API_URL não pode existir").toBe(false);
    expect(/functions\.supabase\.co/.test(s), "domínio incorreto").toBe(false);
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

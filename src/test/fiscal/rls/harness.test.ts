/**
 * Fase Fiscal 3.0 — vitest do harness RLS.
 *
 * Ambientes sem envs de staging => skip explícito com aviso claro.
 * NUNCA executa contra o projeto real. NUNCA cria usuários.
 */
import { describe, test, expect } from "vitest";
import { MATRIX, VIEW_MATRIX, RPC_EXPECTATIONS } from "./matrix";
import { loadRunnerConfigFromEnv, runCellRest, runViewCell, summarize } from "./runner";

const cfg = loadRunnerConfigFromEnv();

describe("Fase Fiscal 3.0 — Harness RLS runtime", () => {
  test("matriz declarativa cobre 15 perfis × 9 tabelas × 4 operações", () => {
    expect(MATRIX.length).toBe(15 * 9 * 4);
    expect(VIEW_MATRIX.length).toBe(15 * 5);
    expect(RPC_EXPECTATIONS.length).toBe(15);
  });

  test.runIf(cfg !== null)("execução runtime — tabelas via PostgREST", async () => {
    if (!cfg) return;
    const results = await Promise.all(MATRIX.map((cell) => runCellRest(cfg, cell)));
    const s = summarize(results);
    if (s.failed.length > 0) {
      console.error("[RLS harness] falhas:", s.failed);
    }
    expect(s.failed).toHaveLength(0);
  }, 120_000);

  test.runIf(cfg !== null)("execução runtime — views via PostgREST", async () => {
    if (!cfg) return;
    const results = await Promise.all(VIEW_MATRIX.map((cell) => runViewCell(cfg, cell)));
    const s = summarize(results);
    if (s.failed.length > 0) {
      console.error("[RLS harness views] falhas:", s.failed);
    }
    expect(s.failed).toHaveLength(0);
  }, 60_000);

  test.skipIf(cfg !== null)(
    "EXECUÇÃO RUNTIME PENDENTE EM STAGING — defina PGURL_STAGING/PGREST_STAGING/PGREST_ANON_KEY + JWT_<ROLE>",
    () => {
      // Skip explícito. Documentado em docs/fiscal-fase3-0-rls-harness.md.
      expect(true).toBe(true);
    },
  );
});
